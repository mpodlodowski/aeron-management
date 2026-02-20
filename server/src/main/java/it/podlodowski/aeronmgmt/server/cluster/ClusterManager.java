package it.podlodowski.aeronmgmt.server.cluster;

import it.podlodowski.aeronmgmt.common.proto.CommandResult;
import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import it.podlodowski.aeronmgmt.server.aggregator.ClusterStateAggregator;
import it.podlodowski.aeronmgmt.server.aggregator.DiskUsageTracker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Central coordinator for multi-cluster support.
 * Holds per-cluster {@link ClusterStateAggregator} instances and routes
 * metrics, connections, and command results to the correct cluster.
 */
@Component
public class ClusterManager {

    private static final Logger LOGGER = LoggerFactory.getLogger(ClusterManager.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final int historySeconds;
    private final ConcurrentHashMap<String, ClusterStateAggregator> clusters = new ConcurrentHashMap<>();

    @Autowired
    public ClusterManager(
            @Autowired(required = false) SimpMessagingTemplate messagingTemplate,
            @Value("${aeron.management.server.metrics-history-seconds:300}") int historySeconds) {
        this.messagingTemplate = messagingTemplate;
        this.historySeconds = historySeconds;
    }

    public ClusterStateAggregator getOrCreateCluster(String clusterId) {
        ClusterStateAggregator aggregator = clusters.computeIfAbsent(clusterId, id -> {
            LOGGER.info("Creating new cluster aggregator for clusterId={}", id);
            return new ClusterStateAggregator(messagingTemplate, new DiskUsageTracker(), historySeconds, id);
        });
        pushClusterList();
        return aggregator;
    }

    public ClusterStateAggregator getCluster(String clusterId) {
        return clusters.get(clusterId);
    }

    public Set<String> getAllClusterIds() {
        return clusters.keySet();
    }

    public List<Map<String, Object>> getAllClusterOverviews() {
        List<Map<String, Object>> overviews = new ArrayList<>();
        for (Map.Entry<String, ClusterStateAggregator> entry : clusters.entrySet()) {
            Map<String, Object> overview = entry.getValue().buildClusterOverview();
            overview.put("clusterId", entry.getKey());
            overviews.add(overview);
        }
        return overviews;
    }

    public void onMetricsReceived(String clusterId, MetricsReport report) {
        getOrCreateCluster(clusterId).onMetricsReceived(report);
    }

    public void onAgentConnected(String clusterId, int nodeId, String agentMode) {
        getOrCreateCluster(clusterId).onAgentConnected(nodeId, agentMode);
        pushClusterList();
    }

    public void onAgentDisconnected(String clusterId, int nodeId) {
        ClusterStateAggregator aggregator = clusters.get(clusterId);
        if (aggregator != null) {
            aggregator.onAgentDisconnected(nodeId);
        }
        pushClusterList();
    }

    /**
     * Fans out command result to ALL aggregators since command UUIDs are globally unique.
     */
    public void onCommandResult(CommandResult result) {
        for (ClusterStateAggregator aggregator : clusters.values()) {
            aggregator.onCommandResult(result);
        }
    }

    public CompletableFuture<CommandResult> registerPendingCommand(String clusterId, String commandId) {
        ClusterStateAggregator aggregator = clusters.get(clusterId);
        if (aggregator != null) {
            return aggregator.registerPendingCommand(commandId);
        }
        return new CompletableFuture<>();
    }

    private void pushClusterList() {
        if (messagingTemplate != null) {
            try {
                messagingTemplate.convertAndSend("/topic/clusters", getAllClusterOverviews());
            } catch (Exception e) {
                LOGGER.debug("Failed to push cluster list to WebSocket: {}", e.getMessage());
            }
        }
    }
}

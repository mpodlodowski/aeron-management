package it.podlodowski.aeronmgmt.server.grpc;

import io.grpc.stub.StreamObserver;
import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import it.podlodowski.aeronmgmt.common.proto.ServerMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class AgentRegistry {

    private static final Logger LOGGER = LoggerFactory.getLogger(AgentRegistry.class);

    private final ConcurrentHashMap<String, ConcurrentHashMap<Integer, AgentConnection>> connections =
            new ConcurrentHashMap<>();

    public void register(String clusterId, int nodeId, String agentMode, String hostname,
                         StreamObserver<ServerMessage> responseObserver) {
        AgentConnection connection = new AgentConnection(clusterId, nodeId, agentMode, hostname, responseObserver);
        connections.computeIfAbsent(clusterId, k -> new ConcurrentHashMap<>())
                .put(nodeId, connection);
        LOGGER.info("Agent registered: clusterId={}, nodeId={}, mode={}, hostname={}",
                clusterId, nodeId, agentMode, hostname);
    }

    public void unregister(String clusterId, int nodeId) {
        ConcurrentHashMap<Integer, AgentConnection> clusterConnections = connections.get(clusterId);
        if (clusterConnections != null) {
            AgentConnection removed = clusterConnections.remove(nodeId);
            if (removed != null) {
                LOGGER.info("Agent unregistered: clusterId={}, nodeId={}", clusterId, nodeId);
            }
            if (clusterConnections.isEmpty()) {
                connections.remove(clusterId, clusterConnections);
            }
        }
    }

    public AgentConnection get(String clusterId, int nodeId) {
        ConcurrentHashMap<Integer, AgentConnection> clusterConnections = connections.get(clusterId);
        if (clusterConnections == null) {
            return null;
        }
        return clusterConnections.get(nodeId);
    }

    public Collection<AgentConnection> getAll(String clusterId) {
        ConcurrentHashMap<Integer, AgentConnection> clusterConnections = connections.get(clusterId);
        if (clusterConnections == null) {
            return Collections.emptyList();
        }
        return Collections.unmodifiableCollection(clusterConnections.values());
    }

    public List<Integer> getNodeIds(String clusterId) {
        ConcurrentHashMap<Integer, AgentConnection> clusterConnections = connections.get(clusterId);
        if (clusterConnections == null) {
            return List.of();
        }
        return List.copyOf(clusterConnections.keySet());
    }

    public static class AgentConnection {
        private final String clusterId;
        private final int nodeId;
        private final String agentMode;
        private final String hostname;
        private final StreamObserver<ServerMessage> responseObserver;
        private volatile MetricsReport latestMetrics;

        public AgentConnection(String clusterId, int nodeId, String agentMode, String hostname,
                               StreamObserver<ServerMessage> responseObserver) {
            this.clusterId = clusterId;
            this.nodeId = nodeId;
            this.agentMode = agentMode;
            this.hostname = hostname;
            this.responseObserver = responseObserver;
        }

        public String getClusterId() {
            return clusterId;
        }

        public int getNodeId() {
            return nodeId;
        }

        public String getAgentMode() {
            return agentMode;
        }

        public String getHostname() {
            return hostname;
        }

        public StreamObserver<ServerMessage> getResponseObserver() {
            return responseObserver;
        }

        public MetricsReport getLatestMetrics() {
            return latestMetrics;
        }

        public void setLatestMetrics(MetricsReport latestMetrics) {
            this.latestMetrics = latestMetrics;
        }
    }
}

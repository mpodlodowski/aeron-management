package it.podlodowski.aeronmgmt.server.aggregator;

import it.podlodowski.aeronmgmt.common.proto.ClusterMetrics;
import it.podlodowski.aeronmgmt.common.proto.CommandResult;
import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
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
 * Aggregates cluster state from all connected agents.
 * Maintains per-node rolling metrics windows and pushes updates via WebSocket.
 */
@Component
public class ClusterStateAggregator {

    private static final Logger LOGGER = LoggerFactory.getLogger(ClusterStateAggregator.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final long windowDurationMs;

    private static final int MAX_EVENTS = 200;

    private final ConcurrentHashMap<Integer, MetricsWindow> metricsWindows = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, MetricsReport> latestMetrics = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, CompletableFuture<CommandResult>> pendingCommands = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, String> nodeAgentModes = new ConcurrentHashMap<>();
    private final Set<Integer> connectedNodes = ConcurrentHashMap.newKeySet();
    private final Set<Integer> reachableNodes = ConcurrentHashMap.newKeySet();
    private final LinkedList<Map<String, Object>> recentEvents = new LinkedList<>();

    @Autowired
    public ClusterStateAggregator(
            @Autowired(required = false) SimpMessagingTemplate messagingTemplate,
            @Value("${management.metrics.history-seconds:300}") int historySeconds) {
        this.messagingTemplate = messagingTemplate;
        this.windowDurationMs = historySeconds * 1000L;
    }

    public void onMetricsReceived(MetricsReport report) {
        int nodeId = report.getNodeId();

        MetricsReport previous = latestMetrics.put(nodeId, report);
        metricsWindows.computeIfAbsent(nodeId, id -> new MetricsWindow(windowDurationMs))
                .add(report);

        detectStateChanges(nodeId, previous, report);
        detectNodeReachability(nodeId, report);

        LOGGER.debug("Metrics received from node {}", nodeId);

        pushToWebSocket("/topic/nodes/" + nodeId, convertMetricsToMap(report));
        pushToWebSocket("/topic/cluster", buildClusterOverview());
    }

    public void onCommandResult(CommandResult result) {
        LOGGER.info("Command result received: id={}, success={}", result.getCommandId(), result.getSuccess());
        CompletableFuture<CommandResult> future = pendingCommands.remove(result.getCommandId());
        if (future != null) {
            future.complete(result);
        }
    }

    public void onAgentConnected(int nodeId, String agentMode) {
        LOGGER.info("Agent connected: nodeId={}, mode={}", nodeId, agentMode);
        connectedNodes.add(nodeId);
        nodeAgentModes.put(nodeId, agentMode);
        emitAlert("AGENT_CONNECTED", nodeId, "connected");
        pushToWebSocket("/topic/cluster", buildClusterOverview());
    }

    public void onAgentDisconnected(int nodeId) {
        LOGGER.info("Agent disconnected: nodeId={}", nodeId);
        connectedNodes.remove(nodeId);
        reachableNodes.remove(nodeId);
        emitAlert("AGENT_DISCONNECTED", nodeId, "agent disconnected");
        pushToWebSocket("/topic/cluster", buildClusterOverview());
    }

    private void detectStateChanges(int nodeId, MetricsReport previous, MetricsReport current) {
        if ("backup".equals(nodeAgentModes.get(nodeId))) {
            return;
        }
        if (previous == null || !previous.hasClusterMetrics() || !current.hasClusterMetrics()) {
            return;
        }
        ClusterMetrics prev = previous.getClusterMetrics();
        ClusterMetrics curr = current.getClusterMetrics();

        // Role change (e.g. FOLLOWER -> LEADER)
        if (!prev.getNodeRole().equals(curr.getNodeRole())) {
            emitAlert("ROLE_CHANGE", nodeId,
                    "role changed: " + prev.getNodeRole() + " \u2192 " + curr.getNodeRole());

            if ("LEADER".equals(curr.getNodeRole())) {
                emitAlert("LEADER_CHANGE", nodeId, "became the new leader");
            }
        }

        // Election state change (anything != CLOSED means election in progress)
        if (!prev.getElectionState().equals(curr.getElectionState())
                && !"17".equals(curr.getElectionState())) {
            emitAlert("ELECTION_STARTED", nodeId,
                    "election state: " + curr.getElectionState());
        }
    }

    private void detectNodeReachability(int nodeId, MetricsReport report) {
        boolean hasCounters = report.getCountersCount() > 0;
        boolean wasReachable = reachableNodes.contains(nodeId);

        if (hasCounters && !wasReachable) {
            reachableNodes.add(nodeId);
            emitAlert("NODE_UP", nodeId, "node is reachable");
        } else if (!hasCounters && wasReachable) {
            reachableNodes.remove(nodeId);
            emitAlert("NODE_DOWN", nodeId, "node is unreachable (CnC unavailable)");
        }
    }

    private void emitAlert(String type, int nodeId, String message) {
        Map<String, Object> alert = new LinkedHashMap<>();
        alert.put("type", type);
        alert.put("nodeId", nodeId);
        alert.put("timestamp", System.currentTimeMillis());
        alert.put("message", message);

        synchronized (recentEvents) {
            recentEvents.addFirst(alert);
            while (recentEvents.size() > MAX_EVENTS) {
                recentEvents.removeLast();
            }
        }

        pushToWebSocket("/topic/alerts", alert);
    }

    public List<Map<String, Object>> getRecentEvents() {
        synchronized (recentEvents) {
            return new ArrayList<>(recentEvents);
        }
    }

    public CompletableFuture<CommandResult> registerPendingCommand(String commandId) {
        CompletableFuture<CommandResult> future = new CompletableFuture<>();
        pendingCommands.put(commandId, future);
        return future;
    }

    public Map<Integer, MetricsReport> getLatestMetrics() {
        return Collections.unmodifiableMap(new HashMap<>(latestMetrics));
    }

    public MetricsReport getLatestMetrics(int nodeId) {
        return latestMetrics.get(nodeId);
    }

    public Map<String, Object> buildClusterOverview() {
        Map<String, Object> overview = new LinkedHashMap<>();
        Map<String, Map<String, Object>> nodes = new LinkedHashMap<>();

        int leaderNodeId = -1;

        for (Map.Entry<Integer, MetricsReport> entry : latestMetrics.entrySet()) {
            MetricsReport report = entry.getValue();

            if (!"backup".equals(nodeAgentModes.get(report.getNodeId()))
                    && report.hasClusterMetrics()
                    && "LEADER".equals(report.getClusterMetrics().getNodeRole())) {
                leaderNodeId = report.getNodeId();
            }

            nodes.put(String.valueOf(report.getNodeId()), convertMetricsToMap(report));
        }

        overview.put("nodeCount", nodes.size());
        overview.put("leaderNodeId", leaderNodeId);
        overview.put("nodes", nodes);

        return overview;
    }

    /**
     * Converts a MetricsReport protobuf to a JSON-friendly Map structure.
     */
    public Map<String, Object> convertMetricsToMap(MetricsReport report) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("nodeId", report.getNodeId());
        result.put("timestamp", report.getTimestamp());
        result.put("agentConnected", connectedNodes.contains(report.getNodeId()));
        result.put("nodeReachable", reachableNodes.contains(report.getNodeId()));
        String agentMode = nodeAgentModes.get(report.getNodeId());
        if (agentMode != null) {
            result.put("agentMode", agentMode);
        }

        if (report.hasClusterMetrics()) {
            ClusterMetrics cm = report.getClusterMetrics();
            Map<String, Object> cluster = new LinkedHashMap<>();
            cluster.put("nodeRole", cm.getNodeRole());
            cluster.put("commitPosition", cm.getCommitPosition());
            cluster.put("logPosition", cm.getLogPosition());
            cluster.put("appendPosition", cm.getAppendPosition());
            cluster.put("leaderMemberId", cm.getLeaderMemberId());
            cluster.put("connectedClientCount", cm.getConnectedClientCount());
            cluster.put("electionState", cm.getElectionState());
            result.put("clusterMetrics", cluster);
        }

        List<Map<String, Object>> counters = new ArrayList<>();
        for (var counter : report.getCountersList()) {
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("counterId", counter.getCounterId());
            c.put("label", counter.getLabel());
            c.put("value", counter.getValue());
            c.put("typeId", counter.getTypeId());
            counters.add(c);
        }
        result.put("counters", counters);

        List<Map<String, Object>> recordings = new ArrayList<>();
        for (var rec : report.getRecordingsList()) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("recordingId", rec.getRecordingId());
            r.put("streamId", rec.getStreamId());
            r.put("channel", rec.getChannel());
            r.put("startPosition", rec.getStartPosition());
            r.put("stopPosition", rec.getStopPosition());
            r.put("startTimestamp", rec.getStartTimestamp());
            r.put("stopTimestamp", rec.getStopTimestamp());
            recordings.add(r);
        }
        result.put("recordings", recordings);

        if (report.hasSystemMetrics()) {
            Map<String, Object> sys = new LinkedHashMap<>();
            sys.put("heapUsedBytes", report.getSystemMetrics().getHeapUsedBytes());
            sys.put("heapMaxBytes", report.getSystemMetrics().getHeapMaxBytes());
            sys.put("cpuUsage", report.getSystemMetrics().getCpuUsage());
            sys.put("gcCount", report.getSystemMetrics().getGcCount());
            sys.put("gcTimeMs", report.getSystemMetrics().getGcTimeMs());
            result.put("systemMetrics", sys);
        }

        return result;
    }

    private void pushToWebSocket(String destination, Object payload) {
        if (messagingTemplate != null) {
            try {
                messagingTemplate.convertAndSend(destination, payload);
            } catch (Exception e) {
                LOGGER.debug("Failed to push to WebSocket {}: {}", destination, e.getMessage());
            }
        }
    }
}

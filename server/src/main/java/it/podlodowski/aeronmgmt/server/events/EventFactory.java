package it.podlodowski.aeronmgmt.server.events;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

public final class EventFactory {

    private static final String ARROW = " \u2192 ";

    private EventFactory() {
    }

    // ── Cluster-level events ──────────────────────────────────────────

    public static ClusterEvent clusterStart(String clusterId, long startTimestampMs) {
        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.ofEpochMilli(startTimestampMs))
                .level(EventLevel.CLUSTER)
                .type("CLUSTER_START")
                .message("Cluster started")
                .source(EventSource.RECONCILIATION)
                .build();
    }

    public static ClusterEvent snapshotTaken(String clusterId, int nodeId, long termId, long logPosition) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("termId", termId);
        details.put("logPosition", logPosition);

        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.CLUSTER)
                .type("SNAPSHOT_TAKEN")
                .nodeId(nodeId)
                .message("Snapshot taken on node " + nodeId + " at term " + termId + ", position " + logPosition)
                .details(details)
                .build();
    }

    public static ClusterEvent consensusEstablished(String clusterId) {
        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.CLUSTER)
                .type("CONSENSUS_ESTABLISHED")
                .message("Cluster consensus established")
                .build();
    }

    public static ClusterEvent consensusLost(String clusterId) {
        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.CLUSTER)
                .type("CONSENSUS_LOST")
                .message("Cluster consensus lost")
                .build();
    }

    public static ClusterEvent clusterAction(String clusterId, String action, String username) {
        String type = mapClusterActionType(action);

        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.CLUSTER)
                .type(type)
                .message("Cluster action: " + action.toLowerCase())
                .username(username)
                .details(Map.of("action", action))
                .build();
    }

    public static ClusterEvent monitoringGap(String clusterId, int nodeId, long gapStartMs, long gapEndMs) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("gapStart", gapStartMs);
        details.put("gapEnd", gapEndMs);

        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.AGENT)
                .type("MONITORING_GAP")
                .nodeId(nodeId)
                .message("Monitoring gap detected on node " + nodeId + " (" + (gapEndMs - gapStartMs) + "ms)")
                .details(details)
                .build();
    }

    // ── Node-level events ─────────────────────────────────────────────

    public static ClusterEvent roleChange(String clusterId, int nodeId, String from, String to) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("from", from);
        details.put("to", to);

        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.NODE)
                .type("ROLE_CHANGE")
                .nodeId(nodeId)
                .message("Node " + nodeId + " role changed: " + from + ARROW + to)
                .details(details)
                .build();
    }

    public static ClusterEvent leaderElected(String clusterId, int nodeId, long termId, int previousLeaderId) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("termId", termId);
        details.put("previousLeaderId", previousLeaderId);

        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.NODE)
                .type("LEADER_ELECTED")
                .nodeId(nodeId)
                .message("Node " + nodeId + " elected as leader for term " + termId)
                .details(details)
                .build();
    }

    public static ClusterEvent electionStarted(String clusterId, int nodeId, String electionState) {
        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.NODE)
                .type("ELECTION_STARTED")
                .nodeId(nodeId)
                .message("Election started on node " + nodeId + " (state: " + electionState + ")")
                .details(Map.of("electionState", electionState))
                .build();
    }

    public static ClusterEvent electionCompleted(String clusterId, int nodeId, long electionCount, long durationMs) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("electionCount", electionCount);
        details.put("durationMs", durationMs);

        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.NODE)
                .type("ELECTION_COMPLETED")
                .nodeId(nodeId)
                .message("Election completed on node " + nodeId + " in " + durationMs + "ms")
                .details(details)
                .build();
    }

    public static ClusterEvent moduleStateChange(String clusterId, int nodeId, String from, String to) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("from", from);
        details.put("to", to);

        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.NODE)
                .type("MODULE_STATE_CHANGE")
                .nodeId(nodeId)
                .message("Node " + nodeId + " module state: " + from + ARROW + to)
                .details(details)
                .build();
    }

    public static ClusterEvent nodeUp(String clusterId, int nodeId) {
        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.NODE)
                .type("NODE_UP")
                .nodeId(nodeId)
                .message("Node " + nodeId + " is up")
                .build();
    }

    public static ClusterEvent nodeDown(String clusterId, int nodeId) {
        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.NODE)
                .type("NODE_DOWN")
                .nodeId(nodeId)
                .message("Node " + nodeId + " is down")
                .build();
    }

    public static ClusterEvent nodeAction(String clusterId, int nodeId, String action, String username,
                                          boolean success, String output) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("action", action);
        details.put("success", success);
        details.put("output", output);

        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.NODE)
                .type("NODE_ACTION")
                .nodeId(nodeId)
                .message("Node " + nodeId + " action: " + action + " (" + (success ? "success" : "failed") + ")")
                .username(username)
                .details(details)
                .build();
    }

    // ── Agent-level events ────────────────────────────────────────────

    public static ClusterEvent agentConnected(String clusterId, int nodeId) {
        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.AGENT)
                .type("AGENT_CONNECTED")
                .nodeId(nodeId)
                .message("Agent connected for node " + nodeId)
                .build();
    }

    public static ClusterEvent agentDisconnected(String clusterId, int nodeId) {
        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.AGENT)
                .type("AGENT_DISCONNECTED")
                .nodeId(nodeId)
                .message("Agent disconnected for node " + nodeId)
                .build();
    }

    public static ClusterEvent cncAccessible(String clusterId, int nodeId) {
        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.AGENT)
                .type("NODE_CNC_ACCESSIBLE")
                .nodeId(nodeId)
                .message("CnC file accessible for node " + nodeId)
                .build();
    }

    public static ClusterEvent cncLost(String clusterId, int nodeId) {
        return ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(Instant.now())
                .level(EventLevel.AGENT)
                .type("NODE_CNC_LOST")
                .nodeId(nodeId)
                .message("CnC file lost for node " + nodeId)
                .build();
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private static String mapClusterActionType(String action) {
        return switch (action.toUpperCase()) {
            case "SUSPEND" -> "CLUSTER_SUSPENDED";
            case "RESUME" -> "CLUSTER_RESUMED";
            case "SHUTDOWN" -> "CLUSTER_SHUTDOWN";
            default -> "CLUSTER_ACTION_" + action.toUpperCase();
        };
    }
}

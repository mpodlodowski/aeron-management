package it.podlodowski.aeronmgmt.server.events;

import java.util.Map;

public enum EventSeverity {
    ERROR, WARNING, INFO, SUCCESS;

    private static final Map<String, EventSeverity> SEVERITY_MAP = Map.ofEntries(
            // Error — needs attention
            Map.entry("CONSENSUS_LOST", ERROR),
            Map.entry("NODE_DOWN", ERROR),
            Map.entry("NODE_CNC_LOST", ERROR),
            Map.entry("AGENT_DISCONNECTED", ERROR),
            Map.entry("MONITORING_GAP", ERROR),

            // Warning — notable
            Map.entry("ELECTION_STARTED", WARNING),
            Map.entry("CLUSTER_SUSPENDED", WARNING),
            Map.entry("CLUSTER_SHUTDOWN", WARNING),

            // Success — positive
            Map.entry("CONSENSUS_ESTABLISHED", SUCCESS),
            Map.entry("NODE_UP", SUCCESS),
            Map.entry("AGENT_CONNECTED", SUCCESS),
            Map.entry("NODE_CNC_ACCESSIBLE", SUCCESS),
            Map.entry("CLUSTER_START", SUCCESS),
            Map.entry("CLUSTER_RESUMED", SUCCESS),

            // Info — everything else handled by default
            Map.entry("LEADER_ELECTED", INFO),
            Map.entry("ELECTION_COMPLETED", INFO),
            Map.entry("ROLE_CHANGE", INFO),
            Map.entry("MODULE_STATE_CHANGE", INFO),
            Map.entry("SNAPSHOT_TAKEN", INFO),
            Map.entry("SNAPSHOT_REQUESTED", INFO),
            Map.entry("NODE_ACTION", INFO),
            Map.entry("EGRESS_RECORD_STARTED", INFO),
            Map.entry("EGRESS_RECORD_STOPPED", INFO)
    );

    public static EventSeverity fromType(String eventType) {
        return SEVERITY_MAP.getOrDefault(eventType, INFO);
    }
}

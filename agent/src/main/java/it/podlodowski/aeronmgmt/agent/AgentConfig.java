package it.podlodowski.aeronmgmt.agent;

import java.util.UUID;

public class AgentConfig {
    public final String managementServerHost;
    public final int managementServerPort;
    public final String clusterDir;
    public final long metricsIntervalMs;
    public final String agentId;

    // Optional overrides — if not set, auto-discovered from cluster-mark.dat
    public final long cncFailureTimeoutMs;

    // Optional overrides — if not set, auto-discovered from cluster-mark.dat
    public final String aeronDirOverride;
    public final String agentModeOverride;
    public final Integer nodeIdOverride;

    public AgentConfig() {
        this.managementServerHost = env("MANAGEMENT_SERVER_HOST", "localhost");
        this.managementServerPort = Integer.parseInt(env("MANAGEMENT_SERVER_PORT", "8081"));
        this.clusterDir = env("CLUSTER_DIR", "aeron-cluster/cluster");
        this.metricsIntervalMs = Long.parseLong(env("METRICS_INTERVAL_MS", "1000"));
        this.agentId = env("AGENT_ID", UUID.randomUUID().toString().substring(0, 8));
        this.cncFailureTimeoutMs = Long.parseLong(env("CNC_FAILURE_TIMEOUT_MS", "2000"));

        String nodeIdEnv = System.getenv("AGENT_NODE_ID");
        this.nodeIdOverride = nodeIdEnv != null ? Integer.parseInt(nodeIdEnv) : null;
        this.aeronDirOverride = System.getenv("AERON_DIR");
        this.agentModeOverride = System.getenv("AGENT_MODE");
    }

    private static String env(String key, String defaultValue) {
        String value = System.getenv(key);
        return value != null ? value : defaultValue;
    }
}

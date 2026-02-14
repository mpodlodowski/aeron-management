package it.podlodowski.aeronmgmt.agent;

public class AgentConfig {
    public final String managementServerHost;
    public final int managementServerPort;
    public final String aeronDir;
    public final String clusterDir;
    public final String agentMode;   // "cluster" or "backup"
    public final int nodeId;
    public final long metricsIntervalMs;

    public AgentConfig() {
        this.managementServerHost = env("MANAGEMENT_SERVER_HOST", "localhost");
        this.managementServerPort = Integer.parseInt(env("MANAGEMENT_SERVER_PORT", "8081"));
        this.aeronDir = env("AERON_DIR", "/dev/shm/aeron");
        this.clusterDir = env("CLUSTER_DIR", "aeron-cluster/cluster");
        this.agentMode = env("AGENT_MODE", "cluster");
        this.nodeId = Integer.parseInt(env("AGENT_NODE_ID", "0"));
        this.metricsIntervalMs = Long.parseLong(env("METRICS_INTERVAL_MS", "1000"));
    }

    private static String env(String key, String defaultValue) {
        String value = System.getenv(key);
        return value != null ? value : defaultValue;
    }
}

package it.podlodowski.aeronmgmt.agent;

import java.util.UUID;

public class AgentConfig {
    public final String managementServerHost;
    public final int managementServerPort;
    public final String clusterDirTemplate;
    public final long metricsIntervalMs;
    public final String agentId;
    public final long cncFailureTimeoutMs;

    public AgentConfig() {
        this.managementServerHost = env("AERON_MANAGEMENT_AGENT_SERVER_HOST", "localhost");
        this.managementServerPort = Integer.parseInt(env("AERON_MANAGEMENT_AGENT_SERVER_PORT", "8081"));
        this.clusterDirTemplate = env("AERON_MANAGEMENT_AGENT_CLUSTER_DIR", System.getProperty("user.home"));
        this.metricsIntervalMs = Long.parseLong(env("AERON_MANAGEMENT_AGENT_METRICS_INTERVAL_MS", "1000"));
        this.agentId = env("AERON_MANAGEMENT_AGENT_ID", UUID.randomUUID().toString().substring(0, 8));
        this.cncFailureTimeoutMs = Long.parseLong(env("AERON_MANAGEMENT_AGENT_CNC_FAILURE_TIMEOUT_MS", "2000"));
    }

    private static String env(String key, String defaultValue) {
        String value = System.getenv(key);
        return value != null ? value : defaultValue;
    }
}

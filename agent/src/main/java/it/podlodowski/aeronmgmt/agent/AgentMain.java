package it.podlodowski.aeronmgmt.agent;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class AgentMain {

    private static final Logger LOGGER = LoggerFactory.getLogger(AgentMain.class);

    public static void main(String[] args) {
        AgentConfig config = new AgentConfig();
        LOGGER.info("Starting agent for node {} in {} mode", config.nodeId, config.agentMode);
        LOGGER.info("Aeron dir: {}, Cluster dir: {}", config.aeronDir, config.clusterDir);

        CncReader cncReader = new CncReader(config.aeronDir);
        ArchiveMetricsCollector archiveCollector = new ArchiveMetricsCollector(config.aeronDir);
        MetricsCollector metricsCollector = new MetricsCollector(cncReader, archiveCollector, config.nodeId);
        AdminCommandExecutor commandExecutor = new AdminCommandExecutor(config.clusterDir);
        GrpcAgentClient grpcClient = new GrpcAgentClient(config, commandExecutor);
        HealthEndpoint healthEndpoint = new HealthEndpoint(7070);

        grpcClient.connect();

        ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
        scheduler.scheduleAtFixedRate(() -> {
            try {
                grpcClient.sendMetrics(metricsCollector.collect());
            } catch (Exception e) {
                LOGGER.error("Metrics collection failed", e);
            }
        }, 0, config.metricsIntervalMs, TimeUnit.MILLISECONDS);

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            LOGGER.info("Shutting down agent...");
            scheduler.shutdown();
            grpcClient.shutdown();
            healthEndpoint.stop();
        }));

        LOGGER.info("Agent started successfully");
    }
}

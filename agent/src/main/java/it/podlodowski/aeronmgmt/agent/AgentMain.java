package it.podlodowski.aeronmgmt.agent;

import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class AgentMain {

    private static final Logger LOGGER = LoggerFactory.getLogger(AgentMain.class);

    public static void main(String[] args) throws Exception {
        AgentConfig config = new AgentConfig();
        int maxCncFailures = Math.max(1, (int) (config.cncFailureTimeoutMs / config.metricsIntervalMs));
        LOGGER.info("Agent {} starting. Cluster dir template: {}, clusterId={}, cncFailureTimeout={}ms ({} cycles)",
                config.agentId, config.clusterDirTemplate, config.clusterId, config.cncFailureTimeoutMs, maxCncFailures);

        // Resolve cluster directory: expand {node_id} template, scan if needed.
        // Wait for the base directory first (before template expansion).
        String baseDir = config.clusterDirTemplate.contains("{node_id}")
                ? config.clusterDirTemplate.substring(0, config.clusterDirTemplate.indexOf("{node_id}"))
                : config.clusterDirTemplate;
        awaitDirectory(new File(baseDir), "Cluster base directory");
        String clusterDir = ClusterDirResolver.resolve(config.clusterDirTemplate, System::getenv);
        LOGGER.info("Resolved cluster dir: {}", clusterDir);

        // Discover node identity from mark file (retries until available)
        ClusterMarkFileReader identity = ClusterMarkFileReader.discover(clusterDir);
        LOGGER.info("Agent {} discovered: nodeId={}, aeronDir={}, mode={}",
                config.agentId, identity.nodeId(), identity.aeronDir(), identity.agentMode());

        // Wait for aeron directory (shared memory) — created by the cluster node's MediaDriver
        awaitDirectory(new File(identity.aeronDir()), "Aeron directory");

        CncReader cncReader = new CncReader(identity.aeronDir());
        ArchiveMetricsCollector archiveCollector = new ArchiveMetricsCollector(clusterDir);
        SpyRecordingManager spyRecordingManager = new SpyRecordingManager(identity.aeronDir(), cncReader);
        spyRecordingManager.connect();
        MetricsCollector metricsCollector = new MetricsCollector(
                cncReader, archiveCollector, identity.nodeId(), identity.agentMode(), config.clusterId,
                spyRecordingManager);
        AdminCommandExecutor commandExecutor = new AdminCommandExecutor(clusterDir, archiveCollector, spyRecordingManager);
        GrpcAgentClient grpcClient = new GrpcAgentClient(config, identity, commandExecutor);
        HealthEndpoint healthEndpoint = new HealthEndpoint(7070);

        grpcClient.connect();

        AtomicInteger cncFailures = new AtomicInteger(0);
        ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
        scheduler.scheduleAtFixedRate(() -> {
            try {
                MetricsReport report = metricsCollector.collect();
                grpcClient.sendMetrics(report);

                if (!report.getCncAccessible()) {
                    int failures = cncFailures.incrementAndGet();
                    if (failures >= maxCncFailures) {
                        LOGGER.error("CnC inaccessible for {} consecutive cycles ({}ms), exiting for restart",
                                failures, failures * config.metricsIntervalMs);
                        System.exit(1);
                    }
                } else {
                    cncFailures.set(0);
                }
            } catch (Throwable t) {
                LOGGER.error("Metrics collection failed", t);
            }
        }, 0, config.metricsIntervalMs, TimeUnit.MILLISECONDS);

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            LOGGER.info("Shutting down agent {}...", config.agentId);
            scheduler.shutdown();
            grpcClient.shutdown();
            spyRecordingManager.close();
            healthEndpoint.stop();
        }));

        LOGGER.info("Agent {} started successfully", config.agentId);
    }

    private static void awaitDirectory(File dir, String label) throws InterruptedException {
        while (!dir.isDirectory()) {
            LOGGER.info("{} {} does not exist yet, waiting for cluster node to start...", label, dir);
            Thread.sleep(5000);
        }
        LOGGER.info("{} {} is available", label, dir);
    }
}

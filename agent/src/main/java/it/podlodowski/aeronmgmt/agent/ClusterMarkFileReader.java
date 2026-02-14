package it.podlodowski.aeronmgmt.agent;

import io.aeron.cluster.codecs.mark.ClusterComponentType;
import io.aeron.cluster.service.ClusterMarkFile;
import org.agrona.concurrent.SystemEpochClock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;

/**
 * Reads node identity from the cluster-mark.dat file.
 * Discovers nodeId, aeronDir, and agentMode without manual configuration.
 */
public class ClusterMarkFileReader {

    private static final Logger LOGGER = LoggerFactory.getLogger(ClusterMarkFileReader.class);

    private final int nodeId;
    private final String aeronDir;
    private final String agentMode;

    private ClusterMarkFileReader(int nodeId, String aeronDir, String agentMode) {
        this.nodeId = nodeId;
        this.aeronDir = aeronDir;
        this.agentMode = agentMode;
    }

    public int nodeId() { return nodeId; }
    public String aeronDir() { return aeronDir; }
    public String agentMode() { return agentMode; }

    /**
     * Reads node identity from the mark file, retrying until available.
     * Applies config overrides where provided.
     */
    public static ClusterMarkFileReader discover(AgentConfig config) {
        while (!Thread.currentThread().isInterrupted()) {
            try {
                return readFromMarkFile(config);
            } catch (Exception e) {
                LOGGER.info("Cluster mark file not available in {}: {}. Retrying in 5s...",
                        config.clusterDir, e.getMessage());
                sleep(5000);
            }
        }
        throw new IllegalStateException("Interrupted while waiting for mark file");
    }

    private static ClusterMarkFileReader readFromMarkFile(AgentConfig config) {
        // Open cluster-mark.dat directly (the generic name used by the cluster).
        // The typed constructor looks for cluster-mark-consensus_module.dat etc. which
        // doesn't match what Aeron 1.46.5 writes, so we specify the filename explicitly.
        File clusterDir = new File(config.clusterDir);

        try (ClusterMarkFile markFile = new ClusterMarkFile(
                clusterDir, ClusterMarkFile.FILENAME, new SystemEpochClock(), 5000,
                msg -> LOGGER.debug("Mark file: {}", msg))) {
            ClusterComponentType type = markFile.decoder().componentType();
            int discoveredNodeId = markFile.decoder().memberId();
            String discoveredAeronDir = markFile.decoder().aeronDirectory();
            boolean isBackup = type == ClusterComponentType.BACKUP;
            String discoveredMode = isBackup ? "backup" : "cluster";

            // Apply overrides
            int nodeId = config.nodeIdOverride != null ? config.nodeIdOverride : discoveredNodeId;
            String aeronDir = config.aeronDirOverride != null ? config.aeronDirOverride : discoveredAeronDir;
            String agentMode = config.agentModeOverride != null ? config.agentModeOverride : discoveredMode;

            LOGGER.info("Discovered from mark file: nodeId={}, aeronDir={}, mode={} (overrides: nodeId={}, aeronDir={}, mode={})",
                    discoveredNodeId, discoveredAeronDir, discoveredMode,
                    config.nodeIdOverride, config.aeronDirOverride, config.agentModeOverride);

            return new ClusterMarkFileReader(nodeId, aeronDir, agentMode);
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}

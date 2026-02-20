package it.podlodowski.aeronmgmt.agent;

import io.aeron.cluster.codecs.mark.ClusterComponentType;
import io.aeron.cluster.service.ClusterMarkFile;
import org.agrona.concurrent.SystemEpochClock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;

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

    public static ClusterMarkFileReader discover(String clusterDir) {
        while (!Thread.currentThread().isInterrupted()) {
            try {
                return readFromMarkFile(clusterDir);
            } catch (Exception e) {
                LOGGER.info("Cluster mark file not available in {}: {}. Retrying in 5s...",
                        clusterDir, e.getMessage());
                sleep(5000);
            }
        }
        throw new IllegalStateException("Interrupted while waiting for mark file");
    }

    private static ClusterMarkFileReader readFromMarkFile(String clusterDirPath) {
        File clusterDir = new File(clusterDirPath);

        try (ClusterMarkFile markFile = new ClusterMarkFile(
                clusterDir, ClusterMarkFile.FILENAME, new SystemEpochClock(), 5000,
                msg -> LOGGER.debug("Mark file: {}", msg))) {
            ClusterComponentType type = markFile.decoder().componentType();
            int nodeId = markFile.decoder().memberId();
            String aeronDir = markFile.decoder().aeronDirectory();
            boolean isBackup = type == ClusterComponentType.BACKUP;
            String agentMode = isBackup ? "backup" : "cluster";

            LOGGER.info("Discovered from mark file: nodeId={}, aeronDir={}, mode={}",
                    nodeId, aeronDir, agentMode);

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

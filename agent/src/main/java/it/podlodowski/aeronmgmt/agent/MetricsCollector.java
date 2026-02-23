package it.podlodowski.aeronmgmt.agent;

import it.podlodowski.aeronmgmt.common.proto.ClusterMetrics;
import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import it.podlodowski.aeronmgmt.common.proto.SystemMetrics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public class MetricsCollector {

    private static final Logger LOGGER = LoggerFactory.getLogger(MetricsCollector.class);
    private static final Path PROC_STATUS = Path.of("/proc/self/status");

    private final CncReader cncReader;
    private final ArchiveMetricsCollector archiveCollector;
    private final int nodeId;
    private final String agentMode;
    private final String clusterId;
    private final SpyRecordingManager spyRecordingManager;
    private final StateChangeBuffer stateChangeBuffer;
    private final File shmDir;

    public MetricsCollector(CncReader cncReader, ArchiveMetricsCollector archiveCollector,
                            int nodeId, String agentMode, String clusterId,
                            SpyRecordingManager spyRecordingManager, StateChangeBuffer stateChangeBuffer,
                            String aeronDir) {
        this.cncReader = cncReader;
        this.archiveCollector = archiveCollector;
        this.nodeId = nodeId;
        this.agentMode = agentMode;
        this.clusterId = clusterId;
        this.spyRecordingManager = spyRecordingManager;
        this.stateChangeBuffer = stateChangeBuffer;
        // aeronDir is e.g. /dev/shm/-0-driver — resolve parent to get the SHM mount
        this.shmDir = new File(aeronDir).getParentFile();
    }

    public MetricsReport collect() {
        CncReader.CncSnapshot cnc = cncReader.read();

        ClusterMetrics clusterMetrics = cnc.clusterMetrics;
        if ("backup".equals(agentMode)) {
            clusterMetrics = clusterMetrics.toBuilder()
                    .setNodeRole("BACKUP")
                    .build();
        }

        MetricsReport report = MetricsReport.newBuilder()
                .setNodeId(nodeId)
                .setTimestamp(System.currentTimeMillis())
                .setCncAccessible(cnc.cncAccessible)
                .setNodeReachable(cnc.driverActive)
                .setClusterMetrics(clusterMetrics)
                .addAllCounters(cnc.counters)
                .addAllRecordings(archiveCollector.collectRecordings())
                .setSystemMetrics(collectSystemMetrics())
                .setClusterId(clusterId)
                .setEgressRecording(spyRecordingManager.getStatus())
                .build();

        stateChangeBuffer.onMetrics(report);

        return report;
    }

    public StateChangeBuffer getStateChangeBuffer() {
        return stateChangeBuffer;
    }

    private SystemMetrics collectSystemMetrics() {
        File archiveDir = archiveCollector.getArchiveDir();
        long archiveTotal = archiveDir.getTotalSpace();
        long archiveUsable = archiveDir.getUsableSpace();
        long rssBytes = readRssBytes();

        SystemMetrics.Builder builder = SystemMetrics.newBuilder()
                .setHeapUsedBytes(rssBytes)
                .setHeapMaxBytes(rssBytes)
                .setArchiveDiskTotalBytes(archiveTotal)
                .setArchiveDiskAvailableBytes(archiveUsable)
                .setArchiveDiskUsedBytes(archiveTotal - archiveUsable);

        if (shmDir != null && shmDir.exists()) {
            long shmTotal = shmDir.getTotalSpace();
            long shmUsable = shmDir.getUsableSpace();
            builder.setShmDiskTotalBytes(shmTotal)
                    .setShmDiskAvailableBytes(shmUsable)
                    .setShmDiskUsedBytes(shmTotal - shmUsable);
        }

        return builder.build();
    }

    private long readRssBytes() {
        try {
            for (String line : Files.readAllLines(PROC_STATUS)) {
                if (line.startsWith("VmRSS:")) {
                    String[] parts = line.split("\\s+");
                    return Long.parseLong(parts[1]) * 1024; // kB to bytes
                }
            }
        } catch (IOException | NumberFormatException e) {
            LOGGER.debug("Could not read RSS from /proc/self/status: {}", e.getMessage());
        }
        return 0;
    }
}

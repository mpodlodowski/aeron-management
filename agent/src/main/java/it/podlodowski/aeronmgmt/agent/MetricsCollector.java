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

    public MetricsCollector(CncReader cncReader, ArchiveMetricsCollector archiveCollector, int nodeId, String agentMode) {
        this.cncReader = cncReader;
        this.archiveCollector = archiveCollector;
        this.nodeId = nodeId;
        this.agentMode = agentMode;
    }

    public MetricsReport collect() {
        CncReader.CncSnapshot cnc = cncReader.read();

        ClusterMetrics clusterMetrics = cnc.clusterMetrics;
        if ("backup".equals(agentMode)) {
            clusterMetrics = clusterMetrics.toBuilder()
                    .setNodeRole("BACKUP")
                    .build();
        }

        return MetricsReport.newBuilder()
                .setNodeId(nodeId)
                .setTimestamp(System.currentTimeMillis())
                .setCncAccessible(cnc.cncAccessible)
                .setNodeReachable(cnc.driverActive)
                .setClusterMetrics(clusterMetrics)
                .addAllCounters(cnc.counters)
                .addAllRecordings(archiveCollector.collectRecordings())
                .setSystemMetrics(collectSystemMetrics())
                .build();
    }

    private SystemMetrics collectSystemMetrics() {
        File archiveDir = archiveCollector.getArchiveDir();
        long totalSpace = archiveDir.getTotalSpace();
        long usableSpace = archiveDir.getUsableSpace();
        long rssBytes = readRssBytes();

        return SystemMetrics.newBuilder()
                .setHeapUsedBytes(rssBytes)
                .setHeapMaxBytes(rssBytes)
                .setArchiveDiskTotalBytes(totalSpace)
                .setArchiveDiskAvailableBytes(usableSpace)
                .setArchiveDiskUsedBytes(totalSpace - usableSpace)
                .build();
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

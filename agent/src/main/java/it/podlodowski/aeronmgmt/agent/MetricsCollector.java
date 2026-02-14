package it.podlodowski.aeronmgmt.agent;

import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import it.podlodowski.aeronmgmt.common.proto.SystemMetrics;

import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;

public class MetricsCollector {

    private final CncReader cncReader;
    private final int nodeId;

    public MetricsCollector(CncReader cncReader, int nodeId) {
        this.cncReader = cncReader;
        this.nodeId = nodeId;
    }

    public MetricsReport collect() {
        return MetricsReport.newBuilder()
                .setNodeId(nodeId)
                .setTimestamp(System.currentTimeMillis())
                .setClusterMetrics(cncReader.readClusterMetrics())
                .addAllCounters(cncReader.readCounters())
                .setSystemMetrics(collectSystemMetrics())
                .build();
    }

    private SystemMetrics collectSystemMetrics() {
        MemoryMXBean memory = ManagementFactory.getMemoryMXBean();
        long gcCount = 0;
        long gcTime = 0;
        for (GarbageCollectorMXBean gc : ManagementFactory.getGarbageCollectorMXBeans()) {
            gcCount += gc.getCollectionCount();
            gcTime += gc.getCollectionTime();
        }

        return SystemMetrics.newBuilder()
                .setHeapUsedBytes(memory.getHeapMemoryUsage().getUsed())
                .setHeapMaxBytes(memory.getHeapMemoryUsage().getMax())
                .setGcCount(gcCount)
                .setGcTimeMs(gcTime)
                .build();
    }
}

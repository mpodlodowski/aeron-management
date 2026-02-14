package it.podlodowski.aeronmgmt.agent;

import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MetricsCollectorTest {

    @Test
    void backupModeInjectsBackupRole() {
        CncReader cncReader = new CncReader("/tmp/nonexistent-aeron-dir");
        ArchiveMetricsCollector archiveCollector = new ArchiveMetricsCollector("/tmp/nonexistent-cluster-dir");
        MetricsCollector collector = new MetricsCollector(cncReader, archiveCollector, 99, "backup");

        MetricsReport report = collector.collect();

        assertThat(report.getClusterMetrics().getNodeRole()).isEqualTo("BACKUP");
        assertThat(report.getNodeId()).isEqualTo(99);
    }

    @Test
    void clusterModeDoesNotOverrideRole() {
        CncReader cncReader = new CncReader("/tmp/nonexistent-aeron-dir");
        ArchiveMetricsCollector archiveCollector = new ArchiveMetricsCollector("/tmp/nonexistent-cluster-dir");
        MetricsCollector collector = new MetricsCollector(cncReader, archiveCollector, 0, "cluster");

        MetricsReport report = collector.collect();

        // With nonexistent CnC, role will be empty (default proto value), NOT overridden
        assertThat(report.getClusterMetrics().getNodeRole()).isEmpty();
    }
}

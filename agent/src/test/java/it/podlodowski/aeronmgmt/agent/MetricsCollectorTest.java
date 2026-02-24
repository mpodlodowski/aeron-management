package it.podlodowski.aeronmgmt.agent;

import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MetricsCollectorTest {

    @Test
    void backupModeInjectsBackupRole() {
        CncReader cncReader = new CncReader("/tmp/nonexistent-aeron-dir");
        ArchiveMetricsCollector archiveCollector = new ArchiveMetricsCollector("/tmp/nonexistent-cluster-dir");
        SpyRecordingManager spyRecordingManager = new SpyRecordingManager("/tmp/nonexistent-aeron-dir", cncReader);
        MetricsCollector collector = new MetricsCollector(cncReader, archiveCollector, 99, "backup", "test-cluster", spyRecordingManager, new StateChangeBuffer(100), "/tmp/nonexistent-aeron-dir");

        MetricsReport report = collector.collect();

        assertThat(report.getClusterMetrics().getNodeRole()).isEqualTo("BACKUP");
        assertThat(report.getNodeId()).isEqualTo(99);
        assertThat(report.getClusterId()).isEqualTo("test-cluster");
    }

    @Test
    void clusterModeDoesNotOverrideRole() {
        CncReader cncReader = new CncReader("/tmp/nonexistent-aeron-dir");
        ArchiveMetricsCollector archiveCollector = new ArchiveMetricsCollector("/tmp/nonexistent-cluster-dir");
        SpyRecordingManager spyRecordingManager = new SpyRecordingManager("/tmp/nonexistent-aeron-dir", cncReader);
        MetricsCollector collector = new MetricsCollector(cncReader, archiveCollector, 0, "cluster", "default", spyRecordingManager, new StateChangeBuffer(100), "/tmp/nonexistent-aeron-dir");

        MetricsReport report = collector.collect();

        // With nonexistent CnC, role will be empty (default proto value), NOT overridden
        assertThat(report.getClusterMetrics().getNodeRole()).isEmpty();
    }
}

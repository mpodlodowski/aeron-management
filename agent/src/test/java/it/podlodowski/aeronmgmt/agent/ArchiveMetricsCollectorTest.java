package it.podlodowski.aeronmgmt.agent;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ArchiveMetricsCollectorTest {

    @Test
    void lookupRecordingReturnsNullForMissingCatalogDirectory() {
        ArchiveMetricsCollector collector = new ArchiveMetricsCollector("/tmp/nonexistent-cluster-dir");

        ArchiveMetricsCollector.RecordingInfo result = collector.lookupRecording(42);

        assertThat(result).isNull();
    }
}

package it.podlodowski.aeronmgmt.agent;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CncReaderTest {

    @Test
    void readCountersFromNonexistentDir() {
        CncReader reader = new CncReader("/tmp/nonexistent-aeron-dir");
        var counters = reader.readCounters();
        assertThat(counters).isEmpty();
    }

    @Test
    void readClusterMetricsFromNonexistentDir() {
        CncReader reader = new CncReader("/tmp/nonexistent-aeron-dir");
        var metrics = reader.readClusterMetrics();
        assertThat(metrics.getNodeRole()).isEmpty();
        assertThat(metrics.getCommitPosition()).isZero();
    }
}

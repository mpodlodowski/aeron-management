package it.podlodowski.aeronmgmt.agent;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CncReaderTest {

    @Test
    void readFromNonexistentDir() {
        CncReader reader = new CncReader("/tmp/nonexistent-aeron-dir");
        CncReader.CncSnapshot snapshot = reader.read();
        assertThat(snapshot.cncAccessible).isFalse();
        assertThat(snapshot.driverActive).isFalse();
        assertThat(snapshot.counters).isEmpty();
        assertThat(snapshot.clusterMetrics.getNodeRole()).isEmpty();
        assertThat(snapshot.clusterMetrics.getCommitPosition()).isZero();
    }
}

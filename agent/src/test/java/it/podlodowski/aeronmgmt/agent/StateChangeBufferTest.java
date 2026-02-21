package it.podlodowski.aeronmgmt.agent;

import it.podlodowski.aeronmgmt.common.proto.AeronCounter;
import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import it.podlodowski.aeronmgmt.common.proto.StateChangeEntry;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class StateChangeBufferTest {

    private static final int CONSENSUS_MODULE_STATE = 200;
    private static final int CLUSTER_NODE_ROLE = 201;
    private static final int ELECTION_STATE = 207;
    private static final int COMMIT_POSITION = 203;  // not tracked

    @Test
    void emptyBufferReturnsEmptyList() {
        StateChangeBuffer buffer = new StateChangeBuffer(100);

        List<StateChangeEntry> entries = buffer.drainAndClear();

        assertThat(entries).isEmpty();
    }

    @Test
    void trackedCounterChangeIsRecorded() {
        StateChangeBuffer buffer = new StateChangeBuffer(100);

        // First report seeds the previous value — no entry created
        buffer.onMetrics(metricsReport(1000L,
                counter(CLUSTER_NODE_ROLE, 0)));  // FOLLOWER

        // Second report with changed value — entry created
        buffer.onMetrics(metricsReport(2000L,
                counter(CLUSTER_NODE_ROLE, 2)));  // LEADER

        List<StateChangeEntry> entries = buffer.drainAndClear();

        assertThat(entries).hasSize(1);
        StateChangeEntry entry = entries.get(0);
        assertThat(entry.getTimestamp()).isEqualTo(2000L);
        assertThat(entry.getCounterTypeId()).isEqualTo(CLUSTER_NODE_ROLE);
        assertThat(entry.getOldValue()).isEqualTo(0);
        assertThat(entry.getNewValue()).isEqualTo(2);
    }

    @Test
    void nonTrackedCounterIsIgnored() {
        StateChangeBuffer buffer = new StateChangeBuffer(100);

        buffer.onMetrics(metricsReport(1000L,
                counter(COMMIT_POSITION, 100)));
        buffer.onMetrics(metricsReport(2000L,
                counter(COMMIT_POSITION, 200)));

        List<StateChangeEntry> entries = buffer.drainAndClear();

        assertThat(entries).isEmpty();
    }

    @Test
    void bufferRespectsMaxSizeAndEvictsOldest() {
        StateChangeBuffer buffer = new StateChangeBuffer(3);

        // Seed initial values for all tracked counters
        buffer.onMetrics(metricsReport(1000L,
                counter(CLUSTER_NODE_ROLE, 0),
                counter(CONSENSUS_MODULE_STATE, 0),
                counter(ELECTION_STATE, 0)));

        // Generate 4 changes — buffer max is 3, so oldest should be evicted
        buffer.onMetrics(metricsReport(2000L, counter(CLUSTER_NODE_ROLE, 1)));
        buffer.onMetrics(metricsReport(3000L, counter(CLUSTER_NODE_ROLE, 2)));
        buffer.onMetrics(metricsReport(4000L, counter(CONSENSUS_MODULE_STATE, 1)));
        buffer.onMetrics(metricsReport(5000L, counter(ELECTION_STATE, 17)));

        List<StateChangeEntry> entries = buffer.drainAndClear();

        assertThat(entries).hasSize(3);
        // Oldest entry (timestamp 2000) should have been evicted
        assertThat(entries.get(0).getTimestamp()).isEqualTo(3000L);
        assertThat(entries.get(1).getTimestamp()).isEqualTo(4000L);
        assertThat(entries.get(2).getTimestamp()).isEqualTo(5000L);
    }

    @Test
    void drainAndClearReturnsEntriesAndClearsBuffer() {
        StateChangeBuffer buffer = new StateChangeBuffer(100);

        buffer.onMetrics(metricsReport(1000L, counter(CLUSTER_NODE_ROLE, 0)));
        buffer.onMetrics(metricsReport(2000L, counter(CLUSTER_NODE_ROLE, 2)));

        List<StateChangeEntry> first = buffer.drainAndClear();
        assertThat(first).hasSize(1);

        List<StateChangeEntry> second = buffer.drainAndClear();
        assertThat(second).isEmpty();
    }

    @Test
    void getCurrentCounterValuesReturnsLatestValues() {
        StateChangeBuffer buffer = new StateChangeBuffer(100);

        buffer.onMetrics(metricsReport(1000L,
                counter(CLUSTER_NODE_ROLE, 0),
                counter(CONSENSUS_MODULE_STATE, 1),
                counter(ELECTION_STATE, 17)));

        Map<Integer, Long> values = buffer.getCurrentCounterValues();

        assertThat(values).containsExactlyInAnyOrderEntriesOf(Map.of(
                CLUSTER_NODE_ROLE, 0L,
                CONSENSUS_MODULE_STATE, 1L,
                ELECTION_STATE, 17L));
    }

    @Test
    void unchangedTrackedCounterDoesNotCreateEntry() {
        StateChangeBuffer buffer = new StateChangeBuffer(100);

        buffer.onMetrics(metricsReport(1000L, counter(CLUSTER_NODE_ROLE, 0)));
        buffer.onMetrics(metricsReport(2000L, counter(CLUSTER_NODE_ROLE, 0)));  // same value

        List<StateChangeEntry> entries = buffer.drainAndClear();

        assertThat(entries).isEmpty();
    }

    @Test
    void multipleTrackedCountersChangeInSingleReport() {
        StateChangeBuffer buffer = new StateChangeBuffer(100);

        buffer.onMetrics(metricsReport(1000L,
                counter(CLUSTER_NODE_ROLE, 0),
                counter(ELECTION_STATE, 0)));

        buffer.onMetrics(metricsReport(2000L,
                counter(CLUSTER_NODE_ROLE, 2),
                counter(ELECTION_STATE, 17)));

        List<StateChangeEntry> entries = buffer.drainAndClear();

        assertThat(entries).hasSize(2);
        assertThat(entries).extracting(StateChangeEntry::getCounterTypeId)
                .containsExactlyInAnyOrder(CLUSTER_NODE_ROLE, ELECTION_STATE);
    }

    // --- helpers ---

    private static MetricsReport metricsReport(long timestamp, AeronCounter... counters) {
        MetricsReport.Builder builder = MetricsReport.newBuilder()
                .setNodeId(0)
                .setTimestamp(timestamp);
        for (AeronCounter c : counters) {
            builder.addCounters(c);
        }
        return builder.build();
    }

    private static AeronCounter counter(int typeId, long value) {
        return AeronCounter.newBuilder()
                .setTypeId(typeId)
                .setValue(value)
                .build();
    }
}

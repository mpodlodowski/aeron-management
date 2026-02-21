package it.podlodowski.aeronmgmt.agent;

import it.podlodowski.aeronmgmt.common.proto.AeronCounter;
import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import it.podlodowski.aeronmgmt.common.proto.StateChangeEntry;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

public class StateChangeBuffer {

    private static final Set<Integer> TRACKED_COUNTERS = Set.of(200, 201, 207);

    private final int maxSize;
    private final ConcurrentLinkedDeque<StateChangeEntry> buffer = new ConcurrentLinkedDeque<>();
    private final ConcurrentHashMap<Integer, Long> previousValues = new ConcurrentHashMap<>();

    public StateChangeBuffer(int maxSize) {
        this.maxSize = maxSize;
    }

    public synchronized void onMetrics(MetricsReport report) {
        for (AeronCounter counter : report.getCountersList()) {
            if (!TRACKED_COUNTERS.contains(counter.getTypeId())) continue;

            Long prev = previousValues.put(counter.getTypeId(), counter.getValue());
            if (prev != null && prev != counter.getValue()) {
                buffer.addLast(StateChangeEntry.newBuilder()
                        .setTimestamp(report.getTimestamp())
                        .setCounterTypeId(counter.getTypeId())
                        .setOldValue(prev)
                        .setNewValue(counter.getValue())
                        .build());
                while (buffer.size() > maxSize) {
                    buffer.pollFirst();
                }
            }
        }
    }

    /**
     * Atomically drains the buffer and snapshots current counter values.
     * Returns both pieces of data together to avoid race conditions.
     */
    public synchronized Snapshot drainAndSnapshot() {
        List<StateChangeEntry> entries = new ArrayList<>(buffer);
        Map<Integer, Long> counterValues = Map.copyOf(previousValues);
        buffer.clear();
        return new Snapshot(entries, counterValues);
    }

    public record Snapshot(List<StateChangeEntry> entries, Map<Integer, Long> counterValues) {}
}

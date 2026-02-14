package it.podlodowski.aeronmgmt.server.aggregator;

import it.podlodowski.aeronmgmt.common.proto.MetricsReport;

import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;

/**
 * Rolling window that stores recent MetricsReport snapshots.
 * Evicts entries older than the configured window duration.
 * Thread-safe with synchronized methods.
 */
public class MetricsWindow {

    private final long windowDurationMs;
    private final LinkedList<MetricsReport> entries = new LinkedList<>();

    public MetricsWindow(long windowDurationMs) {
        this.windowDurationMs = windowDurationMs;
    }

    public synchronized void add(MetricsReport report) {
        entries.addLast(report);
        evictOldEntries();
    }

    public synchronized MetricsReport getLatest() {
        return entries.isEmpty() ? null : entries.getLast();
    }

    public synchronized List<MetricsReport> getAll() {
        evictOldEntries();
        return new ArrayList<>(entries);
    }

    public synchronized int size() {
        evictOldEntries();
        return entries.size();
    }

    public synchronized void clear() {
        entries.clear();
    }

    private void evictOldEntries() {
        long cutoff = System.currentTimeMillis() - windowDurationMs;
        while (!entries.isEmpty() && entries.getFirst().getTimestamp() < cutoff) {
            entries.removeFirst();
        }
    }
}

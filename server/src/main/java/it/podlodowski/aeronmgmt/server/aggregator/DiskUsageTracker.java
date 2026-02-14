package it.podlodowski.aeronmgmt.server.aggregator;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks recording data growth over time per node using a lightweight circular buffer.
 * Computes growth rates and time-to-full estimates by comparing recordingsTotalBytes
 * across samples, which captures both log recording growth and new snapshot creation.
 * First sample is recorded immediately (no minimum interval for the initial sample).
 */
@Component
public class DiskUsageTracker {

    private static final int MAX_SAMPLES = 1440; // 24h at 1 sample/min
    private static final long MIN_SAMPLE_INTERVAL_MS = 60_000;

    private static final long WINDOW_5M = 5 * 60 * 1000L;
    private static final long WINDOW_1H = 60 * 60 * 1000L;
    private static final long WINDOW_24H = 24 * 60 * 60 * 1000L;

    record DiskSample(long timestampMs, long recordingsTotalBytes) {}

    static class NodeDiskHistory {
        private final DiskSample[] samples = new DiskSample[MAX_SAMPLES];
        private int head = 0;
        private int count = 0;

        synchronized void record(long timestampMs, long recordingsTotalBytes) {
            if (count > 0) {
                DiskSample last = samples[(head - 1 + MAX_SAMPLES) % MAX_SAMPLES];
                if (timestampMs - last.timestampMs < MIN_SAMPLE_INTERVAL_MS) {
                    return;
                }
            }
            samples[head] = new DiskSample(timestampMs, recordingsTotalBytes);
            head = (head + 1) % MAX_SAMPLES;
            if (count < MAX_SAMPLES) {
                count++;
            }
        }

        synchronized Long growthRateBytesPerHour(long windowMs) {
            if (count < 2) {
                return null;
            }
            DiskSample newest = samples[(head - 1 + MAX_SAMPLES) % MAX_SAMPLES];
            long cutoff = newest.timestampMs - windowMs;

            DiskSample oldest = null;
            for (int i = 0; i < count; i++) {
                int idx = (head - count + i + MAX_SAMPLES) % MAX_SAMPLES;
                DiskSample s = samples[idx];
                if (s.timestampMs >= cutoff) {
                    oldest = s;
                    break;
                }
            }

            if (oldest == null || oldest == newest) {
                return null;
            }

            long elapsedMs = newest.timestampMs - oldest.timestampMs;
            if (elapsedMs <= 0) {
                return null;
            }

            long deltaBytes = newest.recordingsTotalBytes - oldest.recordingsTotalBytes;
            return (deltaBytes * 3_600_000L) / elapsedMs;
        }

        synchronized Long timeToFullSeconds(long windowMs, long diskTotalBytes, long diskUsedBytes) {
            Long rate = growthRateBytesPerHour(windowMs);
            if (rate == null || rate <= 0) {
                return null;
            }
            long remaining = diskTotalBytes - diskUsedBytes;
            if (remaining <= 0) {
                return 0L;
            }
            return (remaining * 3600L) / rate;
        }
    }

    private final ConcurrentHashMap<Integer, NodeDiskHistory> histories = new ConcurrentHashMap<>();

    public void record(int nodeId, long timestampMs, long recordingsTotalBytes) {
        histories.computeIfAbsent(nodeId, id -> new NodeDiskHistory())
                .record(timestampMs, recordingsTotalBytes);
    }

    public Map<String, Object> getGrowthStats(int nodeId, long diskTotalBytes, long diskUsedBytes) {
        NodeDiskHistory history = histories.get(nodeId);
        Map<String, Object> stats = new LinkedHashMap<>();
        if (history == null) {
            stats.put("growthRate5m", null);
            stats.put("growthRate1h", null);
            stats.put("growthRate24h", null);
            stats.put("timeToFullSeconds", null);
            return stats;
        }

        stats.put("growthRate5m", history.growthRateBytesPerHour(WINDOW_5M));
        stats.put("growthRate1h", history.growthRateBytesPerHour(WINDOW_1H));
        stats.put("growthRate24h", history.growthRateBytesPerHour(WINDOW_24H));

        Long ttf = history.timeToFullSeconds(WINDOW_1H, diskTotalBytes, diskUsedBytes);
        if (ttf == null) {
            ttf = history.timeToFullSeconds(WINDOW_5M, diskTotalBytes, diskUsedBytes);
        }
        stats.put("timeToFullSeconds", ttf);

        return stats;
    }
}

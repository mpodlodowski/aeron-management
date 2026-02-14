package it.podlodowski.aeronmgmt.agent;

import io.aeron.Aeron;
import io.aeron.archive.client.AeronArchive;
import io.aeron.archive.client.RecordingDescriptorConsumer;
import it.podlodowski.aeronmgmt.common.proto.ArchiveRecording;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Collects recording metadata from the local Aeron Archive.
 *
 * <p>The archive connection is established lazily and cached. Recording metadata
 * is refreshed at most every {@link #REFRESH_INTERVAL_MS} milliseconds to avoid
 * the overhead of querying the archive on every metrics tick.
 *
 * <p>If the archive is not available (e.g., during tests, or when the agent starts
 * before the cluster node), this collector returns an empty list and retries on
 * the next refresh interval.
 */
public class ArchiveMetricsCollector {

    private static final Logger LOGGER = LoggerFactory.getLogger(ArchiveMetricsCollector.class);

    /** How often to re-query the archive for recordings. */
    private static final long REFRESH_INTERVAL_MS = TimeUnit.SECONDS.toMillis(10);

    private final String aeronDir;

    private volatile List<ArchiveRecording> cachedRecordings = Collections.emptyList();
    private volatile long lastRefreshTimestamp = 0;

    public ArchiveMetricsCollector(String aeronDir) {
        this.aeronDir = aeronDir;
    }

    /**
     * Returns the current list of archive recordings.
     * The result is cached and refreshed at most every 10 seconds.
     *
     * @return list of archive recordings, or empty list if the archive is unavailable
     */
    public List<ArchiveRecording> collectRecordings() {
        long now = System.currentTimeMillis();
        if (now - lastRefreshTimestamp < REFRESH_INTERVAL_MS) {
            return cachedRecordings;
        }
        // Refresh outside the fast path
        cachedRecordings = fetchRecordings();
        lastRefreshTimestamp = System.currentTimeMillis();
        return cachedRecordings;
    }

    private List<ArchiveRecording> fetchRecordings() {
        List<ArchiveRecording> recordings = new ArrayList<>();

        try (Aeron aeron = Aeron.connect(new Aeron.Context().aeronDirectoryName(aeronDir));
             AeronArchive archive = AeronArchive.connect(
                     new AeronArchive.Context().aeron(aeron).ownsAeronClient(false))) {

            RecordingDescriptorConsumer consumer = (controlSessionId, correlationId,
                    recordingId, startTimestamp, stopTimestamp, startPosition, stopPosition,
                    initialTermId, segmentFileLength, termBufferLength, mtuLength,
                    sessionId, streamId, strippedChannel, originalChannel, sourceIdentity) -> {
                recordings.add(ArchiveRecording.newBuilder()
                        .setRecordingId(recordingId)
                        .setStreamId(streamId)
                        .setChannel(originalChannel)
                        .setStartPosition(startPosition)
                        .setStopPosition(stopPosition)
                        .setStartTimestamp(startTimestamp)
                        .setStopTimestamp(stopTimestamp)
                        .build());
            };

            int count = archive.listRecordings(0, Integer.MAX_VALUE, consumer);
            LOGGER.debug("Fetched {} archive recordings", count);

        } catch (Exception e) {
            LOGGER.debug("Archive not available, returning empty recordings list: {}", e.getMessage());
            return Collections.emptyList();
        }

        return Collections.unmodifiableList(recordings);
    }
}

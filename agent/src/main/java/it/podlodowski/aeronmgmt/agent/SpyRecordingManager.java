package it.podlodowski.aeronmgmt.agent;

import io.aeron.Aeron;
import io.aeron.archive.client.AeronArchive;
import io.aeron.archive.codecs.SourceLocation;
import it.podlodowski.aeronmgmt.common.proto.EgressRecordingStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Manages spy subscription recordings via the local AeronArchive.
 * Connects to the existing MediaDriver and Archive running alongside the cluster node.
 */
public class SpyRecordingManager implements AutoCloseable {

    private static final Logger LOGGER = LoggerFactory.getLogger(SpyRecordingManager.class);

    private final String aeronDir;
    private final CncReader cncReader;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    private volatile Aeron aeron;
    private volatile AeronArchive aeronArchive;
    private final AtomicReference<RecordingState> activeRecording = new AtomicReference<>();

    private record RecordingState(
            long subscriptionId,
            int streamId,
            String channel,
            long startTimeMs,
            long durationLimitSeconds,
            ScheduledFuture<?> autoStopFuture
    ) {}

    public SpyRecordingManager(String aeronDir, CncReader cncReader) {
        this.aeronDir = aeronDir;
        this.cncReader = cncReader;
    }

    /**
     * Connects to the local MediaDriver and AeronArchive.
     */
    public void connect() {
        try {
            aeron = Aeron.connect(new Aeron.Context().aeronDirectoryName(aeronDir));
            aeronArchive = AeronArchive.connect(new AeronArchive.Context()
                    .aeron(aeron)
                    .controlRequestChannel("aeron:ipc?term-length=64k")
                    .controlResponseChannel("aeron:ipc?term-length=64k"));
            LOGGER.info("Connected to AeronArchive via {}", aeronDir);
        } catch (Exception e) {
            LOGGER.warn("Failed to connect to AeronArchive: {}. Spy recording will be unavailable.", e.getMessage());
        }
    }

    /**
     * Starts a spy recording on the given stream ID.
     * Discovers the publication channel from CnC counters and uses the {@code aeron-spy:}
     * prefix for passive eavesdropping without interfering with the original subscriber.
     */
    public String startRecording(int streamId, long durationSeconds) {
        if (aeronArchive == null) {
            return "AeronArchive not connected";
        }
        if (activeRecording.get() != null) {
            return "Recording already active";
        }

        String channel = discoverChannelForStream(streamId);
        if (channel == null) {
            return "No publication found for stream " + streamId + " on this node";
        }

        // Use aeron-spy: prefix for passive eavesdropping on the publication
        // Add alias so the recording is identifiable in the archive catalog
        String spyChannel = "aeron-spy:" + channel + "|alias=egress";
        long subscriptionId = aeronArchive.startRecording(spyChannel, streamId, SourceLocation.LOCAL);

        ScheduledFuture<?> autoStop = null;
        if (durationSeconds > 0) {
            autoStop = scheduler.schedule(this::stopRecording, durationSeconds, TimeUnit.SECONDS);
        }

        RecordingState newState = new RecordingState(
                subscriptionId, streamId, channel,
                System.currentTimeMillis(), durationSeconds, autoStop);
        if (!activeRecording.compareAndSet(null, newState)) {
            // Another thread started a recording between our check and set
            aeronArchive.stopRecording(subscriptionId);
            if (autoStop != null) {
                autoStop.cancel(false);
            }
            return "Recording already active";
        }

        LOGGER.info("Started spy recording: channel={}, streamId={}, subscriptionId={}, duration={}s",
                spyChannel, streamId, subscriptionId, durationSeconds);
        return "Recording started on " + channel + " stream " + streamId;
    }

    /**
     * Stops the active spy recording.
     */
    public String stopRecording() {
        RecordingState state = activeRecording.getAndSet(null);
        if (state == null) {
            return "No active recording";
        }

        if (state.autoStopFuture != null) {
            state.autoStopFuture.cancel(false);
        }

        try {
            aeronArchive.stopRecording(state.subscriptionId);
            LOGGER.info("Stopped spy recording: subscriptionId={}", state.subscriptionId);
            return "Recording stopped";
        } catch (Exception e) {
            LOGGER.warn("Error stopping recording: {}", e.getMessage());
            return "Recording stop failed: " + e.getMessage();
        }
    }

    /**
     * Returns the current recording status for inclusion in metrics.
     */
    public EgressRecordingStatus getStatus() {
        RecordingState state = activeRecording.get();
        if (state == null) {
            return EgressRecordingStatus.getDefaultInstance();
        }
        return EgressRecordingStatus.newBuilder()
                .setActive(true)
                .setStartTimeMs(state.startTimeMs)
                .setDurationLimitSeconds(state.durationLimitSeconds)
                .setChannel(state.channel)
                .setStreamId(state.streamId)
                .build();
    }

    /**
     * Discovers the publication channel for a given stream ID by scanning CnC counters.
     * Looks for publisher limit (type 1, "pub-lmt:") or sender position (type 2, "snd-pos:")
     * counters matching the target stream ID.
     * Counter label format: "pub-lmt: <registrationId> <sessionId> <streamId> <channel>"
     */
    private String discoverChannelForStream(int targetStreamId) {
        CncReader.CncSnapshot snapshot = cncReader.read();
        for (var counter : snapshot.counters) {
            int typeId = counter.getTypeId();
            if (typeId != 1 && typeId != 2) {
                continue;
            }
            String label = counter.getLabel();
            // Match "pub-lmt: " (type 1) or "snd-pos: " (type 2)
            int colonIdx = label.indexOf(": ");
            if (colonIdx < 0) {
                continue;
            }
            // Label format after prefix: "<regId> <sessionId> <streamId> <channel>"
            String data = label.substring(colonIdx + 2);
            String[] parts = data.split(" ", 4);
            if (parts.length >= 4) {
                try {
                    int streamId = Integer.parseInt(parts[2]);
                    if (streamId == targetStreamId && parts[3].startsWith("aeron:")) {
                        LOGGER.info("Discovered channel for stream {}: {}", targetStreamId, parts[3]);
                        return parts[3];
                    }
                } catch (NumberFormatException ignored) {}
            }
        }
        LOGGER.warn("No publication found for stream {} in CnC counters", targetStreamId);
        return null;
    }

    @Override
    public void close() {
        RecordingState state = activeRecording.getAndSet(null);
        if (state != null && aeronArchive != null) {
            try {
                aeronArchive.stopRecording(state.subscriptionId);
            } catch (Exception ignored) {}
        }
        scheduler.shutdownNow();
        if (aeronArchive != null) {
            try { aeronArchive.close(); } catch (Exception ignored) {}
        }
        if (aeron != null) {
            try { aeron.close(); } catch (Exception ignored) {}
        }
    }
}

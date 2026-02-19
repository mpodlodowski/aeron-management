package it.podlodowski.aeronmgmt.agent;

import io.aeron.archive.codecs.CatalogHeaderDecoder;
import io.aeron.archive.codecs.RecordingDescriptorDecoder;
import io.aeron.archive.codecs.RecordingDescriptorHeaderDecoder;
import io.aeron.archive.codecs.RecordingState;
import it.podlodowski.aeronmgmt.common.proto.ArchiveRecording;
import org.agrona.IoUtil;
import org.agrona.concurrent.UnsafeBuffer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.nio.MappedByteBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Collects recording metadata by reading the Aeron Archive catalog file directly.
 *
 * <p>No live IPC connection needed — works for both cluster nodes (embedded archive)
 * and backup nodes. Recording metadata is refreshed at most every 10 seconds.
 */
public class ArchiveMetricsCollector {

    private static final Logger LOGGER = LoggerFactory.getLogger(ArchiveMetricsCollector.class);
    private static final long REFRESH_INTERVAL_MS = TimeUnit.SECONDS.toMillis(10);

    private final File archiveDir;

    private volatile List<ArchiveRecording> cachedRecordings = Collections.emptyList();
    private volatile long lastRefreshTimestamp = 0;

    /**
     * Metadata for a single recording, sufficient for reading segment files.
     */
    public record RecordingInfo(
            long recordingId,
            long startPosition,
            long stopPosition,
            int segmentFileLength
    ) {
        public long dataLength() {
            return stopPosition >= 0 ? stopPosition - startPosition : -1;
        }
    }

    public ArchiveMetricsCollector(String clusterDir) {
        File cluster = new File(clusterDir);
        this.archiveDir = new File(cluster.getParentFile(), "archive");
    }

    public File getArchiveDir() {
        return archiveDir;
    }

    public List<ArchiveRecording> collectRecordings() {
        long now = System.currentTimeMillis();
        if (now - lastRefreshTimestamp < REFRESH_INTERVAL_MS) {
            return cachedRecordings;
        }
        cachedRecordings = readCatalog();
        lastRefreshTimestamp = System.currentTimeMillis();
        return cachedRecordings;
    }

    /**
     * Looks up a single recording by ID from the archive catalog.
     *
     * @param recordingId the recording ID to find
     * @return the recording info, or null if not found or catalog doesn't exist
     */
    public RecordingInfo lookupRecording(long recordingId) {
        File catalogFile = new File(archiveDir, "archive.catalog");
        if (!catalogFile.exists()) {
            return null;
        }

        MappedByteBuffer mappedBuffer = null;
        try {
            mappedBuffer = IoUtil.mapExistingFile(catalogFile, "archive-catalog");
            UnsafeBuffer buffer = new UnsafeBuffer(mappedBuffer);

            CatalogHeaderDecoder headerDecoder = new CatalogHeaderDecoder();
            headerDecoder.wrap(buffer, 0, CatalogHeaderDecoder.BLOCK_LENGTH, CatalogHeaderDecoder.SCHEMA_VERSION);

            int offset = Math.max(CatalogHeaderDecoder.BLOCK_LENGTH, headerDecoder.length());

            RecordingDescriptorHeaderDecoder recordingHeaderDecoder = new RecordingDescriptorHeaderDecoder();
            RecordingDescriptorDecoder descriptorDecoder = new RecordingDescriptorDecoder();

            while (offset + RecordingDescriptorHeaderDecoder.BLOCK_LENGTH <= buffer.capacity()) {
                recordingHeaderDecoder.wrap(buffer, offset,
                        RecordingDescriptorHeaderDecoder.BLOCK_LENGTH,
                        RecordingDescriptorHeaderDecoder.SCHEMA_VERSION);

                int entryLength = recordingHeaderDecoder.length();
                if (entryLength <= 0) {
                    break;
                }

                int descriptorOffset = offset + RecordingDescriptorHeaderDecoder.BLOCK_LENGTH;
                descriptorDecoder.wrap(buffer, descriptorOffset,
                        RecordingDescriptorDecoder.BLOCK_LENGTH,
                        RecordingDescriptorDecoder.SCHEMA_VERSION);

                if (descriptorDecoder.recordingId() == recordingId
                        && recordingHeaderDecoder.state() != RecordingState.NULL_VAL) {
                    long stopPosition = descriptorDecoder.stopPosition();
                    if (stopPosition < 0) {
                        stopPosition = computeSegmentExtent(recordingId, descriptorDecoder.segmentFileLength());
                    }
                    return new RecordingInfo(
                            descriptorDecoder.recordingId(),
                            descriptorDecoder.startPosition(),
                            stopPosition,
                            descriptorDecoder.segmentFileLength()
                    );
                }

                offset += RecordingDescriptorHeaderDecoder.BLOCK_LENGTH + entryLength;
            }

            return null;

        } catch (Exception e) {
            LOGGER.warn("Failed to lookup recording {} in catalog: {}", recordingId, e.getMessage());
            return null;
        } finally {
            if (mappedBuffer != null) {
                IoUtil.unmap(mappedBuffer);
            }
        }
    }

    /**
     * Computes an upper-bound recording extent from segment files on disk.
     * For active recordings the catalog reports stopPosition = -1; this scans
     * segment files and returns (highest_segment_base + segment_file_length).
     * May overestimate by up to one segment length.
     */
    private long computeSegmentExtent(long recordingId, int segmentFileLength) {
        String prefix = recordingId + "-";
        File[] segments = archiveDir.listFiles((dir, name) ->
                name.startsWith(prefix) && name.endsWith(".rec"));

        if (segments == null || segments.length == 0) {
            return -1;
        }

        long maxBase = -1;
        for (File f : segments) {
            String name = f.getName();
            String basePart = name.substring(prefix.length(), name.length() - 4);
            try {
                long base = Long.parseLong(basePart);
                if (base > maxBase) maxBase = base;
            } catch (NumberFormatException ignored) {}
        }

        return maxBase >= 0 ? maxBase + segmentFileLength : -1;
    }

    private List<ArchiveRecording> readCatalog() {
        File catalogFile = new File(archiveDir, "archive.catalog");
        if (!catalogFile.exists()) {
            return Collections.emptyList();
        }

        MappedByteBuffer mappedBuffer = null;
        try {
            mappedBuffer = IoUtil.mapExistingFile(catalogFile, "archive-catalog");
            UnsafeBuffer buffer = new UnsafeBuffer(mappedBuffer);

            // Read catalog header
            CatalogHeaderDecoder headerDecoder = new CatalogHeaderDecoder();
            headerDecoder.wrap(buffer, 0, CatalogHeaderDecoder.BLOCK_LENGTH, CatalogHeaderDecoder.SCHEMA_VERSION);

            // In Aeron 1.46+, CatalogHeader.length is the header's own block length (32),
            // NOT the recording entry length. Each entry self-describes its size via
            // RecordingDescriptorHeader.length (typically 224).
            int offset = Math.max(CatalogHeaderDecoder.BLOCK_LENGTH, headerDecoder.length());

            List<ArchiveRecording> recordings = new ArrayList<>();
            RecordingDescriptorHeaderDecoder recordingHeaderDecoder = new RecordingDescriptorHeaderDecoder();
            RecordingDescriptorDecoder descriptorDecoder = new RecordingDescriptorDecoder();

            while (offset + RecordingDescriptorHeaderDecoder.BLOCK_LENGTH <= buffer.capacity()) {
                recordingHeaderDecoder.wrap(buffer, offset,
                        RecordingDescriptorHeaderDecoder.BLOCK_LENGTH,
                        RecordingDescriptorHeaderDecoder.SCHEMA_VERSION);

                int entryLength = recordingHeaderDecoder.length();
                if (entryLength <= 0) {
                    break;
                }

                int descriptorOffset = offset + RecordingDescriptorHeaderDecoder.BLOCK_LENGTH;
                descriptorDecoder.wrap(buffer, descriptorOffset,
                        RecordingDescriptorDecoder.BLOCK_LENGTH,
                        RecordingDescriptorDecoder.SCHEMA_VERSION);

                RecordingState state = recordingHeaderDecoder.state();
                if (descriptorDecoder.recordingId() >= 0 && state != RecordingState.NULL_VAL) {
                    long stopPosition = descriptorDecoder.stopPosition();
                    if (stopPosition < 0) {
                        stopPosition = computeSegmentExtent(
                                descriptorDecoder.recordingId(),
                                descriptorDecoder.segmentFileLength());
                    }
                    recordings.add(ArchiveRecording.newBuilder()
                            .setRecordingId(descriptorDecoder.recordingId())
                            .setStreamId(descriptorDecoder.streamId())
                            .setChannel(descriptorDecoder.originalChannel())
                            .setStartPosition(descriptorDecoder.startPosition())
                            .setStopPosition(stopPosition)
                            .setStartTimestamp(descriptorDecoder.startTimestamp())
                            .setStopTimestamp(descriptorDecoder.stopTimestamp())
                            .setState(state.name())
                            .build());
                }

                offset += RecordingDescriptorHeaderDecoder.BLOCK_LENGTH + entryLength;
            }

            LOGGER.debug("Read {} recordings from catalog", recordings.size());
            return Collections.unmodifiableList(recordings);

        } catch (Exception e) {
            LOGGER.warn("Failed to read archive catalog: {}", e.getMessage());
            return Collections.emptyList();
        } finally {
            if (mappedBuffer != null) {
                IoUtil.unmap(mappedBuffer);
            }
        }
    }
}

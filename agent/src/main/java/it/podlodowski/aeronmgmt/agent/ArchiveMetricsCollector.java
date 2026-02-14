package it.podlodowski.aeronmgmt.agent;

import io.aeron.archive.codecs.CatalogHeaderDecoder;
import io.aeron.archive.codecs.RecordingDescriptorDecoder;
import io.aeron.archive.codecs.RecordingDescriptorHeaderDecoder;
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

    public ArchiveMetricsCollector(String clusterDir) {
        File cluster = new File(clusterDir);
        this.archiveDir = new File(cluster.getParentFile(), "archive");
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

                if (descriptorDecoder.recordingId() >= 0) {
                    recordings.add(ArchiveRecording.newBuilder()
                            .setRecordingId(descriptorDecoder.recordingId())
                            .setStreamId(descriptorDecoder.streamId())
                            .setChannel(descriptorDecoder.originalChannel())
                            .setStartPosition(descriptorDecoder.startPosition())
                            .setStopPosition(descriptorDecoder.stopPosition())
                            .setStartTimestamp(descriptorDecoder.startTimestamp())
                            .setStopTimestamp(descriptorDecoder.stopTimestamp())
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

package it.podlodowski.aeronmgmt.agent;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.util.Arrays;

/**
 * Reads raw bytes from Aeron archive {@code .rec} segment files.
 */
public class RecordingBytesReader {

    static final int MAX_READ_LENGTH = 65536;

    private final File archiveDir;

    public RecordingBytesReader(File archiveDir) {
        this.archiveDir = archiveDir;
    }

    /**
     * Reads raw bytes from a recording's segment files.
     *
     * @param info   the recording metadata (from catalog lookup)
     * @param offset byte offset relative to the recording's start position
     * @param length maximum number of bytes to read
     * @return the bytes read (may be shorter than {@code length} if clamped)
     * @throws IOException              if an I/O error occurs reading a segment file
     * @throws IllegalArgumentException if a required segment file does not exist
     */
    public byte[] readBytes(ArchiveMetricsCollector.RecordingInfo info, long offset, int length) throws IOException {
        // Cap length at MAX_READ_LENGTH
        int cappedLength = Math.min(length, MAX_READ_LENGTH);

        // Clamp to recording data length
        long dataLength = info.dataLength();
        if (dataLength >= 0) {
            long available = dataLength - offset;
            if (available <= 0) {
                return new byte[0];
            }
            cappedLength = (int) Math.min(cappedLength, available);
        }

        byte[] result = new byte[cappedLength];
        int bytesRead = 0;
        long absolutePos = info.startPosition() + offset;
        int segmentFileLength = info.segmentFileLength();

        while (bytesRead < cappedLength) {
            long segmentBase = absolutePos - (absolutePos % segmentFileLength);
            String segmentFileName = info.recordingId() + "-" + segmentBase + ".rec";
            File segmentFile = new File(archiveDir, segmentFileName);

            if (!segmentFile.exists()) {
                throw new IllegalArgumentException("Segment file not found: " + segmentFileName);
            }

            int offsetInSegment = (int) (absolutePos - segmentBase);
            int remainingInSegment = segmentFileLength - offsetInSegment;
            int toRead = Math.min(cappedLength - bytesRead, remainingInSegment);

            try (RandomAccessFile raf = new RandomAccessFile(segmentFile, "r")) {
                raf.seek(offsetInSegment);
                raf.readFully(result, bytesRead, toRead);
            }

            bytesRead += toRead;
            absolutePos += toRead;
        }

        return result;
    }
}

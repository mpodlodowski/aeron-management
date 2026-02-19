package it.podlodowski.aeronmgmt.agent;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RecordingBytesReaderTest {

    @TempDir
    File tempDir;

    @Test
    void readBytesFromSingleSegment() throws IOException {
        byte[] data = new byte[256];
        for (int i = 0; i < data.length; i++) {
            data[i] = (byte) i;
        }
        writeFile("5-0.rec", data);

        RecordingBytesReader reader = new RecordingBytesReader(tempDir);
        ArchiveMetricsCollector.RecordingInfo info =
                new ArchiveMetricsCollector.RecordingInfo(5, 0, 256, 1048576);

        byte[] result = reader.readBytes(info, 0, 64);

        assertThat(result).hasSize(64);
        for (int i = 0; i < 64; i++) {
            assertThat(result[i]).isEqualTo((byte) i);
        }
    }

    @Test
    void readBytesWithOffset() throws IOException {
        byte[] data = new byte[256];
        for (int i = 0; i < data.length; i++) {
            data[i] = (byte) i;
        }
        writeFile("5-0.rec", data);

        RecordingBytesReader reader = new RecordingBytesReader(tempDir);
        ArchiveMetricsCollector.RecordingInfo info =
                new ArchiveMetricsCollector.RecordingInfo(5, 0, 256, 1048576);

        byte[] result = reader.readBytes(info, 128, 64);

        assertThat(result).hasSize(64);
        for (int i = 0; i < 64; i++) {
            assertThat(result[i]).isEqualTo((byte) (128 + i));
        }
    }

    @Test
    void readBytesClampedToRecordingEnd() throws IOException {
        byte[] data = new byte[100];
        for (int i = 0; i < data.length; i++) {
            data[i] = (byte) i;
        }
        writeFile("5-0.rec", data);

        RecordingBytesReader reader = new RecordingBytesReader(tempDir);
        ArchiveMetricsCollector.RecordingInfo info =
                new ArchiveMetricsCollector.RecordingInfo(5, 0, 100, 1048576);

        byte[] result = reader.readBytes(info, 0, 65536);

        assertThat(result).hasSize(100);
    }

    @Test
    void readBytesFromNonexistentSegmentThrows() {
        RecordingBytesReader reader = new RecordingBytesReader(tempDir);
        ArchiveMetricsCollector.RecordingInfo info =
                new ArchiveMetricsCollector.RecordingInfo(5, 0, 256, 1048576);

        assertThatThrownBy(() -> reader.readBytes(info, 0, 64))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Segment file not found");
    }

    @Test
    void readBytesWithNonZeroStartPosition() throws IOException {
        byte[] data = new byte[256];
        for (int i = 0; i < data.length; i++) {
            data[i] = (byte) i;
        }
        writeFile("7-1048576.rec", data);

        RecordingBytesReader reader = new RecordingBytesReader(tempDir);
        ArchiveMetricsCollector.RecordingInfo info =
                new ArchiveMetricsCollector.RecordingInfo(7, 1048576, 1048576 + 256, 1048576);

        byte[] result = reader.readBytes(info, 0, 64);

        assertThat(result).hasSize(64);
        for (int i = 0; i < 64; i++) {
            assertThat(result[i]).isEqualTo((byte) i);
        }
    }

    private void writeFile(String name, byte[] data) throws IOException {
        File file = new File(tempDir, name);
        try (FileOutputStream fos = new FileOutputStream(file)) {
            fos.write(data);
        }
    }
}

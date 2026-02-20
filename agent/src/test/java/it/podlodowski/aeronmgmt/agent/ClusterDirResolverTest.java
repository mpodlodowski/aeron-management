package it.podlodowski.aeronmgmt.agent;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ClusterDirResolverTest {

    private static Function<String, String> envFrom(Map<String, String> map) {
        return map::get;
    }

    // --- Node ID resolution chain ---

    @Test
    void nodeIdFromAgentNodeIdEnvVar() {
        Function<String, String> env = envFrom(Map.of(
                "AERON_MANAGEMENT_AGENT_NODE_ID", "5",
                "NODE_ID", "9"));
        assertThat(ClusterDirResolver.resolveNodeId(env)).isEqualTo(5);
    }

    @Test
    void nodeIdFromNodeIdEnvVar() {
        Function<String, String> env = envFrom(Map.of("NODE_ID", "3"));
        assertThat(ClusterDirResolver.resolveNodeId(env)).isEqualTo(3);
    }

    @Test
    void nodeIdFromPodName() {
        Function<String, String> env = envFrom(Map.of("POD_NAME", "aeron-cluster-2"));
        assertThat(ClusterDirResolver.resolveNodeId(env)).isEqualTo(2);
    }

    @Test
    void nodeIdFromHostname() {
        Function<String, String> env = envFrom(Map.of("HOSTNAME", "node-7"));
        assertThat(ClusterDirResolver.resolveNodeId(env)).isEqualTo(7);
    }

    @Test
    void nodeIdNullWhenNothingAvailable() {
        Function<String, String> env = envFrom(Map.of());
        assertThat(ClusterDirResolver.resolveNodeId(env)).isNull();
    }

    @Test
    void nodeIdIgnoresNonTrailingNumbers() {
        Function<String, String> env = envFrom(Map.of("HOSTNAME", "abc123def"));
        assertThat(ClusterDirResolver.resolveNodeId(env)).isNull();
    }

    // --- Template expansion ---

    @Test
    void templateExpandsNodeId(@TempDir Path tmp) throws IOException {
        Path markFile = tmp.resolve("aeron-cluster-2/cluster/cluster-mark.dat");
        Files.createDirectories(markFile.getParent());
        Files.createFile(markFile);

        String template = tmp + "/aeron-cluster-{node_id}/cluster";
        Function<String, String> env = envFrom(Map.of("NODE_ID", "2"));

        String resolved = ClusterDirResolver.resolve(template, env);
        assertThat(resolved).isEqualTo(tmp + "/aeron-cluster-2/cluster");
    }

    @Test
    void templateErrorsWhenNodeIdNull() {
        Function<String, String> env = envFrom(Map.of());
        assertThatThrownBy(() -> ClusterDirResolver.resolve("/path/{node_id}/cluster", env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("{node_id}");
    }

    // --- Direct path (backwards compatible) ---

    @Test
    void directPathWithMarkFile(@TempDir Path tmp) throws IOException {
        Path markFile = tmp.resolve("cluster/cluster-mark.dat");
        Files.createDirectories(markFile.getParent());
        Files.createFile(markFile);

        String result = ClusterDirResolver.resolve(tmp.resolve("cluster").toString(), envFrom(Map.of()));
        assertThat(result).isEqualTo(tmp.resolve("cluster").toString());
    }

    // --- Auto-scan fallback ---

    @Test
    void scanFindsMarkFile(@TempDir Path tmp) throws IOException {
        Path markFile = tmp.resolve("aeron-cluster-0/cluster/cluster-mark.dat");
        Files.createDirectories(markFile.getParent());
        Files.createFile(markFile);

        String result = ClusterDirResolver.resolve(tmp.toString(), envFrom(Map.of()));
        assertThat(result).isEqualTo(markFile.getParent().toString());
    }

    @Test
    void scanErrorsOnMultipleMarkFiles(@TempDir Path tmp) throws IOException {
        for (int i = 0; i < 2; i++) {
            Path markFile = tmp.resolve("aeron-cluster-" + i + "/cluster/cluster-mark.dat");
            Files.createDirectories(markFile.getParent());
            Files.createFile(markFile);
        }

        Function<String, String> env = envFrom(Map.of());
        assertThatThrownBy(() -> ClusterDirResolver.resolve(tmp.toString(), env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("multiple");
    }

    @Test
    void scanErrorsWhenNoMarkFile(@TempDir Path tmp) {
        Function<String, String> env = envFrom(Map.of());
        assertThatThrownBy(() -> ClusterDirResolver.resolve(tmp.toString(), env))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("No cluster-mark.dat");
    }
}

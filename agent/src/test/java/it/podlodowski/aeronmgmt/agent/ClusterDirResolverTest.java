package it.podlodowski.aeronmgmt.agent;

import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;

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
}

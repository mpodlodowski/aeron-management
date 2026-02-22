package it.podlodowski.aeronmgmt.server.events;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class ClusterEventTest {

    @Test
    void shouldBuildClusterEvent() {
        UUID id = UUID.randomUUID();
        Instant timestamp = Instant.parse("2026-01-15T10:30:00Z");
        Instant createdAt = Instant.parse("2026-01-15T10:30:01Z");
        Map<String, Object> details = Map.of("previousLeader", 1, "newLeader", 2);

        ClusterEvent event = ClusterEvent.builder()
                .id(id)
                .clusterId("cluster-1")
                .timestamp(timestamp)
                .level(EventLevel.NODE)
                .type("LEADER_ELECTED")
                .nodeId(2)
                .agentId("agent-node-2")
                .message("Node 2 elected as leader")
                .username("admin")
                .source(EventSource.REALTIME)
                .createdAt(createdAt)
                .details(details)
                .build();

        assertEquals(id, event.getId());
        assertEquals("cluster-1", event.getClusterId());
        assertEquals(timestamp, event.getTimestamp());
        assertEquals(EventLevel.NODE, event.getLevel());
        assertEquals("LEADER_ELECTED", event.getType());
        assertEquals(2, event.getNodeId());
        assertEquals("agent-node-2", event.getAgentId());
        assertEquals("Node 2 elected as leader", event.getMessage());
        assertEquals("admin", event.getUsername());
        assertEquals(EventSource.REALTIME, event.getSource());
        assertEquals(createdAt, event.getCreatedAt());
        assertEquals(details, event.getDetails());
    }

    @Test
    void shouldDefaultUsernameToSystem() {
        ClusterEvent event = ClusterEvent.builder()
                .clusterId("cluster-1")
                .timestamp(Instant.now())
                .level(EventLevel.CLUSTER)
                .type("SNAPSHOT_REQUESTED")
                .message("Snapshot requested for cluster")
                .build();

        assertEquals("system", event.getUsername());
        assertEquals(EventSource.REALTIME, event.getSource());
        assertNotNull(event.getId());
        assertNotNull(event.getCreatedAt());
    }

    @Test
    void shouldAllowNullNodeIdForClusterEvents() {
        ClusterEvent event = ClusterEvent.builder()
                .clusterId("cluster-1")
                .timestamp(Instant.now())
                .level(EventLevel.CLUSTER)
                .type("CLUSTER_HEALTHY")
                .message("All nodes healthy")
                .build();

        assertNull(event.getNodeId());
        assertNull(event.getAgentId());
    }
}

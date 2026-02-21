package it.podlodowski.aeronmgmt.server.events;

import io.grpc.Server;
import it.podlodowski.aeronmgmt.server.grpc.AgentConnectionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class ClusterEventRepositoryTest {

    @Autowired
    private ClusterEventRepository repository;

    @MockBean
    private Server grpcServer;

    @MockBean
    private AgentConnectionService agentConnectionService;

    @Test
    void shouldSaveAndFindByClusterIdAndTimestampRange() {
        Instant now = Instant.now();
        String clusterId = "test-cluster-save";

        ClusterEvent event = ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(now)
                .level(EventLevel.CLUSTER)
                .type("LEADER_ELECTED")
                .nodeId(0)
                .message("Node 0 elected as leader")
                .username("system")
                .source(EventSource.REALTIME)
                .build();

        repository.save(event);

        PageRequest pageable = PageRequest.of(0, 10, Sort.by(Sort.Direction.DESC, "timestamp"));
        Page<ClusterEvent> results = repository.findByClusterIdAndTimestampBetween(
                clusterId,
                now.minus(1, ChronoUnit.HOURS),
                now.plus(1, ChronoUnit.HOURS),
                pageable);

        assertThat(results.getTotalElements()).isEqualTo(1);
        ClusterEvent found = results.getContent().get(0);
        assertThat(found.getClusterId()).isEqualTo(clusterId);
        assertThat(found.getType()).isEqualTo("LEADER_ELECTED");
        assertThat(found.getMessage()).isEqualTo("Node 0 elected as leader");
        assertThat(found.getLevel()).isEqualTo(EventLevel.CLUSTER);
    }

    @Test
    void shouldFilterByLevels() {
        Instant now = Instant.now();
        String clusterId = "test-cluster-levels";

        ClusterEvent clusterEvent = ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(now)
                .level(EventLevel.CLUSTER)
                .type("LEADER_ELECTED")
                .message("Leader elected")
                .username("system")
                .source(EventSource.REALTIME)
                .build();

        ClusterEvent nodeEvent = ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(now.plusMillis(1))
                .level(EventLevel.NODE)
                .type("NODE_ROLE_CHANGE")
                .nodeId(1)
                .message("Node role changed")
                .username("system")
                .source(EventSource.REALTIME)
                .build();

        ClusterEvent agentEvent = ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(now.plusMillis(2))
                .level(EventLevel.AGENT)
                .type("AGENT_CONNECTED")
                .agentId("agent-1")
                .message("Agent connected")
                .username("system")
                .source(EventSource.REALTIME)
                .build();

        repository.saveAll(List.of(clusterEvent, nodeEvent, agentEvent));

        PageRequest pageable = PageRequest.of(0, 10, Sort.by(Sort.Direction.DESC, "timestamp"));
        Page<ClusterEvent> results = repository.findByClusterIdAndTimestampBetweenAndLevelIn(
                clusterId,
                now.minus(1, ChronoUnit.HOURS),
                now.plus(1, ChronoUnit.HOURS),
                List.of(EventLevel.CLUSTER, EventLevel.NODE),
                pageable);

        assertThat(results.getTotalElements()).isEqualTo(2);
        assertThat(results.getContent())
                .extracting(ClusterEvent::getLevel)
                .containsExactlyInAnyOrder(EventLevel.CLUSTER, EventLevel.NODE);
    }

    @Test
    void shouldDeleteOlderThan() {
        Instant now = Instant.now();
        String clusterId = "test-cluster-delete";

        ClusterEvent oldEvent = ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(now.minus(10, ChronoUnit.DAYS))
                .level(EventLevel.CLUSTER)
                .type("OLD_EVENT")
                .message("Old event")
                .username("system")
                .source(EventSource.REALTIME)
                .createdAt(now.minus(10, ChronoUnit.DAYS))
                .build();

        ClusterEvent recentEvent = ClusterEvent.builder()
                .clusterId(clusterId)
                .timestamp(now.minus(1, ChronoUnit.DAYS))
                .level(EventLevel.CLUSTER)
                .type("RECENT_EVENT")
                .message("Recent event")
                .username("system")
                .source(EventSource.REALTIME)
                .build();

        repository.saveAll(List.of(oldEvent, recentEvent));

        assertThat(repository.countByClusterId(clusterId)).isEqualTo(2);

        Instant cutoff = now.minus(7, ChronoUnit.DAYS);
        int deleted = repository.deleteByTimestampBefore(cutoff);

        assertThat(deleted).isEqualTo(1);
        assertThat(repository.countByClusterId(clusterId)).isEqualTo(1);

        List<ClusterEvent> remaining = repository.findByClusterIdAndTimestampBetween(
                clusterId,
                now.minus(30, ChronoUnit.DAYS),
                now.plus(1, ChronoUnit.DAYS),
                PageRequest.of(0, 10)).getContent();
        assertThat(remaining).hasSize(1);
        assertThat(remaining.get(0).getType()).isEqualTo("RECENT_EVENT");
    }
}

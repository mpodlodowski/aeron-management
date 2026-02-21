package it.podlodowski.aeronmgmt.server.events;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.time.Instant;
import java.util.List;

import static org.mockito.Mockito.*;

class EventRetentionSchedulerTest {

    @Test
    void shouldDeleteEventsOlderThanRetentionDays() {
        ClusterEventRepository repo = mock(ClusterEventRepository.class);
        when(repo.count()).thenReturn(100L);

        EventRetentionScheduler scheduler = new EventRetentionScheduler(repo, 7, 10000);
        scheduler.cleanup();

        verify(repo).deleteByTimestampBefore(any(Instant.class));
        verify(repo, never()).deleteAll(anyList()); // count (100) < max (10000)
    }

    @Test
    void shouldPruneWhenCountExceedsMax() {
        ClusterEventRepository repo = mock(ClusterEventRepository.class);
        when(repo.count()).thenReturn(150L);
        when(repo.findAll(any(Pageable.class))).thenReturn(new PageImpl<>(List.of()));

        EventRetentionScheduler scheduler = new EventRetentionScheduler(repo, 7, 100);
        scheduler.cleanup();

        verify(repo).deleteByTimestampBefore(any(Instant.class));
        verify(repo).findAll(any(Pageable.class)); // should try to prune
    }

    @Test
    void shouldNotPruneWhenCountEqualsMax() {
        ClusterEventRepository repo = mock(ClusterEventRepository.class);
        when(repo.count()).thenReturn(100L);

        EventRetentionScheduler scheduler = new EventRetentionScheduler(repo, 7, 100);
        scheduler.cleanup();

        verify(repo).deleteByTimestampBefore(any(Instant.class));
        verify(repo, never()).findAll(any(Pageable.class));
        verify(repo, never()).deleteAll(anyList());
    }

    @Test
    void shouldDeleteCorrectNumberOfExcessEvents() {
        ClusterEventRepository repo = mock(ClusterEventRepository.class);
        when(repo.count()).thenReturn(105L);

        ClusterEvent event1 = ClusterEvent.builder()
                .clusterId("test").timestamp(Instant.now()).level(EventLevel.NODE)
                .type("TEST").message("old event 1").source(EventSource.REALTIME).build();
        ClusterEvent event2 = ClusterEvent.builder()
                .clusterId("test").timestamp(Instant.now()).level(EventLevel.NODE)
                .type("TEST").message("old event 2").source(EventSource.REALTIME).build();

        when(repo.findAll(any(Pageable.class))).thenReturn(new PageImpl<>(List.of(event1, event2)));

        EventRetentionScheduler scheduler = new EventRetentionScheduler(repo, 7, 100);
        scheduler.cleanup();

        verify(repo).findAll(argThat((Pageable p) -> p.getPageSize() == 5));
        verify(repo).deleteAll(List.of(event1, event2));
    }
}

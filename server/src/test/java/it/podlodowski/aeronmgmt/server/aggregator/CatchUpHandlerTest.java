package it.podlodowski.aeronmgmt.server.aggregator;

import it.podlodowski.aeronmgmt.common.proto.StateChangeEntry;
import it.podlodowski.aeronmgmt.server.events.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CatchUpHandlerTest {

    private EventService eventService;
    private ClusterStateAggregator aggregator;

    @BeforeEach
    void setUp() {
        eventService = mock(EventService.class);
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        aggregator = new ClusterStateAggregator(
                messagingTemplate, new DiskUsageTracker(), 300, "test-cluster", eventService);
    }

    @Test
    void shouldEmitMonitoringGapWhenPreviousEventsExist() {
        // Previous event exists
        ClusterEvent previousEvent = ClusterEvent.builder()
                .clusterId("test-cluster")
                .timestamp(Instant.ofEpochMilli(1000))
                .level(EventLevel.NODE)
                .type("ROLE_CHANGE")
                .nodeId(0)
                .message("previous event")
                .source(EventSource.REALTIME)
                .build();

        when(eventService.findLatestForNode("test-cluster", 0)).thenReturn(previousEvent);

        aggregator.processCatchUp(0, List.of(), Map.of());

        ArgumentCaptor<ClusterEvent> captor = ArgumentCaptor.forClass(ClusterEvent.class);
        verify(eventService).emit(captor.capture());

        ClusterEvent gapEvent = captor.getValue();
        assertEquals("MONITORING_GAP", gapEvent.getType());
        assertEquals(EventLevel.AGENT, gapEvent.getLevel());
        assertEquals(0, gapEvent.getNodeId());
    }

    @Test
    void shouldReplayRoleChangesFromBuffer() {
        when(eventService.findLatestForNode("test-cluster", 0)).thenReturn(null);

        StateChangeEntry roleChange = StateChangeEntry.newBuilder()
                .setTimestamp(5000L)
                .setCounterTypeId(201) // role
                .setOldValue(0L) // FOLLOWER
                .setNewValue(2L) // LEADER
                .build();

        aggregator.processCatchUp(0, List.of(roleChange), Map.of());

        ArgumentCaptor<ClusterEvent> captor = ArgumentCaptor.forClass(ClusterEvent.class);
        verify(eventService, times(2)).emit(captor.capture());

        List<ClusterEvent> events = captor.getAllValues();

        // First event: ROLE_CHANGE
        ClusterEvent roleEvent = events.get(0);
        assertEquals("ROLE_CHANGE", roleEvent.getType());
        assertEquals(EventLevel.NODE, roleEvent.getLevel());
        assertEquals(0, roleEvent.getNodeId());
        assertEquals(EventSource.CATCH_UP, roleEvent.getSource());
        assertEquals(Instant.ofEpochMilli(5000L), roleEvent.getTimestamp());
        assertTrue(roleEvent.getMessage().contains("FOLLOWER"));
        assertTrue(roleEvent.getMessage().contains("LEADER"));

        Map<String, Object> details = roleEvent.getDetails();
        assertEquals("FOLLOWER", details.get("from"));
        assertEquals("LEADER", details.get("to"));

        // Second event: LEADER_ELECTED (because new value is 2)
        ClusterEvent leaderEvent = events.get(1);
        assertEquals("LEADER_ELECTED", leaderEvent.getType());
        assertEquals(EventSource.CATCH_UP, leaderEvent.getSource());
        assertEquals(0, leaderEvent.getNodeId());
    }

    @Test
    void shouldReplayModuleStateChangesFromBuffer() {
        when(eventService.findLatestForNode("test-cluster", 1)).thenReturn(null);

        StateChangeEntry moduleChange = StateChangeEntry.newBuilder()
                .setTimestamp(6000L)
                .setCounterTypeId(200) // module state
                .setOldValue(0L) // INIT
                .setNewValue(1L) // ACTIVE
                .build();

        aggregator.processCatchUp(1, List.of(moduleChange), Map.of());

        ArgumentCaptor<ClusterEvent> captor = ArgumentCaptor.forClass(ClusterEvent.class);
        verify(eventService).emit(captor.capture());

        ClusterEvent event = captor.getValue();
        assertEquals("MODULE_STATE_CHANGE", event.getType());
        assertEquals(EventLevel.NODE, event.getLevel());
        assertEquals(1, event.getNodeId());
        assertEquals(EventSource.CATCH_UP, event.getSource());
        assertEquals(Instant.ofEpochMilli(6000L), event.getTimestamp());
        assertTrue(event.getMessage().contains("INIT"));
        assertTrue(event.getMessage().contains("ACTIVE"));

        Map<String, Object> details = event.getDetails();
        assertEquals("INIT", details.get("from"));
        assertEquals("ACTIVE", details.get("to"));
    }

    @Test
    void shouldReplayElectionStateChanges() {
        when(eventService.findLatestForNode("test-cluster", 0)).thenReturn(null);

        // Election started: CLOSED (17) -> something else
        StateChangeEntry electionStarted = StateChangeEntry.newBuilder()
                .setTimestamp(7000L)
                .setCounterTypeId(207)
                .setOldValue(17L) // CLOSED
                .setNewValue(1L)  // non-closed
                .build();

        // Election completed: something -> CLOSED (17)
        StateChangeEntry electionCompleted = StateChangeEntry.newBuilder()
                .setTimestamp(8000L)
                .setCounterTypeId(207)
                .setOldValue(1L)  // non-closed
                .setNewValue(17L) // CLOSED
                .build();

        aggregator.processCatchUp(0, List.of(electionStarted, electionCompleted), Map.of());

        ArgumentCaptor<ClusterEvent> captor = ArgumentCaptor.forClass(ClusterEvent.class);
        verify(eventService, times(2)).emit(captor.capture());

        List<ClusterEvent> events = captor.getAllValues();

        assertEquals("ELECTION_STARTED", events.get(0).getType());
        assertEquals(EventSource.CATCH_UP, events.get(0).getSource());
        assertEquals(Instant.ofEpochMilli(7000L), events.get(0).getTimestamp());

        assertEquals("ELECTION_COMPLETED", events.get(1).getType());
        assertEquals(EventSource.CATCH_UP, events.get(1).getSource());
        assertEquals(Instant.ofEpochMilli(8000L), events.get(1).getTimestamp());
    }

    @Test
    void shouldSkipBufferEntriesOlderThanLastKnownEvent() {
        ClusterEvent previousEvent = ClusterEvent.builder()
                .clusterId("test-cluster")
                .timestamp(Instant.ofEpochMilli(5000))
                .level(EventLevel.NODE)
                .type("ROLE_CHANGE")
                .nodeId(0)
                .message("previous event")
                .source(EventSource.REALTIME)
                .build();

        when(eventService.findLatestForNode("test-cluster", 0)).thenReturn(previousEvent);

        // Entry before last known event (should be skipped)
        StateChangeEntry oldEntry = StateChangeEntry.newBuilder()
                .setTimestamp(3000L) // before 5000
                .setCounterTypeId(201)
                .setOldValue(0L)
                .setNewValue(1L)
                .build();

        // Entry at exactly last known event (should be skipped - <= check)
        StateChangeEntry atEntry = StateChangeEntry.newBuilder()
                .setTimestamp(5000L) // equal to 5000
                .setCounterTypeId(201)
                .setOldValue(0L)
                .setNewValue(1L)
                .build();

        // Entry after last known event (should be replayed)
        StateChangeEntry newEntry = StateChangeEntry.newBuilder()
                .setTimestamp(7000L) // after 5000
                .setCounterTypeId(201)
                .setOldValue(0L) // FOLLOWER
                .setNewValue(1L) // CANDIDATE
                .build();

        aggregator.processCatchUp(0, List.of(oldEntry, atEntry, newEntry), Map.of());

        ArgumentCaptor<ClusterEvent> captor = ArgumentCaptor.forClass(ClusterEvent.class);
        // 1 MONITORING_GAP + 1 ROLE_CHANGE (only newEntry)
        verify(eventService, times(2)).emit(captor.capture());

        List<ClusterEvent> emitted = captor.getAllValues();
        assertEquals("MONITORING_GAP", emitted.get(0).getType());
        assertEquals("ROLE_CHANGE", emitted.get(1).getType());
        assertEquals(Instant.ofEpochMilli(7000L), emitted.get(1).getTimestamp());
    }

    @Test
    void shouldHandleEmptyBufferGracefully() {
        when(eventService.findLatestForNode("test-cluster", 0)).thenReturn(null);

        aggregator.processCatchUp(0, List.of(), Map.of());

        verify(eventService, never()).emit(any());
    }

    @Test
    void shouldHandleEmptyBufferWithNoPreviousEvents() {
        when(eventService.findLatestForNode("test-cluster", 2)).thenReturn(null);

        aggregator.processCatchUp(2, List.of(), Map.of());

        // No previous events, no buffer entries -> no events emitted
        verify(eventService, never()).emit(any());
    }

    @Test
    void shouldNotEmitLeaderElectedForNonLeaderRoleChange() {
        when(eventService.findLatestForNode("test-cluster", 0)).thenReturn(null);

        // Role change to CANDIDATE (not LEADER)
        StateChangeEntry roleChange = StateChangeEntry.newBuilder()
                .setTimestamp(5000L)
                .setCounterTypeId(201)
                .setOldValue(0L) // FOLLOWER
                .setNewValue(1L) // CANDIDATE
                .build();

        aggregator.processCatchUp(0, List.of(roleChange), Map.of());

        ArgumentCaptor<ClusterEvent> captor = ArgumentCaptor.forClass(ClusterEvent.class);
        verify(eventService, times(1)).emit(captor.capture());

        assertEquals("ROLE_CHANGE", captor.getValue().getType());
        // No LEADER_ELECTED event should be emitted
    }

    @Test
    void shouldNotEmitElectionEventsForNonTransitions() {
        when(eventService.findLatestForNode("test-cluster", 0)).thenReturn(null);

        // Election state change where neither old nor new is CLOSED
        StateChangeEntry entry = StateChangeEntry.newBuilder()
                .setTimestamp(5000L)
                .setCounterTypeId(207)
                .setOldValue(1L) // not CLOSED
                .setNewValue(3L) // not CLOSED
                .build();

        aggregator.processCatchUp(0, List.of(entry), Map.of());

        // No events should be emitted for non-boundary transitions
        verify(eventService, never()).emit(any());
    }
}

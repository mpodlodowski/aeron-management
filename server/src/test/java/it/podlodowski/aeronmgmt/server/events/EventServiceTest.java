package it.podlodowski.aeronmgmt.server.events;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class EventServiceTest {

    private ClusterEventRepository repository;
    private SimpMessagingTemplate messagingTemplate;
    private EventService eventService;

    @BeforeEach
    void setUp() {
        repository = mock(ClusterEventRepository.class);
        messagingTemplate = mock(SimpMessagingTemplate.class);
        eventService = new EventService(repository, messagingTemplate, new ObjectMapper());
    }

    @Test
    void shouldPersistAndBroadcastEvent() {
        ClusterEvent event = ClusterEvent.builder()
                .clusterId("prod")
                .timestamp(Instant.now())
                .level(EventLevel.NODE)
                .type("ROLE_CHANGE")
                .nodeId(1)
                .message("role changed")
                .source(EventSource.REALTIME)
                .details(Map.of("from", "FOLLOWER", "to", "LEADER"))
                .build();

        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        eventService.emit(event);

        // Verify persisted
        ArgumentCaptor<ClusterEvent> captor = ArgumentCaptor.forClass(ClusterEvent.class);
        verify(repository).save(captor.capture());
        ClusterEvent saved = captor.getValue();
        assertNotNull(saved.getDetailsJson());
        assertEquals("ROLE_CHANGE", saved.getType());

        // Verify broadcast to /events (not /alerts)
        verify(messagingTemplate).convertAndSend(
                eq("/topic/clusters/prod/events"), any(Map.class));
    }

    @Test
    void shouldSerializeDetailsToJson() {
        ClusterEvent event = ClusterEvent.builder()
                .clusterId("prod")
                .timestamp(Instant.now())
                .level(EventLevel.NODE)
                .type("LEADER_ELECTED")
                .nodeId(1)
                .message("leader elected")
                .source(EventSource.REALTIME)
                .details(Map.of("termId", 5, "previousLeaderId", 2))
                .build();

        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        eventService.emit(event);

        ArgumentCaptor<ClusterEvent> captor = ArgumentCaptor.forClass(ClusterEvent.class);
        verify(repository).save(captor.capture());
        String json = captor.getValue().getDetailsJson();
        assertTrue(json.contains("termId"));
        assertTrue(json.contains("previousLeaderId"));
    }

    @Test
    void shouldDeserializeDetailsFromJson() {
        ClusterEvent event = ClusterEvent.builder()
                .clusterId("prod")
                .timestamp(Instant.now())
                .level(EventLevel.NODE)
                .type("ROLE_CHANGE")
                .nodeId(1)
                .message("role changed")
                .source(EventSource.REALTIME)
                .build();
        event.setDetailsJson("{\"from\":\"FOLLOWER\",\"to\":\"LEADER\"}");

        Map<String, Object> details = eventService.deserializeDetails(event);
        assertEquals("FOLLOWER", details.get("from"));
        assertEquals("LEADER", details.get("to"));
    }

    @Test
    void shouldConvertEventToMap() {
        Instant now = Instant.now();
        ClusterEvent event = ClusterEvent.builder()
                .clusterId("prod")
                .timestamp(now)
                .level(EventLevel.NODE)
                .type("ROLE_CHANGE")
                .nodeId(1)
                .message("role changed")
                .source(EventSource.REALTIME)
                .build();
        event.setDetailsJson("{\"from\":\"FOLLOWER\"}");

        Map<String, Object> map = eventService.toMap(event);
        assertEquals("prod", map.get("clusterId"));
        assertEquals(now.toEpochMilli(), map.get("timestamp"));
        assertEquals("NODE", map.get("level"));
        assertEquals("ROLE_CHANGE", map.get("type"));
        assertEquals(1, map.get("nodeId"));
        assertEquals("REALTIME", map.get("source"));
    }
}

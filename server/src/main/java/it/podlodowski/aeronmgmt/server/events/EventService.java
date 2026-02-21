package it.podlodowski.aeronmgmt.server.events;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class EventService {

    private static final Logger LOGGER = LoggerFactory.getLogger(EventService.class);

    private final ClusterEventRepository repository;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;

    public EventService(ClusterEventRepository repository,
                        SimpMessagingTemplate messagingTemplate,
                        ObjectMapper objectMapper) {
        this.repository = repository;
        this.messagingTemplate = messagingTemplate;
        this.objectMapper = objectMapper;
    }

    public void emit(ClusterEvent event) {
        serializeDetails(event);
        repository.save(event);
        broadcastEvent(event);
        LOGGER.debug("Event emitted: type={}, clusterId={}, nodeId={}",
                event.getType(), event.getClusterId(), event.getNodeId());
    }

    private void serializeDetails(ClusterEvent event) {
        if (event.getDetails() != null && event.getDetailsJson() == null) {
            try {
                event.setDetailsJson(objectMapper.writeValueAsString(event.getDetails()));
            } catch (JsonProcessingException e) {
                LOGGER.warn("Failed to serialize event details: {}", e.getMessage());
            }
        }
    }

    public Map<String, Object> deserializeDetails(ClusterEvent event) {
        if (event.getDetailsJson() != null && !event.getDetailsJson().isEmpty()) {
            try {
                return objectMapper.readValue(event.getDetailsJson(),
                        new TypeReference<Map<String, Object>>() {});
            } catch (JsonProcessingException e) {
                LOGGER.warn("Failed to deserialize event details: {}", e.getMessage());
            }
        }
        return Map.of();
    }

    public Map<String, Object> toMap(ClusterEvent event) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", event.getId().toString());
        map.put("clusterId", event.getClusterId());
        map.put("timestamp", event.getTimestamp().toEpochMilli());
        map.put("level", event.getLevel().name());
        map.put("type", event.getType());
        map.put("nodeId", event.getNodeId());
        map.put("agentId", event.getAgentId());
        map.put("message", event.getMessage());
        map.put("username", event.getUsername());
        map.put("source", event.getSource().name());
        map.put("details", deserializeDetails(event));
        map.put("createdAt", event.getCreatedAt().toEpochMilli());
        return map;
    }

    private void broadcastEvent(ClusterEvent event) {
        try {
            messagingTemplate.convertAndSend(
                    "/topic/clusters/" + event.getClusterId() + "/events",
                    toMap(event));
        } catch (Exception e) {
            LOGGER.debug("Failed to broadcast event: {}", e.getMessage());
        }
    }
}

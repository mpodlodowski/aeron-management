package it.podlodowski.aeronmgmt.server.events;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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

    public ClusterEvent findLatestForNode(String clusterId, int nodeId) {
        return repository.findFirstByClusterIdAndNodeIdOrderByTimestampDesc(clusterId, nodeId);
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

    public Page<Map<String, Object>> query(EventQuery q, Pageable pageable) {
        Page<ClusterEvent> page;

        if (q.levels() != null && !q.levels().isEmpty()) {
            page = repository.findByClusterIdAndTimestampBetweenAndLevelIn(
                    q.clusterId(), q.from(), q.to(), q.levels(), pageable);
        } else if (q.nodeId() != null) {
            page = repository.findByClusterIdAndTimestampBetweenAndNodeId(
                    q.clusterId(), q.from(), q.to(), q.nodeId(), pageable);
        } else if (q.types() != null && !q.types().isEmpty()) {
            page = repository.findByClusterIdAndTimestampBetweenAndTypeIn(
                    q.clusterId(), q.from(), q.to(), q.types(), pageable);
        } else {
            page = repository.findByClusterIdAndTimestampBetween(
                    q.clusterId(), q.from(), q.to(), pageable);
        }

        List<Map<String, Object>> filtered = page.getContent().stream()
                .filter(e -> matchesFilters(e, q))
                .map(this::toMap)
                .collect(Collectors.toList());

        return new PageImpl<>(filtered, pageable, page.getTotalElements());
    }

    public Map<String, Object> getHistogram(String clusterId, Instant from, Instant to,
                                             int buckets, List<EventLevel> levels, Integer nodeId) {
        Sort sort = Sort.by(Sort.Direction.ASC, "timestamp");
        List<ClusterEvent> events = repository.findByClusterIdAndTimestampBetween(
                clusterId, from, to, sort);

        if (levels != null && !levels.isEmpty()) {
            events = events.stream()
                    .filter(e -> levels.contains(e.getLevel()))
                    .collect(Collectors.toList());
        }
        if (nodeId != null) {
            events = events.stream()
                    .filter(e -> nodeId.equals(e.getNodeId()))
                    .collect(Collectors.toList());
        }

        long fromMs = from.toEpochMilli();
        long toMs = to.toEpochMilli();
        long bucketSizeMs = (toMs - fromMs) / buckets;
        if (bucketSizeMs < 1) {
            bucketSizeMs = 1;
        }

        List<Map<String, Object>> bucketList = new ArrayList<>();
        for (int i = 0; i < buckets; i++) {
            long bucketFrom = fromMs + (long) i * bucketSizeMs;
            long bucketTo = (i == buckets - 1) ? toMs : bucketFrom + bucketSizeMs;
            int cluster = 0, node = 0, agent = 0;
            for (ClusterEvent e : events) {
                long ts = e.getTimestamp().toEpochMilli();
                if (ts >= bucketFrom && ts < bucketTo) {
                    switch (e.getLevel()) {
                        case CLUSTER -> cluster++;
                        case NODE -> node++;
                        case AGENT -> agent++;
                    }
                }
            }
            bucketList.add(Map.of(
                    "from", bucketFrom, "to", bucketTo,
                    "cluster", cluster, "node", node, "agent", agent));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("bucketSize", bucketSizeMs);
        result.put("buckets", bucketList);
        return result;
    }

    public void exportEvents(EventQuery q, String format, OutputStream out) throws IOException {
        Sort sort = "asc".equalsIgnoreCase(q.sort())
                ? Sort.by(Sort.Direction.ASC, "timestamp")
                : Sort.by(Sort.Direction.DESC, "timestamp");
        List<ClusterEvent> events = repository.findByClusterIdAndTimestampBetween(
                q.clusterId(), q.from(), q.to(), sort);

        events = events.stream()
                .filter(e -> matchesFilters(e, q))
                .collect(Collectors.toList());

        if ("csv".equalsIgnoreCase(format)) {
            writeCsv(events, out);
        } else {
            writeJson(events, out);
        }
    }

    private boolean matchesFilters(ClusterEvent event, EventQuery q) {
        if (q.levels() != null && !q.levels().isEmpty() && !q.levels().contains(event.getLevel())) {
            return false;
        }
        if (q.types() != null && !q.types().isEmpty() && !q.types().contains(event.getType())) {
            return false;
        }
        if (q.nodeId() != null && !q.nodeId().equals(event.getNodeId())) {
            return false;
        }
        if (q.agentId() != null && !q.agentId().isEmpty()
                && !q.agentId().equals(event.getAgentId())) {
            return false;
        }
        if (q.search() != null && !q.search().isEmpty()) {
            String lower = q.search().toLowerCase();
            if (event.getMessage() == null || !event.getMessage().toLowerCase().contains(lower)) {
                return false;
            }
        }
        return true;
    }

    private void writeCsv(List<ClusterEvent> events, OutputStream out) throws IOException {
        PrintWriter writer = new PrintWriter(new OutputStreamWriter(out, StandardCharsets.UTF_8));
        writer.println("id,clusterId,timestamp,level,type,nodeId,agentId,message,username,source");
        for (ClusterEvent e : events) {
            writer.printf("%s,%s,%d,%s,%s,%s,%s,\"%s\",%s,%s%n",
                    e.getId(), e.getClusterId(), e.getTimestamp().toEpochMilli(),
                    e.getLevel(), e.getType(),
                    e.getNodeId() != null ? e.getNodeId() : "",
                    e.getAgentId() != null ? e.getAgentId() : "",
                    escapeCsv(e.getMessage()),
                    e.getUsername(), e.getSource());
        }
        writer.flush();
    }

    private void writeJson(List<ClusterEvent> events, OutputStream out) throws IOException {
        List<Map<String, Object>> maps = events.stream()
                .map(this::toMap)
                .collect(Collectors.toList());
        objectMapper.writeValue(out, maps);
    }

    private String escapeCsv(String value) {
        if (value == null) return "";
        return value.replace("\"", "\"\"");
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

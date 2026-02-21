package it.podlodowski.aeronmgmt.server.events;

import java.time.Instant;
import java.util.List;

public record EventQuery(
    String clusterId,
    Instant from,
    Instant to,
    List<EventLevel> levels,
    List<String> types,
    Integer nodeId,
    String agentId,
    String search,
    String sort
) {}

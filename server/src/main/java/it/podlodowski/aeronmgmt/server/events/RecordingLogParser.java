package it.podlodowski.aeronmgmt.server.events;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses raw text output from {@code ClusterTool.recordingLog()} into structured entries,
 * and converts those entries into {@link ClusterEvent} objects for reconciliation.
 */
public final class RecordingLogParser {

    private static final Pattern ENTRY_PATTERN = Pattern.compile("Entry\\{([^}]+)}");
    private static final Pattern KEY_VALUE_PATTERN = Pattern.compile("(\\w+)=(-?\\w+)");

    private RecordingLogParser() {
    }

    public record Entry(
            long recordingId,
            long leadershipTermId,
            long termBaseLogPosition,
            long logPosition,
            long timestamp,
            int serviceId,
            String type
    ) {
    }

    /**
     * Parses the raw recording log output into a list of entries.
     * Handles both one-entry-per-line format and the RecordingLog{entries=[...]} toString() format.
     */
    public static List<Entry> parse(String output) {
        if (output == null || output.isBlank()) {
            return List.of();
        }

        List<Entry> entries = new ArrayList<>();
        Matcher entryMatcher = ENTRY_PATTERN.matcher(output);
        while (entryMatcher.find()) {
            String entryContent = entryMatcher.group(1);
            Map<String, String> fields = extractKeyValuePairs(entryContent);
            if (!hasRequiredFields(fields)) {
                continue;
            }

            try {
                Entry entry = new Entry(
                        Long.parseLong(fields.get("recordingId")),
                        Long.parseLong(fields.get("leadershipTermId")),
                        Long.parseLong(fields.get("termBaseLogPosition")),
                        Long.parseLong(fields.get("logPosition")),
                        Long.parseLong(fields.get("timestamp")),
                        Integer.parseInt(fields.get("serviceId")),
                        fields.get("type")
                );
                entries.add(entry);
            } catch (NumberFormatException e) {
                // Skip entries with unparseable numeric fields
            }
        }

        return entries;
    }

    /**
     * Parses the recording log output and converts entries into {@link ClusterEvent} objects
     * suitable for reconciliation. Produces:
     * <ul>
     *   <li>A single {@code CLUSTER_START} event using the earliest timestamp</li>
     *   <li>{@code LEADER_ELECTED} events for each TERM entry</li>
     *   <li>{@code SNAPSHOT_TAKEN} events for each SNAPSHOT entry (serviceId=-1 only, to avoid duplicates)</li>
     * </ul>
     */
    public static List<ClusterEvent> toEvents(String clusterId, int nodeId, String output) {
        List<Entry> entries = parse(output);
        if (entries.isEmpty()) {
            return List.of();
        }

        List<ClusterEvent> events = new ArrayList<>();

        // Find earliest timestamp for CLUSTER_START
        long earliest = Long.MAX_VALUE;
        for (Entry e : entries) {
            if (e.timestamp > 0 && e.timestamp < earliest) {
                earliest = e.timestamp;
            }
        }
        if (earliest < Long.MAX_VALUE) {
            events.add(EventFactory.clusterStart(clusterId, earliest));
        }

        // Convert TERM entries to LEADER_ELECTED events
        for (Entry e : entries) {
            if ("TERM".equals(e.type)) {
                Map<String, Object> details = new LinkedHashMap<>();
                details.put("termId", e.leadershipTermId);
                details.put("logPosition", e.logPosition);
                details.put("recordingId", e.recordingId);

                ClusterEvent event = ClusterEvent.builder()
                        .clusterId(clusterId)
                        .timestamp(Instant.ofEpochMilli(e.timestamp))
                        .level(EventLevel.NODE)
                        .type("LEADER_ELECTED")
                        .message("leader elected (term " + e.leadershipTermId + ")")
                        .source(EventSource.RECONCILIATION)
                        .details(details)
                        .build();
                events.add(event);
            }
        }

        // Convert SNAPSHOT entries to SNAPSHOT_TAKEN events (only serviceId=-1 to avoid duplicates)
        for (Entry e : entries) {
            if ("SNAPSHOT".equals(e.type) && e.serviceId == -1) {
                Map<String, Object> details = new LinkedHashMap<>();
                details.put("termId", e.leadershipTermId);
                details.put("logPosition", e.logPosition);
                details.put("recordingId", e.recordingId);

                ClusterEvent event = ClusterEvent.builder()
                        .clusterId(clusterId)
                        .timestamp(Instant.ofEpochMilli(e.timestamp))
                        .level(EventLevel.NODE)
                        .type("SNAPSHOT_TAKEN")
                        .nodeId(nodeId)
                        .message("snapshot taken (term " + e.leadershipTermId + ") on node " + nodeId)
                        .source(EventSource.RECONCILIATION)
                        .details(details)
                        .build();
                events.add(event);
            }
        }

        return events;
    }

    private static Map<String, String> extractKeyValuePairs(String text) {
        Map<String, String> fields = new LinkedHashMap<>();
        Matcher matcher = KEY_VALUE_PATTERN.matcher(text);
        while (matcher.find()) {
            fields.put(matcher.group(1), matcher.group(2));
        }
        return fields;
    }

    private static boolean hasRequiredFields(Map<String, String> fields) {
        return fields.containsKey("recordingId")
                && fields.containsKey("leadershipTermId")
                && fields.containsKey("termBaseLogPosition")
                && fields.containsKey("logPosition")
                && fields.containsKey("timestamp")
                && fields.containsKey("serviceId")
                && fields.containsKey("type");
    }
}

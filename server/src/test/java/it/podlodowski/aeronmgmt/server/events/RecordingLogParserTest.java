package it.podlodowski.aeronmgmt.server.events;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RecordingLogParserTest {

    @Test
    void shouldParseTermEntries() {
        String output = """
            0: recordingId=1 leadershipTermId=0 termBaseLogPosition=0 logPosition=736 timestamp=1708412400100 memberId=0 isStartup type=TERM entryIndex=0
            1: recordingId=2 leadershipTermId=1 termBaseLogPosition=736 logPosition=1472 timestamp=1708412500000 memberId=1 type=TERM entryIndex=1
            """;

        List<RecordingLogParser.Entry> entries = RecordingLogParser.parse(output);

        assertEquals(2, entries.size());
        assertEquals(1, entries.get(0).recordingId());
        assertEquals(0, entries.get(0).leadershipTermId());
        assertEquals(0, entries.get(0).memberId());
        assertEquals("TERM", entries.get(0).type());
        assertEquals(736, entries.get(0).logPosition());
        assertEquals(1708412400100L, entries.get(0).timestamp());
        assertEquals(2, entries.get(1).recordingId());
        assertEquals(1, entries.get(1).leadershipTermId());
        assertEquals(1, entries.get(1).memberId());
        assertEquals(1472, entries.get(1).logPosition());
    }

    @Test
    void shouldParseSnapshotEntries() {
        String output = """
            0: recordingId=0 leadershipTermId=0 termBaseLogPosition=0 logPosition=736 timestamp=1708412400000 memberId=0 type=SNAPSHOT entryIndex=0
            """;

        List<RecordingLogParser.Entry> entries = RecordingLogParser.parse(output);

        assertEquals(1, entries.size());
        assertEquals("SNAPSHOT", entries.get(0).type());
        assertEquals(736, entries.get(0).logPosition());
        assertEquals(0, entries.get(0).recordingId());
        assertEquals(0, entries.get(0).termBaseLogPosition());
    }

    @Test
    void shouldConvertToEvents() {
        String output = """
            0: recordingId=0 leadershipTermId=0 termBaseLogPosition=0 logPosition=736 timestamp=1708412400000 memberId=0 type=SNAPSHOT entryIndex=0
            1: recordingId=1 leadershipTermId=0 termBaseLogPosition=0 logPosition=736 timestamp=1708412400100 memberId=0 isStartup type=TERM entryIndex=1
            2: recordingId=2 leadershipTermId=1 termBaseLogPosition=736 logPosition=1472 timestamp=1708412500000 memberId=1 type=TERM entryIndex=2
            """;

        List<ClusterEvent> events = RecordingLogParser.toEvents("prod", output);

        // Should produce: 1 CLUSTER_START + 1 SNAPSHOT_TAKEN + 2 LEADER_ELECTED
        assertTrue(events.stream().anyMatch(e -> "CLUSTER_START".equals(e.getType())));
        assertTrue(events.stream().anyMatch(e -> "SNAPSHOT_TAKEN".equals(e.getType())));
        long leaderEvents = events.stream().filter(e -> "LEADER_ELECTED".equals(e.getType())).count();
        assertEquals(2, leaderEvents);
        events.forEach(e -> assertEquals(EventSource.RECONCILIATION, e.getSource()));
    }

    @Test
    void shouldSetCorrectTimestampsOnEvents() {
        String output = """
            0: recordingId=1 leadershipTermId=0 termBaseLogPosition=0 logPosition=736 timestamp=1708412400100 memberId=0 isStartup type=TERM entryIndex=0
            """;

        List<ClusterEvent> events = RecordingLogParser.toEvents("prod", output);

        // CLUSTER_START uses earliest timestamp
        ClusterEvent clusterStart = events.stream()
                .filter(e -> "CLUSTER_START".equals(e.getType()))
                .findFirst()
                .orElseThrow();
        assertEquals(1708412400100L, clusterStart.getTimestamp().toEpochMilli());

        // LEADER_ELECTED uses the entry's timestamp
        ClusterEvent leaderElected = events.stream()
                .filter(e -> "LEADER_ELECTED".equals(e.getType()))
                .findFirst()
                .orElseThrow();
        assertEquals(1708412400100L, leaderElected.getTimestamp().toEpochMilli());
        assertEquals(0, leaderElected.getNodeId());
    }

    @Test
    void shouldSetCorrectDetailsOnLeaderElectedEvents() {
        String output = """
            0: recordingId=5 leadershipTermId=3 termBaseLogPosition=2208 logPosition=2944 timestamp=1708412500000 memberId=1 type=TERM entryIndex=0
            """;

        List<ClusterEvent> events = RecordingLogParser.toEvents("prod", output);

        ClusterEvent leaderElected = events.stream()
                .filter(e -> "LEADER_ELECTED".equals(e.getType()))
                .findFirst()
                .orElseThrow();

        assertEquals(EventLevel.NODE, leaderElected.getLevel());
        assertEquals(1, leaderElected.getNodeId());
        assertEquals("leader elected (term 3)", leaderElected.getMessage());
        assertEquals(3L, leaderElected.getDetails().get("termId"));
        assertEquals(2944L, leaderElected.getDetails().get("logPosition"));
        assertEquals(5L, leaderElected.getDetails().get("recordingId"));
    }

    @Test
    void shouldSetCorrectDetailsOnSnapshotEvents() {
        String output = """
            0: recordingId=6 leadershipTermId=2 termBaseLogPosition=1472 logPosition=2208 timestamp=1708412450000 memberId=0 type=SNAPSHOT entryIndex=0
            """;

        List<ClusterEvent> events = RecordingLogParser.toEvents("prod", output);

        ClusterEvent snapshot = events.stream()
                .filter(e -> "SNAPSHOT_TAKEN".equals(e.getType()))
                .findFirst()
                .orElseThrow();

        assertEquals(EventLevel.CLUSTER, snapshot.getLevel());
        assertEquals(0, snapshot.getNodeId());
        assertEquals("snapshot taken (term 2)", snapshot.getMessage());
        assertEquals(2L, snapshot.getDetails().get("termId"));
        assertEquals(2208L, snapshot.getDetails().get("logPosition"));
        assertEquals(6L, snapshot.getDetails().get("recordingId"));
    }

    @Test
    void shouldHandleEmptyOutput() {
        List<RecordingLogParser.Entry> entries = RecordingLogParser.parse("");
        assertTrue(entries.isEmpty());

        List<ClusterEvent> events = RecordingLogParser.toEvents("prod", "");
        assertTrue(events.isEmpty());
    }

    @Test
    void shouldHandleNullOutput() {
        List<RecordingLogParser.Entry> entries = RecordingLogParser.parse(null);
        assertTrue(entries.isEmpty());

        List<ClusterEvent> events = RecordingLogParser.toEvents("prod", null);
        assertTrue(events.isEmpty());
    }

    @Test
    void shouldHandleMalformedLines() {
        String output = """
            garbage line with no key=value pairs
            0: recordingId=1 leadershipTermId=0 termBaseLogPosition=0 logPosition=736 timestamp=1708412400100 memberId=0 type=TERM entryIndex=0
            another garbage line
            """;

        List<RecordingLogParser.Entry> entries = RecordingLogParser.parse(output);
        assertEquals(1, entries.size()); // only the valid line
    }

    @Test
    void shouldUseEarliestTimestampForClusterStart() {
        String output = """
            0: recordingId=1 leadershipTermId=0 termBaseLogPosition=0 logPosition=736 timestamp=1708412500000 memberId=0 type=TERM entryIndex=0
            1: recordingId=2 leadershipTermId=0 termBaseLogPosition=0 logPosition=736 timestamp=1708412400000 memberId=0 type=SNAPSHOT entryIndex=1
            2: recordingId=3 leadershipTermId=1 termBaseLogPosition=736 logPosition=1472 timestamp=1708412600000 memberId=1 type=TERM entryIndex=2
            """;

        List<ClusterEvent> events = RecordingLogParser.toEvents("prod", output);

        ClusterEvent clusterStart = events.stream()
                .filter(e -> "CLUSTER_START".equals(e.getType()))
                .findFirst()
                .orElseThrow();
        // Should pick the earliest: 1708412400000
        assertEquals(1708412400000L, clusterStart.getTimestamp().toEpochMilli());
    }

    @Test
    void shouldSetClusterIdOnAllEvents() {
        String output = """
            0: recordingId=1 leadershipTermId=0 termBaseLogPosition=0 logPosition=736 timestamp=1708412400100 memberId=0 type=TERM entryIndex=0
            """;

        List<ClusterEvent> events = RecordingLogParser.toEvents("my-cluster", output);

        events.forEach(e -> assertEquals("my-cluster", e.getClusterId()));
    }
}

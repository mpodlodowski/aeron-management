package it.podlodowski.aeronmgmt.server.aggregator;

import it.podlodowski.aeronmgmt.common.proto.AeronCounter;
import it.podlodowski.aeronmgmt.common.proto.ArchiveRecording;
import it.podlodowski.aeronmgmt.common.proto.ClusterMetrics;
import it.podlodowski.aeronmgmt.common.proto.CommandResult;
import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import it.podlodowski.aeronmgmt.common.proto.StateChangeEntry;
import it.podlodowski.aeronmgmt.server.events.ClusterEvent;
import it.podlodowski.aeronmgmt.server.events.EventFactory;
import it.podlodowski.aeronmgmt.server.events.EventLevel;
import it.podlodowski.aeronmgmt.server.events.EventService;
import it.podlodowski.aeronmgmt.server.events.EventSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Aggregates cluster state from all connected agents.
 * Maintains per-node rolling metrics windows and pushes updates via WebSocket.
 * Each instance is scoped to a single cluster identified by {@code clusterId}.
 */
public class ClusterStateAggregator {

    private static final Logger LOGGER = LoggerFactory.getLogger(ClusterStateAggregator.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final DiskUsageTracker diskUsageTracker;
    private final long windowDurationMs;
    private final String clusterId;
    private final EventService eventService;

    private final ConcurrentHashMap<Integer, MetricsWindow> metricsWindows = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, MetricsReport> latestMetrics = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, CompletableFuture<CommandResult>> pendingCommands = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, String> nodeAgentModes = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, double[]> trafficRates = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, Long> lastSnapshotCounts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, Long> electionStartTimes = new ConcurrentHashMap<>();
    private final Set<Integer> connectedNodes = ConcurrentHashMap.newKeySet();
    private final Set<Integer> reachableNodes = ConcurrentHashMap.newKeySet();
    private boolean consensusEstablished = false;

    public ClusterStateAggregator(SimpMessagingTemplate messagingTemplate,
                                  DiskUsageTracker diskUsageTracker,
                                  int historySeconds,
                                  String clusterId,
                                  EventService eventService) {
        this.messagingTemplate = messagingTemplate;
        this.diskUsageTracker = diskUsageTracker;
        this.windowDurationMs = historySeconds * 1000L;
        this.clusterId = clusterId;
        this.eventService = eventService;
    }

    private static final Map<Long, String> ROLE_NAMES = Map.of(
            0L, "FOLLOWER", 1L, "CANDIDATE", 2L, "LEADER"
    );

    private static final Map<Long, String> MODULE_STATE_NAMES = Map.of(
            0L, "INIT", 1L, "ACTIVE", 2L, "SUSPENDED", 3L, "SNAPSHOT",
            4L, "QUITTING", 5L, "TERMINATING", 6L, "CLOSED"
    );

    private static final long ELECTION_CLOSED = 17L;

    public String getClusterId() {
        return clusterId;
    }

    public void onMetricsReceived(MetricsReport report) {
        int nodeId = report.getNodeId();

        MetricsReport previous = latestMetrics.put(nodeId, report);
        metricsWindows.computeIfAbsent(nodeId, id -> new MetricsWindow(windowDurationMs))
                .add(report);

        if (report.hasSystemMetrics() && report.getSystemMetrics().getArchiveDiskTotalBytes() > 0) {
            diskUsageTracker.record(nodeId, report.getTimestamp(), computeRecordingsTotalBytes(report));
        }

        if (previous != null) {
            long dtMs = report.getTimestamp() - previous.getTimestamp();
            if (dtMs > 0) {
                long prevSent = counterValueByLabel(previous, "Bytes sent");
                long currSent = counterValueByLabel(report, "Bytes sent");
                long prevRecv = counterValueByLabel(previous, "Bytes received");
                long currRecv = counterValueByLabel(report, "Bytes received");
                double sentPerSec = (currSent - prevSent) * 1000.0 / dtMs;
                double recvPerSec = (currRecv - prevRecv) * 1000.0 / dtMs;
                trafficRates.put(nodeId, new double[]{
                        Math.max(0, sentPerSec), Math.max(0, recvPerSec)});
            }
        }

        detectStateChanges(nodeId, previous, report);
        detectNodeReachability(nodeId, report);

        // Detect snapshot taken
        long snapshotCount = counterValue(report, 205);
        if (snapshotCount >= 0) {
            Long prevSnapshot = lastSnapshotCounts.put(nodeId, snapshotCount);
            if (prevSnapshot != null && snapshotCount > prevSnapshot) {
                long termId = counterValue(report, 239);
                long logPos = report.hasClusterMetrics() ? report.getClusterMetrics().getLogPosition() : -1;
                eventService.emit(EventFactory.snapshotTaken(clusterId, nodeId, termId, logPos));
            }
        }

        detectConsensusChange();

        LOGGER.debug("Metrics received from node {}", nodeId);

        Map<String, Object> metricsMap = convertMetricsToMap(report);
        pushToWebSocket("/topic/clusters/" + clusterId + "/nodes/" + nodeId, metricsMap);
        pushToWebSocket("/topic/clusters/" + clusterId + "/nodes", metricsMap);
        pushToWebSocket("/topic/clusters/" + clusterId + "/cluster", buildClusterOverview());
    }

    public void onCommandResult(CommandResult result) {
        LOGGER.info("Command result received: id={}, success={}", result.getCommandId(), result.getSuccess());
        CompletableFuture<CommandResult> future = pendingCommands.remove(result.getCommandId());
        if (future != null) {
            future.complete(result);
        }
    }

    public void onAgentConnected(int nodeId, String agentMode) {
        LOGGER.info("Agent connected: nodeId={}, mode={}", nodeId, agentMode);
        connectedNodes.add(nodeId);
        nodeAgentModes.put(nodeId, agentMode);
        eventService.emit(EventFactory.agentConnected(clusterId, nodeId));
        pushToWebSocket("/topic/clusters/" + clusterId + "/cluster", buildClusterOverview());
    }

    public void onAgentDisconnected(int nodeId) {
        LOGGER.info("Agent disconnected: nodeId={}", nodeId);
        connectedNodes.remove(nodeId);
        reachableNodes.remove(nodeId);
        eventService.emit(EventFactory.agentDisconnected(clusterId, nodeId));
        pushToWebSocket("/topic/clusters/" + clusterId + "/cluster", buildClusterOverview());
    }

    public void processCatchUp(int nodeId, List<StateChangeEntry> buffer,
                                Map<Integer, Long> currentCounters) {
        LOGGER.info("Processing catch-up for node {} in cluster {}: {} buffered entries, {} current counters",
                nodeId, clusterId, buffer.size(), currentCounters.size());

        // Find the last known event for this node
        ClusterEvent lastEvent = eventService.findLatestForNode(clusterId, nodeId);

        long lastKnownTimestamp = 0;
        if (lastEvent != null) {
            lastKnownTimestamp = lastEvent.getTimestamp().toEpochMilli();

            // Emit a MONITORING_GAP event from the last event to now
            long now = System.currentTimeMillis();
            eventService.emit(
                    EventFactory.monitoringGap(clusterId, nodeId, lastKnownTimestamp, now));
        }

        // Replay buffered state changes
        for (StateChangeEntry entry : buffer) {
            if (entry.getTimestamp() <= lastKnownTimestamp) {
                continue; // Skip entries older than the last known event
            }

            replayCatchUpEntry(nodeId, entry);
        }

        LOGGER.info("Catch-up complete for node {} in cluster {}", nodeId, clusterId);
    }

    private void replayCatchUpEntry(int nodeId, StateChangeEntry entry) {
        Instant timestamp = Instant.ofEpochMilli(entry.getTimestamp());

        switch (entry.getCounterTypeId()) {
            case 201 -> { // Role change
                String from = ROLE_NAMES.getOrDefault(entry.getOldValue(), String.valueOf(entry.getOldValue()));
                String to = ROLE_NAMES.getOrDefault(entry.getNewValue(), String.valueOf(entry.getNewValue()));
                ClusterEvent event = ClusterEvent.builder()
                        .clusterId(clusterId)
                        .timestamp(timestamp)
                        .level(EventLevel.NODE)
                        .type("ROLE_CHANGE")
                        .nodeId(nodeId)
                        .message("Node " + nodeId + " role changed: " + from + " \u2192 " + to)
                        .source(EventSource.CATCH_UP)
                        .details(Map.of("from", from, "to", to))
                        .build();
                eventService.emit(event);

                if (entry.getNewValue() == 2L) { // LEADER
                    ClusterEvent leaderEvent = ClusterEvent.builder()
                            .clusterId(clusterId)
                            .timestamp(timestamp)
                            .level(EventLevel.NODE)
                            .type("LEADER_ELECTED")
                            .nodeId(nodeId)
                            .message("Node " + nodeId + " elected as leader")
                            .source(EventSource.CATCH_UP)
                            .details(Map.of("termId", -1L, "previousLeaderId", -1))
                            .build();
                    eventService.emit(leaderEvent);
                }
            }
            case 200 -> { // Module state change
                String from = MODULE_STATE_NAMES.getOrDefault(entry.getOldValue(), String.valueOf(entry.getOldValue()));
                String to = MODULE_STATE_NAMES.getOrDefault(entry.getNewValue(), String.valueOf(entry.getNewValue()));
                ClusterEvent event = ClusterEvent.builder()
                        .clusterId(clusterId)
                        .timestamp(timestamp)
                        .level(EventLevel.NODE)
                        .type("MODULE_STATE_CHANGE")
                        .nodeId(nodeId)
                        .message("Node " + nodeId + " module state: " + from + " \u2192 " + to)
                        .source(EventSource.CATCH_UP)
                        .details(Map.of("from", from, "to", to))
                        .build();
                eventService.emit(event);
            }
            case 207 -> { // Election state
                if (entry.getOldValue() == ELECTION_CLOSED && entry.getNewValue() != ELECTION_CLOSED) {
                    ClusterEvent event = ClusterEvent.builder()
                            .clusterId(clusterId)
                            .timestamp(timestamp)
                            .level(EventLevel.NODE)
                            .type("ELECTION_STARTED")
                            .nodeId(nodeId)
                            .message("Election started on node " + nodeId + " (state: " + entry.getNewValue() + ")")
                            .source(EventSource.CATCH_UP)
                            .details(Map.of("electionState", String.valueOf(entry.getNewValue())))
                            .build();
                    eventService.emit(event);
                } else if (entry.getOldValue() != ELECTION_CLOSED && entry.getNewValue() == ELECTION_CLOSED) {
                    ClusterEvent event = ClusterEvent.builder()
                            .clusterId(clusterId)
                            .timestamp(timestamp)
                            .level(EventLevel.NODE)
                            .type("ELECTION_COMPLETED")
                            .nodeId(nodeId)
                            .message("Election completed on node " + nodeId)
                            .source(EventSource.CATCH_UP)
                            .details(Map.of("electionCount", -1L, "durationMs", -1L))
                            .build();
                    eventService.emit(event);
                }
            }
            default -> LOGGER.debug("Ignoring catch-up entry for counter type {} on node {}", entry.getCounterTypeId(), nodeId);
        }
    }

    private void detectStateChanges(int nodeId, MetricsReport previous, MetricsReport current) {
        if ("backup".equals(nodeAgentModes.get(nodeId))) {
            return;
        }
        if (previous == null || !previous.hasClusterMetrics() || !current.hasClusterMetrics()) {
            return;
        }
        ClusterMetrics prev = previous.getClusterMetrics();
        ClusterMetrics curr = current.getClusterMetrics();

        // Role change (e.g. FOLLOWER -> LEADER)
        if (!prev.getNodeRole().equals(curr.getNodeRole())) {
            eventService.emit(EventFactory.roleChange(clusterId, nodeId, prev.getNodeRole(), curr.getNodeRole()));
            if ("LEADER".equals(curr.getNodeRole())) {
                int prevLeader = prev.getLeaderMemberId();
                long termId = counterValue(current, 239);
                eventService.emit(EventFactory.leaderElected(clusterId, nodeId, termId, prevLeader));
            }
        }

        // Consensus module state change (e.g. ACTIVE -> SUSPENDED)
        if (!prev.getConsensusModuleState().equals(curr.getConsensusModuleState())
                && !curr.getConsensusModuleState().isEmpty()) {
            eventService.emit(EventFactory.moduleStateChange(clusterId, nodeId,
                    prev.getConsensusModuleState(), curr.getConsensusModuleState()));
        }

        // Election state changes
        if (!prev.getElectionState().equals(curr.getElectionState())) {
            if (!"17".equals(curr.getElectionState())) {
                // Election started
                electionStartTimes.put(nodeId, System.currentTimeMillis());
                eventService.emit(EventFactory.electionStarted(clusterId, nodeId, curr.getElectionState()));
            } else {
                // Election completed (returned to CLOSED=17)
                Long startTime = electionStartTimes.remove(nodeId);
                long durationMs = startTime != null ? System.currentTimeMillis() - startTime : 0;
                long electionCount = counterValue(current, 238);
                eventService.emit(EventFactory.electionCompleted(clusterId, nodeId, electionCount, durationMs));
            }
        }
    }

    private void detectNodeReachability(int nodeId, MetricsReport report) {
        boolean isReachable = report.getNodeReachable();
        boolean wasReachable = reachableNodes.contains(nodeId);

        if (isReachable && !wasReachable) {
            reachableNodes.add(nodeId);
            eventService.emit(EventFactory.nodeUp(clusterId, nodeId));
        } else if (!isReachable && wasReachable) {
            reachableNodes.remove(nodeId);
            eventService.emit(EventFactory.nodeDown(clusterId, nodeId));
        }
    }

    private void detectConsensusChange() {
        int clusterNodeCount = 0;
        int activeCount = 0;
        for (Map.Entry<Integer, MetricsReport> entry : latestMetrics.entrySet()) {
            if ("backup".equals(nodeAgentModes.get(entry.getKey()))) continue;
            clusterNodeCount++;
            MetricsReport r = entry.getValue();
            if (r.hasClusterMetrics() && "ACTIVE".equals(r.getClusterMetrics().getConsensusModuleState())
                    && connectedNodes.contains(entry.getKey())) {
                activeCount++;
            }
        }
        int majority = clusterNodeCount / 2 + 1;
        boolean hasConsensus = activeCount >= majority && clusterNodeCount > 0;

        if (hasConsensus && !consensusEstablished) {
            consensusEstablished = true;
            eventService.emit(EventFactory.consensusEstablished(clusterId));
        } else if (!hasConsensus && consensusEstablished) {
            consensusEstablished = false;
            eventService.emit(EventFactory.consensusLost(clusterId));
        }
    }

    private long counterValue(MetricsReport report, int typeId) {
        for (AeronCounter counter : report.getCountersList()) {
            if (counter.getTypeId() == typeId) return counter.getValue();
        }
        return -1;
    }

    public CompletableFuture<CommandResult> registerPendingCommand(String commandId) {
        CompletableFuture<CommandResult> future = new CompletableFuture<>();
        pendingCommands.put(commandId, future);
        return future;
    }

    public Map<Integer, MetricsReport> getLatestMetrics() {
        return Collections.unmodifiableMap(new HashMap<>(latestMetrics));
    }

    public MetricsReport getLatestMetrics(int nodeId) {
        return latestMetrics.get(nodeId);
    }

    public Map<String, Object> buildClusterOverview() {
        Map<String, Object> overview = new LinkedHashMap<>();
        Map<String, Map<String, Object>> nodes = new LinkedHashMap<>();

        int leaderNodeId = -1;
        String clusterState = null;
        long totalErrors = 0;
        long totalSnapshots = 0;
        long totalElections = 0;
        long maxCycleTimeNs = 0;
        long totalRecordings = 0;
        long totalRecordingBytes = 0;
        long totalDiskUsed = 0;
        long totalDiskTotal = 0;
        long commitPosition = -1;
        int connectedClients = 0;
        long leadershipTermId = -1;
        long clusterStartMs = Long.MAX_VALUE;
        String aeronVersion = null;
        int clusterNodeCount = 0;

        for (Map.Entry<Integer, MetricsReport> entry : latestMetrics.entrySet()) {
            MetricsReport report = entry.getValue();
            boolean isBackup = "backup".equals(nodeAgentModes.get(report.getNodeId()));

            if (!isBackup && report.hasClusterMetrics()
                    && connectedNodes.contains(report.getNodeId())
                    && "LEADER".equals(report.getClusterMetrics().getNodeRole())) {
                leaderNodeId = report.getNodeId();
                commitPosition = report.getClusterMetrics().getCommitPosition();
                connectedClients = report.getClusterMetrics().getConnectedClientCount();
                String moduleState = report.getClusterMetrics().getConsensusModuleState();
                if (!moduleState.isEmpty()) {
                    clusterState = moduleState;
                }
            }

            nodes.put(String.valueOf(report.getNodeId()), convertMetricsToMap(report));

            if (!isBackup) {
                clusterNodeCount++;
                for (AeronCounter counter : report.getCountersList()) {
                    switch (counter.getTypeId()) {
                        case 212: // Cluster Errors
                        case 215: // Container Errors
                            totalErrors += counter.getValue();
                            break;
                        case 205: // Snapshot count (same across nodes, take max)
                            totalSnapshots = Math.max(totalSnapshots, counter.getValue());
                            break;
                        case 238: // Election count (same across nodes, take max)
                            totalElections = Math.max(totalElections, counter.getValue());
                            break;
                        case 216: // Max cycle time (worst across nodes)
                            maxCycleTimeNs = Math.max(maxCycleTimeNs, counter.getValue());
                            break;
                        case 239: // Leadership term id
                            leadershipTermId = Math.max(leadershipTermId, counter.getValue());
                            break;
                    }
                    if (aeronVersion == null && counter.getTypeId() == 212) {
                        String label = counter.getLabel();
                        int vi = label.indexOf("version=");
                        if (vi >= 0) {
                            int end = label.indexOf(' ', vi);
                            aeronVersion = label.substring(vi + 8, end > vi ? end : label.length());
                        }
                    }
                }
            }

            totalRecordings += report.getRecordingsCount();
            totalRecordingBytes += computeRecordingsTotalBytes(report);

            // Earliest LOG recording = cluster creation time
            for (ArchiveRecording rec : report.getRecordingsList()) {
                if (rec.getStartTimestamp() > 0 && rec.getStartTimestamp() < clusterStartMs) {
                    String channel = rec.getChannel();
                    if (channel.contains("alias=log") || channel.contains("alias=LOG")) {
                        clusterStartMs = rec.getStartTimestamp();
                    }
                }
            }

            if (report.hasSystemMetrics()) {
                totalDiskUsed += report.getSystemMetrics().getArchiveDiskUsedBytes();
                totalDiskTotal += report.getSystemMetrics().getArchiveDiskTotalBytes();
            }
        }

        overview.put("nodeCount", nodes.size());
        overview.put("clusterNodeCount", clusterNodeCount);
        overview.put("leaderNodeId", leaderNodeId);
        overview.put("clusterState", clusterState);
        overview.put("nodes", nodes);

        Map<String, Object> clusterStats = new LinkedHashMap<>();
        clusterStats.put("commitPosition", commitPosition >= 0 ? commitPosition : null);
        clusterStats.put("connectedClients", connectedClients);
        clusterStats.put("leadershipTermId", leadershipTermId >= 0 ? leadershipTermId : null);
        clusterStats.put("totalErrors", totalErrors);
        clusterStats.put("totalSnapshots", totalSnapshots);
        clusterStats.put("totalElections", totalElections);
        clusterStats.put("maxCycleTimeNs", maxCycleTimeNs);
        clusterStats.put("totalRecordings", totalRecordings);
        clusterStats.put("totalRecordingBytes", totalRecordingBytes);
        clusterStats.put("totalDiskUsed", totalDiskUsed);
        clusterStats.put("totalDiskTotal", totalDiskTotal);
        clusterStats.put("clusterStartMs", clusterStartMs < Long.MAX_VALUE ? clusterStartMs : null);
        clusterStats.put("aeronVersion", aeronVersion);
        overview.put("clusterStats", clusterStats);

        return overview;
    }

    /**
     * Converts a MetricsReport protobuf to a JSON-friendly Map structure.
     */
    public Map<String, Object> convertMetricsToMap(MetricsReport report) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("nodeId", report.getNodeId());
        result.put("timestamp", report.getTimestamp());
        result.put("agentConnected", connectedNodes.contains(report.getNodeId()));
        result.put("cncAccessible", report.getCncAccessible());
        result.put("nodeReachable", reachableNodes.contains(report.getNodeId()));
        String agentMode = nodeAgentModes.get(report.getNodeId());
        if (agentMode != null) {
            result.put("agentMode", agentMode);
        }

        if (report.hasClusterMetrics()) {
            ClusterMetrics cm = report.getClusterMetrics();
            Map<String, Object> cluster = new LinkedHashMap<>();
            cluster.put("nodeRole", cm.getNodeRole());
            cluster.put("commitPosition", cm.getCommitPosition());
            cluster.put("logPosition", cm.getLogPosition());
            cluster.put("appendPosition", cm.getAppendPosition());
            cluster.put("leaderMemberId", cm.getLeaderMemberId());
            cluster.put("connectedClientCount", cm.getConnectedClientCount());
            cluster.put("electionState", cm.getElectionState());
            cluster.put("consensusModuleState", cm.getConsensusModuleState());
            result.put("clusterMetrics", cluster);
        }

        List<Map<String, Object>> counters = new ArrayList<>();
        for (var counter : report.getCountersList()) {
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("counterId", counter.getCounterId());
            c.put("label", counter.getLabel());
            c.put("value", counter.getValue());
            c.put("typeId", counter.getTypeId());
            counters.add(c);
        }
        result.put("counters", counters);

        double[] rates = trafficRates.get(report.getNodeId());
        if (rates != null) {
            result.put("bytesSentPerSec", rates[0]);
            result.put("bytesRecvPerSec", rates[1]);
        }

        result.put("recordingCount", report.getRecordingsCount());

        long recordingsTotalBytes = 0;
        for (var rec : report.getRecordingsList()) {
            long stop = rec.getStopPosition();
            long start = rec.getStartPosition();
            if (stop > start) {
                recordingsTotalBytes += stop - start;
            }
        }
        result.put("recordingsTotalBytes", recordingsTotalBytes);

        if (report.hasSystemMetrics()) {
            Map<String, Object> sys = new LinkedHashMap<>();
            sys.put("heapUsedBytes", report.getSystemMetrics().getHeapUsedBytes());
            sys.put("heapMaxBytes", report.getSystemMetrics().getHeapMaxBytes());
            sys.put("cpuUsage", report.getSystemMetrics().getCpuUsage());
            sys.put("gcCount", report.getSystemMetrics().getGcCount());
            sys.put("gcTimeMs", report.getSystemMetrics().getGcTimeMs());
            sys.put("archiveDiskUsedBytes", report.getSystemMetrics().getArchiveDiskUsedBytes());
            sys.put("archiveDiskAvailableBytes", report.getSystemMetrics().getArchiveDiskAvailableBytes());
            sys.put("archiveDiskTotalBytes", report.getSystemMetrics().getArchiveDiskTotalBytes());
            result.put("systemMetrics", sys);

            if (report.getSystemMetrics().getArchiveDiskTotalBytes() > 0) {
                result.put("diskGrowth", diskUsageTracker.getGrowthStats(
                        report.getNodeId(),
                        report.getSystemMetrics().getArchiveDiskTotalBytes(),
                        report.getSystemMetrics().getArchiveDiskUsedBytes()));
            }
        }

        if (report.hasEgressRecording() && report.getEgressRecording().getActive()) {
            Map<String, Object> egressRec = new LinkedHashMap<>();
            egressRec.put("active", true);
            egressRec.put("recordingId", report.getEgressRecording().getRecordingId());
            egressRec.put("startTimeMs", report.getEgressRecording().getStartTimeMs());
            egressRec.put("durationLimitSeconds", report.getEgressRecording().getDurationLimitSeconds());
            egressRec.put("channel", report.getEgressRecording().getChannel());
            egressRec.put("streamId", report.getEgressRecording().getStreamId());
            result.put("egressRecording", egressRec);
        }

        return result;
    }

    private long counterValueByLabel(MetricsReport report, String labelPrefix) {
        for (AeronCounter counter : report.getCountersList()) {
            if (counter.getLabel().startsWith(labelPrefix)) {
                return counter.getValue();
            }
        }
        return 0;
    }

    private long computeRecordingsTotalBytes(MetricsReport report) {
        long total = 0;
        for (var rec : report.getRecordingsList()) {
            long stop = rec.getStopPosition();
            long start = rec.getStartPosition();
            if (stop > start) {
                total += stop - start;
            }
        }
        return total;
    }

    private void pushToWebSocket(String destination, Object payload) {
        if (messagingTemplate != null) {
            try {
                messagingTemplate.convertAndSend(destination, payload);
            } catch (Exception e) {
                LOGGER.debug("Failed to push to WebSocket {}: {}", destination, e.getMessage());
            }
        }
    }
}

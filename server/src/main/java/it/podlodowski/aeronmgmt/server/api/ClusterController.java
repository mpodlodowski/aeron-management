package it.podlodowski.aeronmgmt.server.api;

import it.podlodowski.aeronmgmt.common.proto.ArchiveRecording;
import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import it.podlodowski.aeronmgmt.server.aggregator.ClusterStateAggregator;
import it.podlodowski.aeronmgmt.server.cluster.ClusterManager;
import it.podlodowski.aeronmgmt.server.command.CommandRouter;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/clusters")
public class ClusterController {

    private static final Pattern ALIAS_PATTERN = Pattern.compile("\\balias=(\\w+)");

    private final ClusterManager clusterManager;
    private final CommandRouter commandRouter;

    public ClusterController(ClusterManager clusterManager, CommandRouter commandRouter) {
        this.clusterManager = clusterManager;
        this.commandRouter = commandRouter;
    }

    @GetMapping
    public List<Map<String, Object>> listClusters() {
        return clusterManager.getAllClusterOverviews();
    }

    @GetMapping("/{clusterId}")
    public ResponseEntity<Map<String, Object>> getClusterOverview(@PathVariable String clusterId) {
        ClusterStateAggregator aggregator = clusterManager.getCluster(clusterId);
        if (aggregator == null) {
            return ResponseEntity.notFound().build();
        }
        Map<String, Object> overview = aggregator.buildClusterOverview();
        overview.put("clusterId", clusterId);
        return ResponseEntity.ok(overview);
    }

    @GetMapping("/{clusterId}/events")
    public ResponseEntity<List<Map<String, Object>>> getRecentEvents(@PathVariable String clusterId) {
        ClusterStateAggregator aggregator = clusterManager.getCluster(clusterId);
        if (aggregator == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(aggregator.getRecentEvents());
    }

    @GetMapping("/{clusterId}/membership")
    public ResponseEntity<Map<String, Object>> getMembership(@PathVariable String clusterId) {
        ClusterStateAggregator aggregator = clusterManager.getCluster(clusterId);
        if (aggregator == null) {
            return ResponseEntity.notFound().build();
        }
        for (Map.Entry<Integer, MetricsReport> entry : aggregator.getLatestMetrics().entrySet()) {
            MetricsReport report = entry.getValue();
            if (report.hasClusterMetrics() && "LEADER".equals(report.getClusterMetrics().getNodeRole())) {
                return ResponseEntity.ok(commandRouter.sendCommand(clusterId, entry.getKey(), "LIST_MEMBERS_STRUCTURED"));
            }
        }
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("success", false);
        error.put("message", "No leader node available");
        return ResponseEntity.ok(error);
    }

    // --- Cluster-level admin actions (auto-routed to leader) ---

    @PostMapping("/{clusterId}/snapshot")
    public ResponseEntity<Map<String, Object>> snapshot(@PathVariable String clusterId) {
        return sendToLeader(clusterId, "SNAPSHOT");
    }

    @PostMapping("/{clusterId}/suspend")
    public ResponseEntity<Map<String, Object>> suspend(@PathVariable String clusterId) {
        return sendToLeader(clusterId, "SUSPEND");
    }

    @PostMapping("/{clusterId}/resume")
    public ResponseEntity<Map<String, Object>> resume(@PathVariable String clusterId) {
        return sendToLeader(clusterId, "RESUME");
    }

    @PostMapping("/{clusterId}/shutdown")
    public ResponseEntity<Map<String, Object>> shutdown(@PathVariable String clusterId) {
        return sendToLeader(clusterId, "SHUTDOWN");
    }

    @PostMapping("/{clusterId}/abort")
    public ResponseEntity<Map<String, Object>> abort(@PathVariable String clusterId) {
        return sendToLeader(clusterId, "ABORT");
    }

    private ResponseEntity<Map<String, Object>> sendToLeader(String clusterId, String command) {
        ClusterStateAggregator aggregator = clusterManager.getCluster(clusterId);
        if (aggregator == null) {
            return ResponseEntity.notFound().build();
        }
        for (Map.Entry<Integer, MetricsReport> entry : aggregator.getLatestMetrics().entrySet()) {
            MetricsReport report = entry.getValue();
            if (report.hasClusterMetrics() && "LEADER".equals(report.getClusterMetrics().getNodeRole())) {
                return ResponseEntity.ok(commandRouter.sendCommand(clusterId, entry.getKey(), command));
            }
        }
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("success", false);
        error.put("message", "No leader node available");
        return ResponseEntity.ok(error);
    }

    @GetMapping("/{clusterId}/recordings")
    public ResponseEntity<Map<String, Object>> getRecordings(
            @PathVariable String clusterId,
            @RequestParam(required = false) Integer nodeId,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size,
            @RequestParam(defaultValue = "desc") String sort) {

        ClusterStateAggregator aggregator = clusterManager.getCluster(clusterId);
        if (aggregator == null) {
            return ResponseEntity.notFound().build();
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        Set<String> availableTypes = new TreeSet<>();

        for (Map.Entry<Integer, MetricsReport> entry : aggregator.getLatestMetrics().entrySet()) {
            int nid = entry.getKey();
            if (nodeId != null && nid != nodeId) {
                continue;
            }
            for (ArchiveRecording rec : entry.getValue().getRecordingsList()) {
                String recType = deriveRecordingType(rec.getChannel());
                availableTypes.add(recType);
                if (type != null && !type.equals(recType)) {
                    continue;
                }
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("nodeId", nid);
                row.put("recordingId", rec.getRecordingId());
                row.put("streamId", rec.getStreamId());
                row.put("channel", rec.getChannel());
                row.put("startPosition", rec.getStartPosition());
                row.put("stopPosition", rec.getStopPosition());
                row.put("startTimestamp", rec.getStartTimestamp());
                row.put("stopTimestamp", rec.getStopTimestamp());
                row.put("type", recType);
                row.put("state", rec.getState().isEmpty() ? "VALID" : rec.getState());
                rows.add(row);
            }
        }

        Comparator<Map<String, Object>> cmp = Comparator.comparingLong(r -> (long) r.get("recordingId"));
        rows.sort("asc".equalsIgnoreCase(sort) ? cmp : cmp.reversed());

        int totalElements = rows.size();
        int totalPages = size > 0 ? (int) Math.ceil((double) totalElements / size) : 1;
        int fromIndex = Math.min(page * size, totalElements);
        int toIndex = Math.min(fromIndex + size, totalElements);
        List<Map<String, Object>> content = rows.subList(fromIndex, toIndex);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("content", content);
        result.put("page", page);
        result.put("size", size);
        result.put("totalElements", totalElements);
        result.put("totalPages", totalPages);
        result.put("availableTypes", availableTypes);
        return ResponseEntity.ok(result);
    }

    private String deriveRecordingType(String channel) {
        Matcher m = ALIAS_PATTERN.matcher(channel);
        if (!m.find()) return "UNKNOWN";
        return m.group(1).toUpperCase();
    }
}

package it.podlodowski.aeronmgmt.server.api;

import it.podlodowski.aeronmgmt.common.proto.ArchiveRecording;
import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import it.podlodowski.aeronmgmt.server.aggregator.ClusterStateAggregator;
import it.podlodowski.aeronmgmt.server.command.CommandRouter;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/cluster")
public class ClusterController {

    private static final Pattern ALIAS_PATTERN = Pattern.compile("\\balias=(\\w+)");

    private final ClusterStateAggregator aggregator;
    private final CommandRouter commandRouter;

    public ClusterController(ClusterStateAggregator aggregator, CommandRouter commandRouter) {
        this.aggregator = aggregator;
        this.commandRouter = commandRouter;
    }

    @GetMapping
    public Map<String, Object> getClusterOverview() {
        return aggregator.buildClusterOverview();
    }

    @GetMapping("/events")
    public List<Map<String, Object>> getRecentEvents() {
        return aggregator.getRecentEvents();
    }

    @GetMapping("/membership")
    public Map<String, Object> getMembership() {
        // Find leader node ID from latest metrics
        for (Map.Entry<Integer, MetricsReport> entry : aggregator.getLatestMetrics().entrySet()) {
            MetricsReport report = entry.getValue();
            if (report.hasClusterMetrics() && "LEADER".equals(report.getClusterMetrics().getNodeRole())) {
                return commandRouter.sendCommand(entry.getKey(), "LIST_MEMBERS_STRUCTURED");
            }
        }
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("success", false);
        error.put("message", "No leader node available");
        return error;
    }

    // --- Cluster-level admin actions (auto-routed to leader) ---

    @PostMapping("/snapshot")
    public Map<String, Object> snapshot() {
        return sendToLeader("SNAPSHOT");
    }

    @PostMapping("/suspend")
    public Map<String, Object> suspend() {
        return sendToLeader("SUSPEND");
    }

    @PostMapping("/resume")
    public Map<String, Object> resume() {
        return sendToLeader("RESUME");
    }

    @PostMapping("/shutdown")
    public Map<String, Object> shutdown() {
        return sendToLeader("SHUTDOWN");
    }

    @PostMapping("/abort")
    public Map<String, Object> abort() {
        return sendToLeader("ABORT");
    }

    private Map<String, Object> sendToLeader(String command) {
        for (Map.Entry<Integer, MetricsReport> entry : aggregator.getLatestMetrics().entrySet()) {
            MetricsReport report = entry.getValue();
            if (report.hasClusterMetrics() && "LEADER".equals(report.getClusterMetrics().getNodeRole())) {
                return commandRouter.sendCommand(entry.getKey(), command);
            }
        }
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("success", false);
        error.put("message", "No leader node available");
        return error;
    }

    @GetMapping("/recordings")
    public Map<String, Object> getRecordings(
            @RequestParam(required = false) Integer nodeId,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size) {

        List<Map<String, Object>> rows = new ArrayList<>();

        for (Map.Entry<Integer, MetricsReport> entry : aggregator.getLatestMetrics().entrySet()) {
            int nid = entry.getKey();
            if (nodeId != null && nid != nodeId) {
                continue;
            }
            for (ArchiveRecording rec : entry.getValue().getRecordingsList()) {
                String recType = deriveRecordingType(rec.getChannel());
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

        rows.sort(Comparator.comparingLong(r -> (long) r.get("recordingId")));

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
        return result;
    }

    private String deriveRecordingType(String channel) {
        Matcher m = ALIAS_PATTERN.matcher(channel);
        if (!m.find()) return "UNKNOWN";
        return m.group(1).toUpperCase();
    }
}

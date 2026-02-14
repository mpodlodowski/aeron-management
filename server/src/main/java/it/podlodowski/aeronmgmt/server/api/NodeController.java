package it.podlodowski.aeronmgmt.server.api;

import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import it.podlodowski.aeronmgmt.server.aggregator.ClusterStateAggregator;
import it.podlodowski.aeronmgmt.server.command.CommandRouter;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/nodes")
public class NodeController {

    private final ClusterStateAggregator aggregator;
    private final CommandRouter commandRouter;

    public NodeController(ClusterStateAggregator aggregator, CommandRouter commandRouter) {
        this.aggregator = aggregator;
        this.commandRouter = commandRouter;
    }

    @GetMapping
    public List<Map<String, Object>> getAllNodes() {
        List<Map<String, Object>> nodes = new ArrayList<>();
        for (Map.Entry<Integer, MetricsReport> entry : aggregator.getLatestMetrics().entrySet()) {
            nodes.add(aggregator.convertMetricsToMap(entry.getValue()));
        }
        return nodes;
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getNode(@PathVariable int id) {
        MetricsReport report = aggregator.getLatestMetrics(id);
        if (report == null) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Node " + id + " not found");
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(aggregator.convertMetricsToMap(report));
    }

    @PostMapping("/{id}/snapshot")
    public Map<String, Object> triggerSnapshot(@PathVariable int id) {
        return commandRouter.sendCommand(id, "SNAPSHOT");
    }

    @PostMapping("/{id}/suspend")
    public Map<String, Object> suspendNode(@PathVariable int id) {
        return commandRouter.sendCommand(id, "SUSPEND");
    }

    @PostMapping("/{id}/resume")
    public Map<String, Object> resumeNode(@PathVariable int id) {
        return commandRouter.sendCommand(id, "RESUME");
    }

    @PostMapping("/{id}/shutdown")
    public Map<String, Object> shutdownNode(@PathVariable int id) {
        return commandRouter.sendCommand(id, "SHUTDOWN");
    }

    @PostMapping("/{id}/abort")
    public Map<String, Object> abortNode(@PathVariable int id) {
        return commandRouter.sendCommand(id, "ABORT");
    }

    @PostMapping("/{id}/invalidate-snapshot")
    public Map<String, Object> invalidateSnapshot(@PathVariable int id) {
        return commandRouter.sendCommand(id, "INVALIDATE_SNAPSHOT");
    }

    /** Backwards-compatible alias for {@link #shutdownNode(int)}. */
    @PostMapping("/{id}/step-down")
    public Map<String, Object> stepDown(@PathVariable int id) {
        return commandRouter.sendCommand(id, "SHUTDOWN");
    }

    // --- Read-only diagnostics (GET) ---

    @GetMapping("/{id}/describe")
    public Map<String, Object> describe(@PathVariable int id) {
        return commandRouter.sendCommand(id, "DESCRIBE");
    }

    @GetMapping("/{id}/pid")
    public Map<String, Object> pid(@PathVariable int id) {
        return commandRouter.sendCommand(id, "PID");
    }

    @GetMapping("/{id}/recovery-plan")
    public Map<String, Object> recoveryPlan(@PathVariable int id) {
        return commandRouter.sendCommand(id, "RECOVERY_PLAN");
    }

    @GetMapping("/{id}/recording-log")
    public Map<String, Object> recordingLog(@PathVariable int id) {
        return commandRouter.sendCommand(id, "RECORDING_LOG");
    }

    @GetMapping("/{id}/errors")
    public Map<String, Object> errors(@PathVariable int id) {
        return commandRouter.sendCommand(id, "ERRORS");
    }

    @GetMapping("/{id}/list-members")
    public Map<String, Object> listMembers(@PathVariable int id) {
        return commandRouter.sendCommand(id, "LIST_MEMBERS");
    }

    @GetMapping("/{id}/is-leader")
    public Map<String, Object> isLeader(@PathVariable int id) {
        return commandRouter.sendCommand(id, "IS_LEADER");
    }

    @GetMapping("/{id}/describe-snapshot")
    public Map<String, Object> describeSnapshot(@PathVariable int id) {
        return commandRouter.sendCommand(id, "DESCRIBE_SNAPSHOT");
    }

    // --- Archive operations (work on cluster + backup nodes) ---

    @GetMapping("/{id}/archive/verify")
    public Map<String, Object> archiveVerify(@PathVariable int id) {
        return commandRouter.sendArchiveCommand(id, "ARCHIVE_VERIFY");
    }

    @PostMapping("/{id}/archive/compact")
    public Map<String, Object> archiveCompact(@PathVariable int id) {
        return commandRouter.sendArchiveCommand(id, "ARCHIVE_COMPACT");
    }

    @PostMapping("/{id}/archive/delete-orphaned")
    public Map<String, Object> archiveDeleteOrphaned(@PathVariable int id) {
        return commandRouter.sendArchiveCommand(id, "ARCHIVE_DELETE_ORPHANED");
    }

    @GetMapping("/{id}/archive/recordings/{rid}/describe")
    public Map<String, Object> archiveDescribeRecording(@PathVariable int id, @PathVariable long rid) {
        return commandRouter.sendArchiveCommand(id, "ARCHIVE_DESCRIBE_RECORDING",
                Map.of("recordingId", String.valueOf(rid)));
    }

    @GetMapping("/{id}/archive/recordings/{rid}/verify")
    public Map<String, Object> archiveVerifyRecording(@PathVariable int id, @PathVariable long rid) {
        return commandRouter.sendArchiveCommand(id, "ARCHIVE_VERIFY_RECORDING",
                Map.of("recordingId", String.valueOf(rid)));
    }

    @PostMapping("/{id}/archive/recordings/{rid}/mark-invalid")
    public Map<String, Object> archiveMarkInvalid(@PathVariable int id, @PathVariable long rid) {
        return commandRouter.sendArchiveCommand(id, "ARCHIVE_MARK_INVALID",
                Map.of("recordingId", String.valueOf(rid)));
    }

    @PostMapping("/{id}/archive/recordings/{rid}/mark-valid")
    public Map<String, Object> archiveMarkValid(@PathVariable int id, @PathVariable long rid) {
        return commandRouter.sendArchiveCommand(id, "ARCHIVE_MARK_VALID",
                Map.of("recordingId", String.valueOf(rid)));
    }

    @PostMapping("/{id}/archive/recordings/{rid}/delete")
    public Map<String, Object> archiveDeleteRecording(@PathVariable int id, @PathVariable long rid) {
        return commandRouter.sendArchiveCommand(id, "ARCHIVE_DELETE_RECORDING",
                Map.of("recordingId", String.valueOf(rid)));
    }
}

package it.podlodowski.aeronmgmt.server.api;

import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import it.podlodowski.aeronmgmt.server.aggregator.ClusterStateAggregator;
import it.podlodowski.aeronmgmt.server.cluster.ClusterManager;
import it.podlodowski.aeronmgmt.server.command.CommandRouter;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/clusters/{clusterId}/nodes")
public class NodeController {

    private final ClusterManager clusterManager;
    private final CommandRouter commandRouter;

    public NodeController(ClusterManager clusterManager, CommandRouter commandRouter) {
        this.clusterManager = clusterManager;
        this.commandRouter = commandRouter;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getAllNodes(@PathVariable String clusterId) {
        ClusterStateAggregator aggregator = clusterManager.getCluster(clusterId);
        if (aggregator == null) {
            return ResponseEntity.notFound().build();
        }
        List<Map<String, Object>> nodes = new ArrayList<>();
        for (Map.Entry<Integer, MetricsReport> entry : aggregator.getLatestMetrics().entrySet()) {
            nodes.add(aggregator.convertMetricsToMap(entry.getValue()));
        }
        return ResponseEntity.ok(nodes);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getNode(@PathVariable String clusterId, @PathVariable int id) {
        ClusterStateAggregator aggregator = clusterManager.getCluster(clusterId);
        if (aggregator == null) {
            return ResponseEntity.notFound().build();
        }
        MetricsReport report = aggregator.getLatestMetrics(id);
        if (report == null) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Node " + id + " not found");
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(aggregator.convertMetricsToMap(report));
    }

    @PostMapping("/{id}/snapshot")
    public Map<String, Object> triggerSnapshot(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendCommand(clusterId, id, "SNAPSHOT");
    }

    @PostMapping("/{id}/suspend")
    public Map<String, Object> suspendNode(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendCommand(clusterId, id, "SUSPEND");
    }

    @PostMapping("/{id}/resume")
    public Map<String, Object> resumeNode(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendCommand(clusterId, id, "RESUME");
    }

    @PostMapping("/{id}/shutdown")
    public Map<String, Object> shutdownNode(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendCommand(clusterId, id, "SHUTDOWN");
    }

    @PostMapping("/{id}/abort")
    public Map<String, Object> abortNode(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendCommand(clusterId, id, "ABORT");
    }

    @PostMapping("/{id}/invalidate-snapshot")
    public Map<String, Object> invalidateSnapshot(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendCommand(clusterId, id, "INVALIDATE_SNAPSHOT");
    }

    @PostMapping("/{id}/seed-recording-log")
    public Map<String, Object> seedRecordingLog(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendCommand(clusterId, id, "SEED_RECORDING_LOG");
    }

    /** Backwards-compatible alias for {@link #shutdownNode(String, int)}. */
    @PostMapping("/{id}/step-down")
    public Map<String, Object> stepDown(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendCommand(clusterId, id, "SHUTDOWN");
    }

    // --- Read-only diagnostics (GET) ---

    @GetMapping("/{id}/describe")
    public Map<String, Object> describe(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendCommand(clusterId, id, "DESCRIBE");
    }

    @GetMapping("/{id}/pid")
    public Map<String, Object> pid(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendCommand(clusterId, id, "PID");
    }

    @GetMapping("/{id}/recovery-plan")
    public Map<String, Object> recoveryPlan(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendCommand(clusterId, id, "RECOVERY_PLAN");
    }

    @GetMapping("/{id}/recording-log")
    public Map<String, Object> recordingLog(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendCommand(clusterId, id, "RECORDING_LOG");
    }

    @GetMapping("/{id}/errors")
    public Map<String, Object> errors(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendCommand(clusterId, id, "ERRORS");
    }

    @GetMapping("/{id}/list-members")
    public Map<String, Object> listMembers(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendCommand(clusterId, id, "LIST_MEMBERS");
    }

    @GetMapping("/{id}/is-leader")
    public Map<String, Object> isLeader(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendCommand(clusterId, id, "IS_LEADER");
    }

    @GetMapping("/{id}/describe-snapshot")
    public Map<String, Object> describeSnapshot(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendCommand(clusterId, id, "DESCRIBE_SNAPSHOT");
    }

    // --- Archive operations (work on cluster + backup nodes) ---

    @GetMapping("/{id}/archive/verify")
    public Map<String, Object> archiveVerify(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendArchiveCommand(clusterId, id, "ARCHIVE_VERIFY");
    }

    @PostMapping("/{id}/archive/compact")
    public Map<String, Object> archiveCompact(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendArchiveCommand(clusterId, id, "ARCHIVE_COMPACT");
    }

    @PostMapping("/{id}/archive/delete-orphaned")
    public Map<String, Object> archiveDeleteOrphaned(@PathVariable String clusterId, @PathVariable int id) {
        return commandRouter.sendArchiveCommand(clusterId, id, "ARCHIVE_DELETE_ORPHANED");
    }

    @GetMapping("/{id}/archive/recordings/{rid}/describe")
    public Map<String, Object> archiveDescribeRecording(@PathVariable String clusterId, @PathVariable int id, @PathVariable long rid) {
        return commandRouter.sendArchiveCommand(clusterId, id, "ARCHIVE_DESCRIBE_RECORDING",
                Map.of("recordingId", String.valueOf(rid)));
    }

    @GetMapping("/{id}/archive/recordings/{rid}/verify")
    public Map<String, Object> archiveVerifyRecording(@PathVariable String clusterId, @PathVariable int id, @PathVariable long rid) {
        return commandRouter.sendArchiveCommand(clusterId, id, "ARCHIVE_VERIFY_RECORDING",
                Map.of("recordingId", String.valueOf(rid)));
    }

    @PostMapping("/{id}/archive/recordings/{rid}/mark-invalid")
    public Map<String, Object> archiveMarkInvalid(@PathVariable String clusterId, @PathVariable int id, @PathVariable long rid) {
        return commandRouter.sendArchiveCommand(clusterId, id, "ARCHIVE_MARK_INVALID",
                Map.of("recordingId", String.valueOf(rid)));
    }

    @PostMapping("/{id}/archive/recordings/{rid}/mark-valid")
    public Map<String, Object> archiveMarkValid(@PathVariable String clusterId, @PathVariable int id, @PathVariable long rid) {
        return commandRouter.sendArchiveCommand(clusterId, id, "ARCHIVE_MARK_VALID",
                Map.of("recordingId", String.valueOf(rid)));
    }

    @PostMapping("/{id}/archive/recordings/{rid}/delete")
    public Map<String, Object> archiveDeleteRecording(@PathVariable String clusterId, @PathVariable int id, @PathVariable long rid) {
        return commandRouter.sendArchiveCommand(clusterId, id, "ARCHIVE_DELETE_RECORDING",
                Map.of("recordingId", String.valueOf(rid)));
    }

    @GetMapping("/{id}/archive/recordings/{rid}/bytes")
    public Map<String, Object> readRecordingBytes(
            @PathVariable String clusterId,
            @PathVariable int id,
            @PathVariable long rid,
            @RequestParam(defaultValue = "0") long offset,
            @RequestParam(defaultValue = "65536") int length) {
        return commandRouter.sendArchiveCommand(clusterId, id, "READ_RECORDING_BYTES",
                Map.of("recordingId", String.valueOf(rid),
                       "offset", String.valueOf(offset),
                       "length", String.valueOf(length)));
    }

    // --- Egress spy recording ---

    @PostMapping("/{id}/egress-recording/start")
    public Map<String, Object> startEgressRecording(
            @PathVariable String clusterId,
            @PathVariable int id,
            @RequestParam(defaultValue = "102") int streamId,
            @RequestParam(defaultValue = "0") long durationSeconds) {
        return commandRouter.sendArchiveCommand(clusterId, id, "START_EGRESS_RECORDING",
                Map.of("streamId", String.valueOf(streamId),
                       "durationSeconds", String.valueOf(durationSeconds)));
    }

    @PostMapping("/{id}/egress-recording/stop")
    public Map<String, Object> stopEgressRecording(
            @PathVariable String clusterId,
            @PathVariable int id) {
        return commandRouter.sendArchiveCommand(clusterId, id, "STOP_EGRESS_RECORDING");
    }
}

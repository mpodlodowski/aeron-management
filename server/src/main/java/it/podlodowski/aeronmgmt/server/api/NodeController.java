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

    /** Backwards-compatible alias for {@link #shutdownNode(int)}. */
    @PostMapping("/{id}/step-down")
    public Map<String, Object> stepDown(@PathVariable int id) {
        return commandRouter.sendCommand(id, "SHUTDOWN");
    }
}

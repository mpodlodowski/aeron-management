package it.podlodowski.aeronmgmt.server.api;

import it.podlodowski.aeronmgmt.server.aggregator.ClusterStateAggregator;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/cluster")
public class ClusterController {

    private final ClusterStateAggregator aggregator;

    public ClusterController(ClusterStateAggregator aggregator) {
        this.aggregator = aggregator;
    }

    @GetMapping
    public Map<String, Object> getClusterOverview() {
        return aggregator.buildClusterOverview();
    }
}

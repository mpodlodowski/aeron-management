package it.podlodowski.aeronmgmt.server.aggregator;

import it.podlodowski.aeronmgmt.common.proto.CommandResult;
import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Aggregates cluster state from agent metrics reports.
 * Minimal stub — full implementation in Task 8.
 */
@Component
public class ClusterStateAggregator {

    private static final Logger LOGGER = LoggerFactory.getLogger(ClusterStateAggregator.class);

    public void onMetricsReceived(MetricsReport report) {
        LOGGER.debug("Metrics received from node {}", report.getNodeId());
    }

    public void onCommandResult(CommandResult result) {
        LOGGER.debug("Command result received: {}", result.getCommandId());
    }

    public void onAgentDisconnected(int nodeId) {
        LOGGER.info("Agent disconnected: nodeId={}", nodeId);
    }
}

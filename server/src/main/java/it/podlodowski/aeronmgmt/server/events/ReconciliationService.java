package it.podlodowski.aeronmgmt.server.events;

import it.podlodowski.aeronmgmt.server.command.CommandRouter;
import it.podlodowski.aeronmgmt.server.grpc.AgentRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
public class ReconciliationService {

    private static final Logger LOGGER = LoggerFactory.getLogger(ReconciliationService.class);

    private final CommandRouter commandRouter;
    private final AgentRegistry agentRegistry;
    private final EventService eventService;
    private final ClusterEventRepository repository;

    public ReconciliationService(CommandRouter commandRouter,
                                  AgentRegistry agentRegistry,
                                  EventService eventService,
                                  ClusterEventRepository repository) {
        this.commandRouter = commandRouter;
        this.agentRegistry = agentRegistry;
        this.eventService = eventService;
        this.repository = repository;
    }

    @Async
    public void reconcile(String clusterId) {
        LOGGER.info("Starting event reconciliation for cluster {}", clusterId);

        List<Integer> nodeIds = agentRegistry.getNodeIds(clusterId);
        if (nodeIds.isEmpty()) {
            LOGGER.warn("No agents connected for cluster {}, cannot reconcile", clusterId);
            return;
        }

        int totalReconciled = 0;
        for (int nodeId : nodeIds) {
            try {
                Map<String, Object> result = commandRouter.sendCommand(clusterId, nodeId, "RECORDING_LOG");
                if (!Boolean.TRUE.equals(result.get("success"))) {
                    LOGGER.warn("Failed to get recording log from node {}: {}", nodeId, result.get("error"));
                    continue;
                }

                String output = (String) result.get("output");
                if (output == null || output.isEmpty()) continue;

                List<ClusterEvent> events = RecordingLogParser.toEvents(clusterId, nodeId, output);

                for (ClusterEvent event : events) {
                    Instant from = event.getTimestamp().minusSeconds(1);
                    Instant to = event.getTimestamp().plusSeconds(1);
                    List<ClusterEvent> existing = repository.findForDedup(
                            clusterId, from, to, event.getType(), event.getNodeId());
                    if (existing.isEmpty()) {
                        eventService.emit(event);
                        totalReconciled++;
                    }
                }
            } catch (Exception e) {
                LOGGER.error("Reconciliation error for node {}: {}", nodeId, e.getMessage(), e);
            }
        }

        LOGGER.info("Reconciliation complete for cluster {}: {} events added", clusterId, totalReconciled);
    }

    public void autoReconcileIfNeeded(String clusterId) {
        if (!repository.existsByClusterId(clusterId)) {
            LOGGER.info("No events found for cluster {}, triggering auto-reconciliation", clusterId);
            reconcile(clusterId);
        }
    }
}

package it.podlodowski.aeronmgmt.server.grpc;

import io.grpc.stub.StreamObserver;
import it.podlodowski.aeronmgmt.common.proto.*;
import it.podlodowski.aeronmgmt.server.cluster.ClusterManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class AgentConnectionService extends AgentServiceGrpc.AgentServiceImplBase {

    private static final Logger LOGGER = LoggerFactory.getLogger(AgentConnectionService.class);

    private final AgentRegistry registry;
    private final ClusterManager clusterManager;

    public AgentConnectionService(AgentRegistry registry, ClusterManager clusterManager) {
        this.registry = registry;
        this.clusterManager = clusterManager;
    }

    @Override
    public StreamObserver<AgentMessage> connect(StreamObserver<ServerMessage> responseObserver) {
        return new StreamObserver<>() {
            private volatile int nodeId = -1;
            private volatile String agentId = "unknown";
            private volatile String clusterId = "default";

            @Override
            public void onNext(AgentMessage message) {
                switch (message.getPayloadCase()) {
                    case REGISTRATION -> handleRegistration(message.getRegistration(), responseObserver);
                    case METRICS -> handleMetrics(message.getMetrics());
                    case COMMAND_RESULT -> handleCommandResult(message.getCommandResult());
                    default -> LOGGER.warn("Received unknown message type from agent");
                }
            }

            @Override
            public void onError(Throwable t) {
                LOGGER.error("Agent stream error (agentId={}, nodeId={}): {}", agentId, nodeId, t.getMessage());
                handleDisconnect();
            }

            @Override
            public void onCompleted() {
                LOGGER.info("Agent stream completed (agentId={}, nodeId={})", agentId, nodeId);
                handleDisconnect();
                responseObserver.onCompleted();
            }

            private void handleRegistration(AgentRegistration registration,
                                             StreamObserver<ServerMessage> observer) {
                nodeId = registration.getNodeId();
                agentId = registration.getAgentId();
                clusterId = registration.getClusterId().isEmpty() ? "default" : registration.getClusterId();

                registry.register(
                        clusterId,
                        registration.getNodeId(),
                        registration.getAgentMode(),
                        registration.getHostname(),
                        observer
                );

                clusterManager.onAgentConnected(clusterId, nodeId, registration.getAgentMode());

                if (registration.getBufferedStateChangesCount() > 0
                        || !registration.getCurrentCounterValuesMap().isEmpty()) {
                    clusterManager.processCatchUp(clusterId, nodeId,
                            registration.getBufferedStateChangesList(),
                            registration.getCurrentCounterValuesMap());
                }

                ServerMessage ack = ServerMessage.newBuilder()
                        .setAck(Ack.newBuilder()
                                .setMessage("Registered node " + nodeId)
                                .build())
                        .build();
                observer.onNext(ack);
                LOGGER.info("Agent registered: agentId={}, nodeId={}, clusterId={}, mode={}",
                        agentId, nodeId, clusterId, registration.getAgentMode());
            }

            private void handleMetrics(MetricsReport report) {
                String reportClusterId = report.getClusterId().isEmpty() ? clusterId : report.getClusterId();
                AgentRegistry.AgentConnection connection = registry.get(reportClusterId, report.getNodeId());
                if (connection != null) {
                    connection.setLatestMetrics(report);
                }
                clusterManager.onMetricsReceived(reportClusterId, report);
            }

            private void handleCommandResult(CommandResult result) {
                clusterManager.onCommandResult(result);
            }

            private void handleDisconnect() {
                if (nodeId >= 0) {
                    registry.unregister(clusterId, nodeId);
                    clusterManager.onAgentDisconnected(clusterId, nodeId);
                }
            }
        };
    }
}

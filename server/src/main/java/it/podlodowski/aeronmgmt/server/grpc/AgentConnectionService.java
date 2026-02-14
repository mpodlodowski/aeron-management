package it.podlodowski.aeronmgmt.server.grpc;

import io.grpc.stub.StreamObserver;
import it.podlodowski.aeronmgmt.common.proto.*;
import it.podlodowski.aeronmgmt.server.aggregator.ClusterStateAggregator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class AgentConnectionService extends AgentServiceGrpc.AgentServiceImplBase {

    private static final Logger LOGGER = LoggerFactory.getLogger(AgentConnectionService.class);

    private final AgentRegistry registry;
    private final ClusterStateAggregator aggregator;

    public AgentConnectionService(AgentRegistry registry, ClusterStateAggregator aggregator) {
        this.registry = registry;
        this.aggregator = aggregator;
    }

    @Override
    public StreamObserver<AgentMessage> connect(StreamObserver<ServerMessage> responseObserver) {
        return new StreamObserver<>() {
            private volatile int nodeId = -1;

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
                LOGGER.error("Agent stream error (nodeId={}): {}", nodeId, t.getMessage());
                handleDisconnect();
            }

            @Override
            public void onCompleted() {
                LOGGER.info("Agent stream completed (nodeId={})", nodeId);
                handleDisconnect();
                responseObserver.onCompleted();
            }

            private void handleRegistration(AgentRegistration registration,
                                             StreamObserver<ServerMessage> observer) {
                nodeId = registration.getNodeId();
                registry.register(
                        registration.getNodeId(),
                        registration.getAgentMode(),
                        registration.getHostname(),
                        observer
                );

                aggregator.onAgentConnected(nodeId, registration.getAgentMode());

                ServerMessage ack = ServerMessage.newBuilder()
                        .setAck(Ack.newBuilder()
                                .setMessage("Registered node " + nodeId)
                                .build())
                        .build();
                observer.onNext(ack);
                LOGGER.info("Sent ack to node {}", nodeId);
            }

            private void handleMetrics(MetricsReport report) {
                AgentRegistry.AgentConnection connection = registry.get(report.getNodeId());
                if (connection != null) {
                    connection.setLatestMetrics(report);
                }
                aggregator.onMetricsReceived(report);
            }

            private void handleCommandResult(CommandResult result) {
                aggregator.onCommandResult(result);
            }

            private void handleDisconnect() {
                if (nodeId >= 0) {
                    registry.unregister(nodeId);
                    aggregator.onAgentDisconnected(nodeId);
                }
            }
        };
    }
}

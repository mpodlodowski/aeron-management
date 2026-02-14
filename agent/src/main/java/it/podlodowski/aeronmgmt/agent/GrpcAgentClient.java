package it.podlodowski.aeronmgmt.agent;

import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import io.grpc.stub.StreamObserver;
import it.podlodowski.aeronmgmt.common.proto.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.TimeUnit;

public class GrpcAgentClient {

    private static final Logger LOGGER = LoggerFactory.getLogger(GrpcAgentClient.class);

    private final AgentConfig config;
    private final AdminCommandExecutor commandExecutor;
    private ManagedChannel channel;
    private StreamObserver<AgentMessage> requestObserver;

    public GrpcAgentClient(AgentConfig config, AdminCommandExecutor commandExecutor) {
        this.config = config;
        this.commandExecutor = commandExecutor;
    }

    public void connect() {
        channel = ManagedChannelBuilder
                .forAddress(config.managementServerHost, config.managementServerPort)
                .usePlaintext()
                .keepAliveTime(30, TimeUnit.SECONDS)
                .build();

        AgentServiceGrpc.AgentServiceStub asyncStub = AgentServiceGrpc.newStub(channel);

        StreamObserver<ServerMessage> responseObserver = new StreamObserver<>() {
            @Override
            public void onNext(ServerMessage message) {
                if (message.hasCommand()) {
                    AdminCommand cmd = message.getCommand();
                    LOGGER.info("Received command: {}", cmd.getType());
                    CommandResult result = commandExecutor.execute(cmd);
                    sendCommandResult(result);
                }
            }

            @Override
            public void onError(Throwable t) {
                LOGGER.error("gRPC stream error", t);
                scheduleReconnect();
            }

            @Override
            public void onCompleted() {
                LOGGER.info("gRPC stream completed");
            }
        };

        requestObserver = asyncStub.connect(responseObserver);

        // Send registration
        requestObserver.onNext(AgentMessage.newBuilder()
                .setRegistration(AgentRegistration.newBuilder()
                        .setNodeId(config.nodeId)
                        .setAgentMode(config.agentMode)
                        .setHostname(getHostname())
                        .build())
                .build());

        LOGGER.info("Connected to management server at {}:{}", config.managementServerHost, config.managementServerPort);
    }

    public void sendMetrics(MetricsReport report) {
        if (requestObserver != null) {
            try {
                requestObserver.onNext(AgentMessage.newBuilder()
                        .setMetrics(report)
                        .build());
            } catch (Exception e) {
                LOGGER.error("Failed to send metrics", e);
            }
        }
    }

    private void sendCommandResult(CommandResult result) {
        if (requestObserver != null) {
            requestObserver.onNext(AgentMessage.newBuilder()
                    .setCommandResult(result)
                    .build());
        }
    }

    public void shutdown() {
        if (requestObserver != null) {
            requestObserver.onCompleted();
        }
        if (channel != null) {
            channel.shutdown();
        }
    }

    private void scheduleReconnect() {
        LOGGER.info("Will attempt reconnect in 5 seconds...");
        new Thread(() -> {
            try {
                Thread.sleep(5000);
                connect();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }).start();
    }

    private static String getHostname() {
        try {
            return java.net.InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            return "unknown";
        }
    }
}

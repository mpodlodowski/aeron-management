package it.podlodowski.aeronmgmt.agent;

import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import io.grpc.stub.StreamObserver;
import it.podlodowski.aeronmgmt.common.proto.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class GrpcAgentClient {

    private static final Logger LOGGER = LoggerFactory.getLogger(GrpcAgentClient.class);
    private static final long RECONNECT_DELAY_MS = 5000;

    private final AgentConfig config;
    private final ClusterMarkFileReader identity;
    private final AdminCommandExecutor commandExecutor;
    private final StateChangeBuffer stateChangeBuffer;
    private final AtomicBoolean connected = new AtomicBoolean(false);

    private ManagedChannel channel;
    private volatile StreamObserver<AgentMessage> requestObserver;

    public GrpcAgentClient(AgentConfig config, ClusterMarkFileReader identity, AdminCommandExecutor commandExecutor, StateChangeBuffer stateChangeBuffer) {
        this.config = config;
        this.identity = identity;
        this.commandExecutor = commandExecutor;
        this.stateChangeBuffer = stateChangeBuffer;
    }

    /**
     * Attempts to connect, retrying indefinitely until successful.
     * Safe to call from any thread.
     */
    public void connect() {
        while (!Thread.currentThread().isInterrupted()) {
            try {
                doConnect();
                return;
            } catch (Exception e) {
                LOGGER.warn("Failed to connect to management server: {}. Retrying in {}ms...",
                        e.getMessage(), RECONNECT_DELAY_MS);
                sleep(RECONNECT_DELAY_MS);
            }
        }
    }

    private void doConnect() {
        closeChannel();

        channel = ManagedChannelBuilder
                .forAddress(config.managementServerHost, config.managementServerPort)
                .usePlaintext()
                .keepAliveTime(60, TimeUnit.SECONDS)
                .keepAliveTimeout(10, TimeUnit.SECONDS)
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
                LOGGER.error("gRPC stream error: {}", t.getMessage());
                handleDisconnect();
            }

            @Override
            public void onCompleted() {
                LOGGER.info("gRPC stream completed by server");
                handleDisconnect();
            }
        };

        requestObserver = asyncStub.connect(responseObserver);

        // Send registration with buffered state changes for catch-up
        StateChangeBuffer.Snapshot snapshot = stateChangeBuffer.drainAndSnapshot();
        requestObserver.onNext(AgentMessage.newBuilder()
                .setRegistration(AgentRegistration.newBuilder()
                        .setNodeId(identity.nodeId())
                        .setAgentMode(identity.agentMode())
                        .setAgentId(config.agentId)
                        .setHostname(getHostname())
                        .setClusterId(config.clusterId)
                        .addAllBufferedStateChanges(snapshot.entries())
                        .putAllCurrentCounterValues(snapshot.counterValues())
                        .build())
                .build());

        connected.set(true);
        LOGGER.info("Connected to management server at {}:{}",
                config.managementServerHost, config.managementServerPort);
    }

    private void handleDisconnect() {
        if (connected.compareAndSet(true, false)) {
            LOGGER.info("Disconnected. Will reconnect in {}ms...", RECONNECT_DELAY_MS);
            new Thread(() -> {
                sleep(RECONNECT_DELAY_MS);
                connect();
            }, "grpc-reconnect").start();
        }
    }

    public boolean isConnected() {
        return connected.get();
    }

    public void sendMetrics(MetricsReport report) {
        StreamObserver<AgentMessage> observer = requestObserver;
        if (observer == null || !connected.get()) {
            return;
        }
        try {
            observer.onNext(AgentMessage.newBuilder()
                    .setMetrics(report)
                    .build());
        } catch (Exception e) {
            LOGGER.warn("Failed to send metrics: {}", e.getMessage());
            handleDisconnect();
        }
    }

    private void sendCommandResult(CommandResult result) {
        StreamObserver<AgentMessage> observer = requestObserver;
        if (observer != null && connected.get()) {
            try {
                observer.onNext(AgentMessage.newBuilder()
                        .setCommandResult(result)
                        .build());
            } catch (Exception e) {
                LOGGER.warn("Failed to send command result: {}", e.getMessage());
            }
        }
    }

    public void shutdown() {
        connected.set(false);
        if (requestObserver != null) {
            try {
                requestObserver.onCompleted();
            } catch (Exception ignored) {}
        }
        closeChannel();
    }

    private void closeChannel() {
        if (channel != null && !channel.isShutdown()) {
            channel.shutdown();
            try {
                channel.awaitTermination(2, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            if (!channel.isTerminated()) {
                channel.shutdownNow();
            }
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static String getHostname() {
        try {
            return java.net.InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            return "unknown";
        }
    }
}

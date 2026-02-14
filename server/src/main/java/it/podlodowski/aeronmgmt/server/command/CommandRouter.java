package it.podlodowski.aeronmgmt.server.command;

import it.podlodowski.aeronmgmt.common.proto.AdminCommand;
import it.podlodowski.aeronmgmt.common.proto.CommandResult;
import it.podlodowski.aeronmgmt.common.proto.ServerMessage;
import it.podlodowski.aeronmgmt.server.aggregator.ClusterStateAggregator;
import it.podlodowski.aeronmgmt.server.grpc.AgentRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Routes admin commands to the correct agent via the gRPC stream
 * and waits for the result.
 */
@Component
public class CommandRouter {

    private static final Logger LOGGER = LoggerFactory.getLogger(CommandRouter.class);
    private static final long COMMAND_TIMEOUT_SECONDS = 30;

    private final AgentRegistry registry;
    private final ClusterStateAggregator aggregator;

    public CommandRouter(AgentRegistry registry, ClusterStateAggregator aggregator) {
        this.registry = registry;
        this.aggregator = aggregator;
    }

    /**
     * Sends an admin command to the specified node and waits for the result.
     *
     * @param nodeId      the target node ID
     * @param commandType the command type (e.g., SNAPSHOT, SUSPEND, RESUME, SHUTDOWN)
     * @return a map with the command result
     */
    public Map<String, Object> sendCommand(int nodeId, String commandType) {
        return sendCommand(nodeId, commandType, Map.of());
    }

    /**
     * Sends an admin command to the specified node with parameters and waits for the result.
     */
    public Map<String, Object> sendCommand(int nodeId, String commandType, Map<String, String> parameters) {
        AgentRegistry.AgentConnection connection = registry.get(nodeId);
        if (connection == null) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("success", false);
            error.put("error", "Node " + nodeId + " is not connected");
            return error;
        }

        if ("backup".equals(connection.getAgentMode())) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("success", false);
            error.put("error", "Commands not supported on backup nodes");
            return error;
        }

        String commandId = UUID.randomUUID().toString();
        CompletableFuture<CommandResult> future = aggregator.registerPendingCommand(commandId);

        AdminCommand command = AdminCommand.newBuilder()
                .setCommandId(commandId)
                .setType(commandType)
                .putAllParameters(parameters)
                .build();

        ServerMessage message = ServerMessage.newBuilder()
                .setCommand(command)
                .build();

        try {
            connection.getResponseObserver().onNext(message);
            LOGGER.info("Sent command {} ({}) to node {}", commandId, commandType, nodeId);

            CommandResult result = future.get(COMMAND_TIMEOUT_SECONDS, TimeUnit.SECONDS);

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("commandId", result.getCommandId());
            response.put("success", result.getSuccess());
            response.put("message", result.getMessage());
            if (!result.getError().isEmpty()) {
                response.put("error", result.getError());
            }
            if (!result.getOutput().isEmpty()) {
                response.put("output", result.getOutput());
            }
            return response;
        } catch (TimeoutException e) {
            LOGGER.error("Command {} timed out after {}s", commandId, COMMAND_TIMEOUT_SECONDS);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("commandId", commandId);
            error.put("success", false);
            error.put("error", "Command timed out after " + COMMAND_TIMEOUT_SECONDS + " seconds");
            return error;
        } catch (Exception e) {
            LOGGER.error("Failed to send command {} to node {}", commandId, nodeId, e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("commandId", commandId);
            error.put("success", false);
            error.put("error", "Failed to send command: " + e.getMessage());
            return error;
        }
    }
}

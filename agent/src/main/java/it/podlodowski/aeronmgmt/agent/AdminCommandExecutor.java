package it.podlodowski.aeronmgmt.agent;

import io.aeron.cluster.ClusterTool;
import it.podlodowski.aeronmgmt.common.proto.AdminCommand;
import it.podlodowski.aeronmgmt.common.proto.CommandResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.PrintStream;

/**
 * Wraps Aeron {@link ClusterTool} operations. Receives an {@link AdminCommand}
 * protobuf message and executes the corresponding Aeron tool operation on the
 * local cluster directory.
 *
 * <p>The Aeron 1.44.1 ClusterTool API uses {@code (File, PrintStream)} signatures
 * for all admin operations. This executor delegates to those methods and captures
 * the boolean result to report success or failure back to the management server.
 */
public class AdminCommandExecutor {

    private static final Logger LOGGER = LoggerFactory.getLogger(AdminCommandExecutor.class);

    private final File clusterDir;

    public AdminCommandExecutor(String clusterDirPath) {
        this.clusterDir = new File(clusterDirPath);
    }

    /**
     * Executes the given admin command and returns a result indicating success or failure.
     *
     * @param command the admin command to execute
     * @return the result of the command execution
     */
    public CommandResult execute(AdminCommand command) {
        LOGGER.info("Executing command: {} (id: {})", command.getType(), command.getCommandId());
        try {
            String result = dispatch(command);
            return CommandResult.newBuilder()
                    .setCommandId(command.getCommandId())
                    .setSuccess(true)
                    .setMessage(result)
                    .build();
        } catch (Exception e) {
            LOGGER.error("Command failed: {}", command.getType(), e);
            return CommandResult.newBuilder()
                    .setCommandId(command.getCommandId())
                    .setSuccess(false)
                    .setError(e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName())
                    .build();
        }
    }

    private String dispatch(AdminCommand command) {
        switch (command.getType()) {
            case "SNAPSHOT":
                return takeSnapshot();
            case "SUSPEND":
                return suspendService();
            case "RESUME":
                return resumeService();
            case "SHUTDOWN":
                return shutdown();
            default:
                throw new IllegalArgumentException("Unknown command type: " + command.getType());
        }
    }

    private String takeSnapshot() {
        boolean success = ClusterTool.snapshot(clusterDir, System.out);
        return success ? "Snapshot triggered" : "Snapshot request failed";
    }

    private String suspendService() {
        boolean success = ClusterTool.suspend(clusterDir, System.out);
        return success ? "Service suspended" : "Suspend request failed";
    }

    private String resumeService() {
        boolean success = ClusterTool.resume(clusterDir, System.out);
        return success ? "Service resumed" : "Resume request failed";
    }

    private String shutdown() {
        boolean success = ClusterTool.shutdown(clusterDir, System.out);
        return success ? "Shutdown requested" : "Shutdown request failed";
    }
}

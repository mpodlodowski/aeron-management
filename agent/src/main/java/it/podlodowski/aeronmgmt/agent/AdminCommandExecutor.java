package it.podlodowski.aeronmgmt.agent;

import io.aeron.archive.ArchiveTool;
import io.aeron.cluster.ClusterTool;
import it.podlodowski.aeronmgmt.common.proto.AdminCommand;
import it.podlodowski.aeronmgmt.common.proto.CommandResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.PrintStream;
import java.util.Set;

/**
 * Wraps Aeron {@link ClusterTool} and {@link ArchiveTool} operations.
 * Receives an {@link AdminCommand} protobuf message and executes the
 * corresponding Aeron tool operation on the local cluster/archive directory.
 */
public class AdminCommandExecutor {

    private static final Logger LOGGER = LoggerFactory.getLogger(AdminCommandExecutor.class);

    private final File clusterDir;
    private final File archiveDir;

    public AdminCommandExecutor(String clusterDirPath) {
        this.clusterDir = new File(clusterDirPath);
        this.archiveDir = new File(clusterDir.getParentFile(), "archive");
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
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            PrintStream capture = new PrintStream(baos);
            boolean success = dispatch(command, capture);
            capture.flush();
            String output = baos.toString();

            String message = success
                    ? command.getType() + " completed successfully"
                    : command.getType() + " failed (ClusterTool returned false)";
            LOGGER.info("Command {} result: success={}, output length={}", command.getType(), success, output.length());
            return CommandResult.newBuilder()
                    .setCommandId(command.getCommandId())
                    .setSuccess(success)
                    .setMessage(message)
                    .setOutput(output)
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

    private boolean dispatch(AdminCommand command, PrintStream out) {
        switch (command.getType()) {
            // --- Mutating actions: (File, PrintStream) → boolean ---
            case "SNAPSHOT":
                return ClusterTool.snapshot(clusterDir, out);
            case "SUSPEND":
                return ClusterTool.suspend(clusterDir, out);
            case "RESUME":
                return ClusterTool.resume(clusterDir, out);
            case "SHUTDOWN":
                return ClusterTool.shutdown(clusterDir, out);
            case "ABORT":
                return ClusterTool.abort(clusterDir, out);
            case "INVALIDATE_SNAPSHOT":
                return ClusterTool.invalidateLatestSnapshot(out, clusterDir);

            // --- Read-only diagnostics: (PrintStream, File) → void ---
            case "DESCRIBE":
                ClusterTool.describe(out, clusterDir);
                return true;
            case "PID":
                ClusterTool.pid(out, clusterDir);
                return true;
            case "RECOVERY_PLAN":
                ClusterTool.recoveryPlan(out, clusterDir, 1);
                return true;
            case "RECORDING_LOG":
                ClusterTool.recordingLog(out, clusterDir);
                return true;
            case "ERRORS":
                ClusterTool.errors(out, clusterDir);
                return true;
            case "LIST_MEMBERS":
                ClusterTool.listMembers(out, clusterDir);
                return true;
            case "IS_LEADER": {
                int result = ClusterTool.isLeader(out, clusterDir);
                out.println("isLeader result: " + result + " (0=leader, 1=not leader)");
                return true;
            }
            case "DESCRIBE_SNAPSHOT":
                ClusterTool.describeLatestConsensusModuleSnapshot(out, clusterDir);
                return true;

            // --- ArchiveTool operations (work on cluster + backup nodes) ---
            case "ARCHIVE_DESCRIBE_RECORDING": {
                long recordingId = Long.parseLong(command.getParametersOrThrow("recordingId"));
                ArchiveTool.describeRecording(out, archiveDir, recordingId);
                return true;
            }
            case "ARCHIVE_VERIFY":
                return ArchiveTool.verify(out, archiveDir, Set.of(), null, f -> true);
            case "ARCHIVE_VERIFY_RECORDING": {
                long recordingId = Long.parseLong(command.getParametersOrThrow("recordingId"));
                return ArchiveTool.verifyRecording(out, archiveDir, recordingId, Set.of(), null, f -> true);
            }
            case "ARCHIVE_COMPACT":
                ArchiveTool.compact(out, archiveDir);
                return true;
            case "ARCHIVE_DELETE_ORPHANED":
                ArchiveTool.deleteOrphanedSegments(out, archiveDir);
                return true;
            case "ARCHIVE_MARK_INVALID": {
                long recordingId = Long.parseLong(command.getParametersOrThrow("recordingId"));
                ArchiveTool.markRecordingInvalid(out, archiveDir, recordingId);
                return true;
            }
            case "ARCHIVE_MARK_VALID": {
                long recordingId = Long.parseLong(command.getParametersOrThrow("recordingId"));
                ArchiveTool.markRecordingValid(out, archiveDir, recordingId);
                return true;
            }
            case "ARCHIVE_DELETE_RECORDING": {
                long recordingId = Long.parseLong(command.getParametersOrThrow("recordingId"));
                ArchiveTool.markRecordingInvalid(out, archiveDir, recordingId);
                out.println("Marked recording " + recordingId + " as invalid, compacting...");
                ArchiveTool.compact(out, archiveDir);
                return true;
            }

            default:
                throw new IllegalArgumentException("Unknown command type: " + command.getType());
        }
    }
}

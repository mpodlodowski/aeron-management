package it.podlodowski.aeronmgmt.agent;

import io.aeron.archive.ArchiveTool;
import io.aeron.cluster.ClusterTool;
import it.podlodowski.aeronmgmt.common.proto.AdminCommand;
import it.podlodowski.aeronmgmt.common.proto.CommandResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.aeron.cluster.ClusterMember;
import io.aeron.cluster.ClusterMembership;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.PrintStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

            case "LIST_MEMBERS_STRUCTURED": {
                ClusterMembership membership = new ClusterMembership();
                boolean ok = ClusterTool.listMembers(membership, clusterDir, 5000);
                if (ok) {
                    out.print(serializeMembership(membership));
                }
                return ok;
            }

            default:
                throw new IllegalArgumentException("Unknown command type: " + command.getType());
        }
    }

    private String serializeMembership(ClusterMembership membership) {
        StringBuilder sb = new StringBuilder();
        sb.append("{");
        sb.append("\"memberId\":").append(membership.memberId);
        sb.append(",\"leaderMemberId\":").append(membership.leaderMemberId);
        sb.append(",\"currentTimeNs\":").append(membership.currentTimeNs);
        sb.append(",\"activeMembers\":[");
        appendMembers(sb, membership.activeMembers);
        sb.append("],\"passiveMembers\":[");
        appendMembers(sb, membership.passiveMembers);
        sb.append("]}");
        return sb.toString();
    }

    private void appendMembers(StringBuilder sb, List<ClusterMember> members) {
        if (members == null) return;
        for (int i = 0; i < members.size(); i++) {
            if (i > 0) sb.append(",");
            ClusterMember m = members.get(i);
            sb.append("{");
            sb.append("\"id\":").append(m.id());
            sb.append(",\"isLeader\":").append(m.isLeader());
            sb.append(",\"leadershipTermId\":").append(m.leadershipTermId());
            sb.append(",\"logPosition\":").append(m.logPosition());
            sb.append(",\"ingressEndpoint\":\"").append(escape(m.ingressEndpoint())).append("\"");
            sb.append(",\"consensusEndpoint\":\"").append(escape(m.consensusEndpoint())).append("\"");
            sb.append(",\"logEndpoint\":\"").append(escape(m.logEndpoint())).append("\"");
            sb.append(",\"catchupEndpoint\":\"").append(escape(m.catchupEndpoint())).append("\"");
            sb.append(",\"archiveEndpoint\":\"").append(escape(m.archiveEndpoint())).append("\"");
            sb.append("}");
        }
    }

    private static String escape(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}

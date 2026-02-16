import io.aeron.CommonContext;
import io.aeron.archive.Archive;
import io.aeron.archive.ArchivingMediaDriver;
import io.aeron.archive.client.AeronArchive;
import io.aeron.cluster.ClusterBackup;
import io.aeron.cluster.ClusterBackupEventsListener;
import io.aeron.cluster.ClusterMember;
import io.aeron.cluster.RecordingLog;
import io.aeron.driver.MediaDriver;
import io.aeron.samples.cluster.ClusterConfig;

import java.io.File;
import java.net.InetAddress;
import java.util.Arrays;
import java.util.List;
import java.util.StringJoiner;

/**
 * Minimal Aeron cluster backup node for the demo.
 * Connects to the cluster as a passive observer and replicates recordings.
 *
 * Environment variables:
 *   CLUSTER_ADDRESSES - comma-separated cluster hostnames
 *   HOSTNAME          - this backup node's reachable hostname (set by Docker/K8s)
 *   PORT_BASE         - cluster port base (default: 9000)
 *   BACKUP_INTERVAL   - backup interval in seconds (default: 10)
 */
public class BackupNode {

    private static final long NS_PER_SECOND = 1_000_000_000L;

    public static void main(String[] args) throws Exception {
        final String[] hosts = System.getenv("CLUSTER_ADDRESSES").split(",");
        final String self = env("HOSTNAME", InetAddress.getLocalHost().getHostName());
        final int portBase = Integer.parseInt(env("PORT_BASE", "9000"));
        final long backupIntervalNs = Long.parseLong(env("BACKUP_INTERVAL", "10")) * NS_PER_SECOND;
        final String baseDir = env("BASE_DIR", "/home/aeron/aeron-cluster");

        System.out.println("[BackupNode] Starting backup, self=" + self);

        awaitDnsResolution(hosts);

        final String consensusEndpoints = buildConsensusEndpoints(hosts, portBase);
        System.out.println("[BackupNode] Consensus endpoints: " + consensusEndpoints);

        final String aeronDir = CommonContext.getAeronDirectoryName() + "-backup-driver";

        final MediaDriver.Context mediaDriverCtx = new MediaDriver.Context()
            .aeronDirectoryName(aeronDir)
            .dirDeleteOnStart(true);

        final Archive.Context archiveCtx = new Archive.Context()
            .archiveDir(new File(baseDir, "archive"))
            .controlChannel("aeron:udp?endpoint=" + self + ":8010")
            .replicationChannel("aeron:udp?endpoint=" + self + ":8012")
            .aeronDirectoryName(aeronDir)
            .deleteArchiveOnStart(true);

        final AeronArchive.Context clusterArchiveCtx = new AeronArchive.Context()
            .controlRequestChannel("aeron:udp")
            .controlResponseChannel("aeron:udp?endpoint=" + self + ":8013");

        final ClusterBackup.Context backupCtx = new ClusterBackup.Context()
            .catchupEndpoint(self + ":8014")
            .clusterConsensusEndpoints(consensusEndpoints)
            .consensusChannel("aeron:udp?endpoint=" + self + ":8020")
            .eventsListener(new LoggingListener())
            .aeronDirectoryName(aeronDir)
            .clusterArchiveContext(clusterArchiveCtx)
            .clusterDir(new File(baseDir, "cluster"))
            .sourceType(ClusterBackup.SourceType.ANY)
            .clusterBackupIntervalNs(backupIntervalNs)
            .deleteDirOnStart(true);

        try (
            ArchivingMediaDriver ignored = ArchivingMediaDriver.launch(mediaDriverCtx, archiveCtx);
            ClusterBackup ignored2 = ClusterBackup.launch(backupCtx)
        ) {
            System.out.println("[BackupNode] Backup started");
            new org.agrona.concurrent.ShutdownSignalBarrier().await();
            System.out.println("[BackupNode] Shutting down");
        }
    }

    private static String buildConsensusEndpoints(String[] hosts, int portBase) {
        final StringJoiner sj = new StringJoiner(",");
        for (int i = 0; i < hosts.length; i++) {
            sj.add(hosts[i].trim() + ":" + ClusterConfig.calculatePort(i, portBase, ClusterConfig.MEMBER_FACING_PORT_OFFSET));
        }
        return sj.toString();
    }

    private static void awaitDnsResolution(String[] hosts) throws Exception {
        for (String host : hosts) {
            final String h = host.trim();
            for (int attempt = 0; attempt < 60; attempt++) {
                try {
                    InetAddress.getByName(h);
                    break;
                } catch (Exception e) {
                    if (attempt == 59) throw new RuntimeException("DNS resolution failed: " + h, e);
                    System.out.println("[BackupNode] Waiting for DNS: " + h);
                    Thread.sleep(1000);
                }
            }
        }
    }

    private static String env(String key, String def) {
        String v = System.getenv(key);
        return v != null ? v : def;
    }

    static class LoggingListener implements ClusterBackupEventsListener {
        @Override public void onBackupQuery() {}

        @Override public void onPossibleFailure(Exception ex) {
            System.out.println("[BackupNode] Possible failure: " + ex.getMessage());
        }

        @Override public void onBackupResponse(ClusterMember[] members, ClusterMember logSource,
                List<RecordingLog.Snapshot> snapshots) {
            if (!snapshots.isEmpty()) {
                System.out.println("[BackupNode] Backup response from member " + logSource.id() +
                    ", snapshots to retrieve: " + snapshots.size());
            }
        }

        @Override public void onUpdatedRecordingLog(RecordingLog log, List<RecordingLog.Snapshot> retrieved) {
            if (!retrieved.isEmpty()) {
                System.out.println("[BackupNode] Retrieved " + retrieved.size() + " snapshots");
            }
        }

        @Override public void onLiveLogProgress(long recordingId, long counterId, long logPosition) {}
    }
}

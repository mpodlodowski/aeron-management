import io.aeron.archive.Archive;
import io.aeron.archive.ArchiveThreadingMode;
import io.aeron.archive.client.AeronArchive;
import io.aeron.cluster.ClusteredMediaDriver;
import io.aeron.cluster.ConsensusModule;
import io.aeron.cluster.service.Cluster;
import io.aeron.cluster.service.ClusteredService;
import io.aeron.cluster.service.ClusteredServiceContainer;
import io.aeron.cluster.service.ClientSession;
import io.aeron.cluster.codecs.CloseReason;
import io.aeron.driver.MediaDriver;
import io.aeron.driver.ThreadingMode;
import io.aeron.logbuffer.Header;
import io.aeron.ExclusivePublication;
import io.aeron.Image;
import org.agrona.DirectBuffer;
import org.agrona.concurrent.NoOpLock;
import org.agrona.concurrent.ShutdownSignalBarrier;

import java.io.File;
import java.net.InetAddress;

/**
 * Minimal Aeron cluster node for the Kubernetes demo.
 *
 * Environment variables:
 *   NODE_ID           - this node's member ID (0, 1, or 2)
 *   CLUSTER_ADDRESSES - comma-separated hostnames
 *   BASE_DIR          - data directory (default: /home/aeron/aeron-cluster)
 */
public class ClusterNode {

    private static final int PORT_BASE = 9000;
    private static final int PORTS_PER_NODE = 100;

    public static void main(String[] args) throws Exception {
        final int nodeId = Integer.parseInt(System.getenv("NODE_ID"));
        final String[] hosts = System.getenv("CLUSTER_ADDRESSES").split(",");
        final String baseDir = env("BASE_DIR", "/home/aeron/aeron-cluster");

        System.out.println("[ClusterNode] Starting node " + nodeId);

        awaitDnsResolution(hosts);

        final String aeronDir = "/dev/shm/aeron-node-" + nodeId;
        final File clusterDir = new File(baseDir, "aeron-cluster-" + nodeId + "/cluster");
        final File archiveDir = new File(baseDir, "aeron-cluster-" + nodeId + "/archive");
        final String clusterMembers = buildClusterMembers(hosts);

        System.out.println("[ClusterNode] Cluster members: " + clusterMembers);

        final ShutdownSignalBarrier barrier = new ShutdownSignalBarrier();

        final MediaDriver.Context mediaDriverCtx = new MediaDriver.Context()
            .aeronDirectoryName(aeronDir)
            .threadingMode(ThreadingMode.SHARED)
            .terminationHook(barrier::signalAll)
            .dirDeleteOnStart(true)
            .dirDeleteOnShutdown(true);

        final Archive.Context archiveCtx = new Archive.Context()
            .archiveDir(archiveDir)
            .controlChannel("aeron:udp?endpoint=" + hosts[nodeId].trim() + ":" + port(nodeId, 1))
            .localControlChannel("aeron:ipc?term-length=64k")
            .recordingEventsEnabled(false)
            .threadingMode(ArchiveThreadingMode.SHARED);

        final AeronArchive.Context aeronArchiveCtx = new AeronArchive.Context()
            .lock(NoOpLock.INSTANCE)
            .controlRequestChannel(archiveCtx.localControlChannel())
            .controlResponseChannel(archiveCtx.localControlChannel());

        final ConsensusModule.Context consensusCtx = new ConsensusModule.Context()
            .clusterMemberId(nodeId)
            .clusterMembers(clusterMembers)
            .clusterDir(clusterDir)
            .archiveContext(aeronArchiveCtx.clone())
            .serviceCount(1)
            .terminationHook(barrier::signalAll)
            .replicationChannel("aeron:udp?endpoint=0.0.0.0:0");

        final ClusteredServiceContainer.Context serviceCtx = new ClusteredServiceContainer.Context()
            .aeronDirectoryName(aeronDir)
            .archiveContext(aeronArchiveCtx.clone())
            .clusterDir(clusterDir)
            .clusteredService(new EchoService())
            .terminationHook(barrier::signalAll);

        try (
            ClusteredMediaDriver ignored = ClusteredMediaDriver.launch(
                mediaDriverCtx, archiveCtx, consensusCtx);
            ClusteredServiceContainer ignored2 = ClusteredServiceContainer.launch(serviceCtx)
        ) {
            System.out.println("[ClusterNode] Node " + nodeId + " started");
            barrier.await();
            System.out.println("[ClusterNode] Node " + nodeId + " shutting down");
        }
    }

    private static String buildClusterMembers(String[] hosts) {
        final StringBuilder sb = new StringBuilder();
        for (int i = 0; i < hosts.length; i++) {
            if (i > 0) sb.append('|');
            final String h = hosts[i].trim();
            sb.append(i).append(',')
                .append(h).append(':').append(port(i, 2)).append(',')
                .append(h).append(':').append(port(i, 3)).append(',')
                .append(h).append(':').append(port(i, 4)).append(',')
                .append(h).append(':').append(port(i, 5)).append(',')
                .append(h).append(':').append(port(i, 1));
        }
        return sb.toString();
    }

    private static int port(int nodeId, int offset) {
        return PORT_BASE + nodeId * PORTS_PER_NODE + offset;
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
                    System.out.println("[ClusterNode] Waiting for DNS: " + h);
                    Thread.sleep(1000);
                }
            }
        }
    }

    private static String env(String key, String def) {
        String v = System.getenv(key);
        return v != null ? v : def;
    }

    static class EchoService implements ClusteredService {
        @Override public void onStart(Cluster cluster, Image snapshotImage) {
            System.out.println("[EchoService] Started, role=" + cluster.role());
        }
        @Override public void onSessionOpen(ClientSession session, long timestamp) {}
        @Override public void onSessionClose(ClientSession session, long timestamp, CloseReason closeReason) {}
        @Override public void onSessionMessage(ClientSession session, long timestamp,
                DirectBuffer buffer, int offset, int length, Header header) {
            session.offer(buffer, offset, length);
        }
        @Override public void onTimerEvent(long correlationId, long timestamp) {}
        @Override public void onTakeSnapshot(ExclusivePublication snapshotPublication) {}
        @Override public void onRoleChange(Cluster.Role newRole) {
            System.out.println("[EchoService] Role changed to " + newRole);
        }
        @Override public void onTerminate(Cluster cluster) {}
    }
}

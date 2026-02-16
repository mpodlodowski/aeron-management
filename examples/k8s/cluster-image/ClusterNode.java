import io.aeron.cluster.ClusteredMediaDriver;
import io.aeron.cluster.service.Cluster;
import io.aeron.cluster.service.ClusteredService;
import io.aeron.cluster.service.ClusteredServiceContainer;
import io.aeron.cluster.service.ClientSession;
import io.aeron.cluster.codecs.CloseReason;
import io.aeron.driver.ThreadingMode;
import io.aeron.logbuffer.Header;
import io.aeron.ExclusivePublication;
import io.aeron.Image;
import io.aeron.samples.cluster.ClusterConfig;
import org.agrona.DirectBuffer;
import org.agrona.concurrent.ShutdownSignalBarrier;

import java.net.InetAddress;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Minimal Aeron cluster node for the Kubernetes demo.
 * Uses ClusterConfig from Aeron samples — same approach as the production cluster.
 *
 * Environment variables:
 *   NODE_ID           - this node's member ID (0, 1, or 2)
 *   CLUSTER_ADDRESSES - comma-separated hostnames (e.g. node-0.aeron-cluster,node-1.aeron-cluster,node-2.aeron-cluster)
 *   PORT_BASE         - base port (default: 9000)
 */
public class ClusterNode {

    public static void main(String[] args) throws Exception {
        final int nodeId = Integer.parseInt(System.getenv("NODE_ID"));
        final List<String> hosts = Arrays.stream(System.getenv("CLUSTER_ADDRESSES").split(","))
            .map(String::trim)
            .collect(Collectors.toList());
        final int portBase = Integer.parseInt(env("PORT_BASE", "9000"));

        System.out.println("[ClusterNode] Starting node " + nodeId);

        awaitDnsResolution(hosts);

        final ShutdownSignalBarrier barrier = new ShutdownSignalBarrier();

        final ClusterConfig config = ClusterConfig.create(nodeId, hosts, portBase, new EchoService());

        config.mediaDriverContext()
            .threadingMode(ThreadingMode.SHARED)
            .terminationHook(barrier::signalAll)
            .dirDeleteOnStart(true);

        config.consensusModuleContext()
            .ingressChannel("aeron:udp?term-length=64k")
            .terminationHook(barrier::signalAll)
            .deleteDirOnStart(true);

        config.clusteredServiceContext()
            .terminationHook(barrier::signalAll);

        System.out.println("[ClusterNode] Cluster members: " + config.consensusModuleContext().clusterMembers());

        try (
            ClusteredMediaDriver ignored = ClusteredMediaDriver.launch(
                config.mediaDriverContext(), config.archiveContext(), config.consensusModuleContext());
            ClusteredServiceContainer ignored2 = ClusteredServiceContainer.launch(config.clusteredServiceContext())
        ) {
            System.out.println("[ClusterNode] Node " + nodeId + " started");
            barrier.await();
            System.out.println("[ClusterNode] Node " + nodeId + " shutting down");
        }
    }

    private static void awaitDnsResolution(List<String> hosts) throws Exception {
        for (String host : hosts) {
            for (int attempt = 0; attempt < 60; attempt++) {
                try {
                    InetAddress.getByName(host);
                    break;
                } catch (Exception e) {
                    if (attempt == 59) throw new RuntimeException("DNS resolution failed: " + host, e);
                    System.out.println("[ClusterNode] Waiting for DNS: " + host);
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

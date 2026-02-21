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
import org.agrona.ExpandableDirectByteBuffer;
import org.agrona.MutableDirectBuffer;
import org.agrona.concurrent.ShutdownSignalBarrier;

import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

import java.net.InetAddress;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
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

    /**
     * Simulated order-fill service. Receives a symbol name (plain text) and responds
     * with an SBE-encoded OrderFill message (schema=200, template=1).
     *
     * Wire format (little-endian):
     *   SBE Header (8B): blockLength(u16)=20, templateId(u16)=1, schemaId(u16)=200, version(u16)=0
     *   symbol   (8B):  ASCII, right-padded with spaces
     *   price    (8B):  double
     *   quantity (4B):  int32
     */
    static class EchoService implements ClusteredService {
        private static final int SBE_HEADER_SIZE = 8;
        private static final int BLOCK_LENGTH = 20; // symbol(8) + price(8) + quantity(4)
        private static final int TEMPLATE_ID = 1;
        private static final int SCHEMA_ID = 200;
        private static final int RESPONSE_SIZE = SBE_HEADER_SIZE + BLOCK_LENGTH; // 28 bytes

        private final MutableDirectBuffer responseBuffer = new ExpandableDirectByteBuffer(256);

        @Override public void onStart(Cluster cluster, Image snapshotImage) {
            System.out.println("[EchoService] Started, role=" + cluster.role());
        }
        @Override public void onSessionOpen(ClientSession session, long timestamp) {}
        @Override public void onSessionClose(ClientSession session, long timestamp, CloseReason closeReason) {}
        @Override public void onSessionMessage(ClientSession session, long timestamp,
                DirectBuffer buffer, int offset, int length, Header header) {
            final String symbol = buffer.getStringWithoutLengthAscii(offset, length).toUpperCase();

            // SBE header
            responseBuffer.putShort(0, (short) BLOCK_LENGTH, ByteOrder.LITTLE_ENDIAN);
            responseBuffer.putShort(2, (short) TEMPLATE_ID, ByteOrder.LITTLE_ENDIAN);
            responseBuffer.putShort(4, (short) SCHEMA_ID, ByteOrder.LITTLE_ENDIAN);
            responseBuffer.putShort(6, (short) 0, ByteOrder.LITTLE_ENDIAN); // version

            // symbol: 8 bytes, right-padded with spaces
            final byte[] symbolBytes = symbol.getBytes(StandardCharsets.US_ASCII);
            final byte[] padded = new byte[8];
            Arrays.fill(padded, (byte) ' ');
            System.arraycopy(symbolBytes, 0, padded, 0, Math.min(symbolBytes.length, 8));
            responseBuffer.putBytes(SBE_HEADER_SIZE, padded);

            // price: random 90.0–110.0
            final double price = 90.0 + ThreadLocalRandom.current().nextDouble() * 20.0;
            responseBuffer.putDouble(SBE_HEADER_SIZE + 8, price, ByteOrder.LITTLE_ENDIAN);

            // quantity: random 1–1000
            final int quantity = ThreadLocalRandom.current().nextInt(1, 1001);
            responseBuffer.putInt(SBE_HEADER_SIZE + 16, quantity, ByteOrder.LITTLE_ENDIAN);

            session.offer(responseBuffer, 0, RESPONSE_SIZE);
        }
        @Override public void onTimerEvent(long correlationId, long timestamp) {}
        @Override public void onTakeSnapshot(ExclusivePublication snapshotPublication) {}
        @Override public void onRoleChange(Cluster.Role newRole) {
            System.out.println("[EchoService] Role changed to " + newRole);
        }
        @Override public void onTerminate(Cluster cluster) {}
    }
}

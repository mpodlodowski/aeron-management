import io.aeron.cluster.client.AeronCluster;
import io.aeron.cluster.client.EgressListener;
import io.aeron.driver.MediaDriver;
import io.aeron.driver.ThreadingMode;
import io.aeron.logbuffer.Header;
import io.aeron.samples.cluster.ClusterConfig;
import org.agrona.DirectBuffer;
import org.agrona.ExpandableDirectByteBuffer;
import org.agrona.MutableDirectBuffer;
import org.agrona.concurrent.IdleStrategy;
import org.agrona.concurrent.SleepingMillisIdleStrategy;

import java.nio.ByteOrder;

import java.net.InetAddress;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

/**
 * Sample client that connects to the demo cluster and sends a random word every second.
 * Used to generate egress traffic for demonstrating egress spy recording.
 *
 * Environment variables:
 *   CLUSTER_ADDRESSES - comma-separated hostnames (e.g. node0,node1,node2)
 *   PORT_BASE         - base port (default: 9000)
 */
public class SampleClient {

    private static final String[] WORDS = {
        "hello", "world", "aeron", "cluster", "egress", "sample", "message", "test"
    };

    private static final MutableDirectBuffer SEND_BUFFER = new ExpandableDirectByteBuffer(256);

    public static void main(String[] args) throws Exception {
        final List<String> hosts = Arrays.stream(System.getenv("CLUSTER_ADDRESSES").split(","))
            .map(String::trim)
            .collect(Collectors.toList());
        final int portBase = Integer.parseInt(env("PORT_BASE", "9000"));

        final String ingressEndpoints = buildIngressEndpoints(hosts, portBase);
        final String hostname = InetAddress.getLocalHost().getHostName();
        System.out.println("[SampleClient] Ingress endpoints: " + ingressEndpoints);
        System.out.println("[SampleClient] Hostname: " + hostname);

        final EgressListener egressListener = (clusterSessionId, timestamp, buffer, offset, length, header) -> {
            if (length >= 28) { // SBE header (8) + symbol (8) + price (8) + quantity (4)
                final int blockLength = buffer.getShort(offset, ByteOrder.LITTLE_ENDIAN) & 0xFFFF;
                final int templateId = buffer.getShort(offset + 2, ByteOrder.LITTLE_ENDIAN) & 0xFFFF;
                final int schemaId = buffer.getShort(offset + 4, ByteOrder.LITTLE_ENDIAN) & 0xFFFF;
                if (schemaId == 200 && templateId == 1) {
                    final String symbol = buffer.getStringWithoutLengthAscii(offset + 8, 8).trim();
                    final double price = buffer.getDouble(offset + 16, ByteOrder.LITTLE_ENDIAN);
                    final int quantity = buffer.getInt(offset + 24, ByteOrder.LITTLE_ENDIAN);
                    System.out.printf("[SampleClient] Received: OrderFill symbol=%s price=%.2f qty=%d%n",
                            symbol, price, quantity);
                    return;
                }
            }
            final String response = buffer.getStringWithoutLengthAscii(offset, length);
            System.out.println("[SampleClient] Received: " + response);
        };

        final IdleStrategy idleStrategy = new SleepingMillisIdleStrategy(1);

        try (
            MediaDriver driver = MediaDriver.launchEmbedded(
                new MediaDriver.Context()
                    .aeronDirectoryName("/tmp/aeron-client")
                    .threadingMode(ThreadingMode.SHARED)
                    .dirDeleteOnStart(true));
            AeronCluster cluster = AeronCluster.connect(
                new AeronCluster.Context()
                    .egressListener(egressListener)
                    .egressChannel("aeron:udp?endpoint=" + hostname + ":0")
                    .aeronDirectoryName(driver.aeronDirectoryName())
                    .ingressChannel("aeron:udp")
                    .ingressEndpoints(ingressEndpoints))
        ) {
            System.out.println("[SampleClient] Connected to cluster, session=" + cluster.clusterSessionId());

            while (!Thread.currentThread().isInterrupted()) {
                final String word = WORDS[ThreadLocalRandom.current().nextInt(WORDS.length)];
                final int length = SEND_BUFFER.putStringWithoutLengthAscii(0, word);

                System.out.println("[SampleClient] Sending: " + word);
                while (cluster.offer(SEND_BUFFER, 0, length) < 0) {
                    idleStrategy.idle(cluster.pollEgress());
                }

                long deadline = System.currentTimeMillis() + 1000;
                while (System.currentTimeMillis() < deadline) {
                    idleStrategy.idle(cluster.pollEgress());
                }
            }
        }
    }

    private static String buildIngressEndpoints(List<String> hosts, int portBase) {
        final StringBuilder sb = new StringBuilder();
        for (int i = 0; i < hosts.size(); i++) {
            if (i > 0) sb.append(',');
            final int port = ClusterConfig.calculatePort(i, portBase, ClusterConfig.CLIENT_FACING_PORT_OFFSET);
            sb.append(i).append('=').append(hosts.get(i)).append(':').append(port);
        }
        return sb.toString();
    }

    private static String env(String key, String def) {
        String v = System.getenv(key);
        return v != null ? v : def;
    }
}

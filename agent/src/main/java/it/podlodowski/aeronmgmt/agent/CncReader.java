package it.podlodowski.aeronmgmt.agent;

import io.aeron.CncFileDescriptor;
import it.podlodowski.aeronmgmt.common.proto.AeronCounter;
import it.podlodowski.aeronmgmt.common.proto.ClusterMetrics;
import org.agrona.DirectBuffer;
import org.agrona.IoUtil;
import org.agrona.concurrent.AtomicBuffer;
import org.agrona.concurrent.ringbuffer.ManyToOneRingBuffer;
import org.agrona.concurrent.status.CountersReader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.nio.MappedByteBuffer;
import java.util.ArrayList;
import java.util.List;

/**
 * Reads Aeron's CnC (Command and Control) file using CountersReader to extract
 * all counters and cluster-specific metrics. This is the same mechanism used by AeronStat.
 *
 * All data is read in a single {@link #read()} call to avoid mapping the file multiple times.
 */
public class CncReader {

    private static final Logger LOGGER = LoggerFactory.getLogger(CncReader.class);
    private static final long DRIVER_TIMEOUT_MS = 2_000;

    // Aeron cluster counter type IDs.
    // See io.aeron.cluster.ConsensusModule.Configuration and io.aeron.cluster.Election.
    // Verified against Aeron 1.46.5 counter labels from live cluster.
    /** Type 200: Consensus Module state (INIT=0, ACTIVE=1, SUSPENDED=2, SNAPSHOT=3, QUITTING=4, TERMINATING=5, CLOSED=6) */
    private static final int CONSENSUS_MODULE_STATE_TYPE_ID = 200;
    /** Type 201: Cluster node role (FOLLOWER=0, CANDIDATE=1, LEADER=2) */
    private static final int CLUSTER_NODE_ROLE_TYPE_ID = 201;
    /** Type 203: Cluster commit position */
    private static final int COMMIT_POSITION_TYPE_ID = 203;
    /** Type 207: Election state */
    private static final int ELECTION_STATE_TYPE_ID = 207;
    /** Type 213: Timed out client count */
    private static final int CLUSTER_TIMED_OUT_CLIENT_COUNT_TYPE_ID = 213;
    /** Type 239: Leadership term id */
    private static final int LEADERSHIP_TERM_ID_TYPE_ID = 239;

    private final String aeronDir;

    public CncReader(String aeronDir) {
        this.aeronDir = aeronDir;
    }

    /**
     * Result of reading the CnC file in a single pass.
     */
    public static class CncSnapshot {
        public final boolean cncAccessible;
        public final boolean driverActive;
        public final List<AeronCounter> counters;
        public final ClusterMetrics clusterMetrics;

        private CncSnapshot(boolean cncAccessible, boolean driverActive,
                            List<AeronCounter> counters, ClusterMetrics clusterMetrics) {
            this.cncAccessible = cncAccessible;
            this.driverActive = driverActive;
            this.counters = counters;
            this.clusterMetrics = clusterMetrics;
        }

        static CncSnapshot unavailable() {
            return new CncSnapshot(false, false, List.of(), ClusterMetrics.getDefaultInstance());
        }

        static CncSnapshot inactive() {
            return new CncSnapshot(true, false, List.of(), ClusterMetrics.getDefaultInstance());
        }
    }

    /**
     * Reads all data from the CnC file in a single memory-mapped pass:
     * driver liveness, all counters, and cluster-specific metrics.
     */
    public CncSnapshot read() {
        File cncFile = new File(aeronDir, CncFileDescriptor.CNC_FILE);
        if (!cncFile.exists()) {
            LOGGER.debug("CnC file not found: {}", cncFile.getAbsolutePath());
            return CncSnapshot.unavailable();
        }

        try {
            MappedByteBuffer cncByteBuffer = IoUtil.mapExistingFile(cncFile, "cnc");
            try {
                DirectBuffer cncMetaData = CncFileDescriptor.createMetaDataBuffer(cncByteBuffer);
                int cncVersion = cncMetaData.getInt(CncFileDescriptor.cncVersionOffset(0));
                if (cncVersion == 0) {
                    return new CncSnapshot(true, false, List.of(), ClusterMetrics.getDefaultInstance());
                }
                if (CncFileDescriptor.CNC_VERSION != cncVersion) {
                    LOGGER.warn("CnC version mismatch: expected={}, actual={}", CncFileDescriptor.CNC_VERSION, cncVersion);
                    return CncSnapshot.inactive();
                }

                // Check driver heartbeat
                ManyToOneRingBuffer toDriverBuffer = new ManyToOneRingBuffer(
                        CncFileDescriptor.createToDriverBuffer(cncByteBuffer, cncMetaData));
                long heartbeatTime = toDriverBuffer.consumerHeartbeatTime();
                long now = System.currentTimeMillis();
                long heartbeatAgeMs = now - heartbeatTime;
                boolean driverActive = heartbeatAgeMs >= 0 && heartbeatAgeMs < DRIVER_TIMEOUT_MS;

                // Read all counters + cluster metrics in one pass
                CountersReader countersReader = createCountersReader(cncByteBuffer, cncMetaData);
                List<AeronCounter> counters = new ArrayList<>();
                ClusterMetrics.Builder clusterBuilder = ClusterMetrics.newBuilder();

                countersReader.forEach((counterId, typeId, keyBuffer, label) -> {
                    long value = countersReader.getCounterValue(counterId);
                    counters.add(AeronCounter.newBuilder()
                            .setCounterId(counterId)
                            .setTypeId(typeId)
                            .setLabel(label)
                            .setValue(value)
                            .build());

                    switch (typeId) {
                        case CLUSTER_NODE_ROLE_TYPE_ID:
                            clusterBuilder.setNodeRole(roleToString(value));
                            break;
                        case COMMIT_POSITION_TYPE_ID:
                            clusterBuilder.setCommitPosition(value);
                            break;
                        case ELECTION_STATE_TYPE_ID:
                            clusterBuilder.setElectionState(String.valueOf(value));
                            break;
                        case CLUSTER_TIMED_OUT_CLIENT_COUNT_TYPE_ID:
                            clusterBuilder.setConnectedClientCount((int) value);
                            break;
                        case LEADERSHIP_TERM_ID_TYPE_ID:
                            clusterBuilder.setLeaderMemberId((int) value);
                            break;
                        default:
                            break;
                    }
                });

                return new CncSnapshot(true, driverActive, counters, clusterBuilder.build());
            } finally {
                IoUtil.unmap(cncByteBuffer);
            }
        } catch (Exception e) {
            LOGGER.debug("Failed to read CnC: {}", e.getMessage());
            return CncSnapshot.unavailable();
        }
    }

    private static CountersReader createCountersReader(MappedByteBuffer cncByteBuffer, DirectBuffer cncMetaData) {
        AtomicBuffer countersMetaDataBuffer = CncFileDescriptor.createCountersMetaDataBuffer(cncByteBuffer, cncMetaData);
        AtomicBuffer countersValuesBuffer = CncFileDescriptor.createCountersValuesBuffer(cncByteBuffer, cncMetaData);
        return new CountersReader(countersMetaDataBuffer, countersValuesBuffer);
    }

    private static String roleToString(long roleValue) {
        switch ((int) roleValue) {
            case 0: return "FOLLOWER";
            case 1: return "CANDIDATE";
            case 2: return "LEADER";
            default: return "UNKNOWN(" + roleValue + ")";
        }
    }
}

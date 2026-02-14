package it.podlodowski.aeronmgmt.agent;

import io.aeron.CncFileDescriptor;
import it.podlodowski.aeronmgmt.common.proto.AeronCounter;
import it.podlodowski.aeronmgmt.common.proto.ClusterMetrics;
import org.agrona.DirectBuffer;
import org.agrona.IoUtil;
import org.agrona.concurrent.AtomicBuffer;
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
 */
public class CncReader {

    private static final Logger LOGGER = LoggerFactory.getLogger(CncReader.class);

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
     * Reads ALL counters from the Aeron CnC file.
     *
     * @return list of all counters, or empty list if the CnC file does not exist or has a version mismatch
     */
    public List<AeronCounter> readCounters() {
        List<AeronCounter> counters = new ArrayList<>();
        File cncFile = new File(aeronDir, CncFileDescriptor.CNC_FILE);
        if (!cncFile.exists()) {
            LOGGER.warn("CnC file not found: {}", cncFile.getAbsolutePath());
            return counters;
        }

        MappedByteBuffer cncByteBuffer = IoUtil.mapExistingFile(cncFile, "cnc");
        try {
            DirectBuffer cncMetaData = CncFileDescriptor.createMetaDataBuffer(cncByteBuffer);

            int cncVersion = cncMetaData.getInt(CncFileDescriptor.cncVersionOffset(0));
            if (CncFileDescriptor.CNC_VERSION != cncVersion) {
                LOGGER.warn("CnC version mismatch: expected={}, actual={}", CncFileDescriptor.CNC_VERSION, cncVersion);
                return counters;
            }

            CountersReader countersReader = createCountersReader(cncByteBuffer, cncMetaData);

            countersReader.forEach((counterId, typeId, keyBuffer, label) -> {
                long value = countersReader.getCounterValue(counterId);
                counters.add(AeronCounter.newBuilder()
                        .setCounterId(counterId)
                        .setTypeId(typeId)
                        .setLabel(label)
                        .setValue(value)
                        .build());
            });
        } finally {
            IoUtil.unmap(cncByteBuffer);
        }

        return counters;
    }

    /**
     * Extracts cluster-specific metrics (role, commit position, election state, client count)
     * from the Aeron CnC file.
     *
     * @return cluster metrics, or default (empty) metrics if the CnC file does not exist or has a version mismatch
     */
    public ClusterMetrics readClusterMetrics() {
        ClusterMetrics.Builder builder = ClusterMetrics.newBuilder();
        File cncFile = new File(aeronDir, CncFileDescriptor.CNC_FILE);
        if (!cncFile.exists()) {
            return builder.build();
        }

        MappedByteBuffer cncByteBuffer = IoUtil.mapExistingFile(cncFile, "cnc");
        try {
            DirectBuffer cncMetaData = CncFileDescriptor.createMetaDataBuffer(cncByteBuffer);

            int cncVersion = cncMetaData.getInt(CncFileDescriptor.cncVersionOffset(0));
            if (CncFileDescriptor.CNC_VERSION != cncVersion) {
                LOGGER.warn("CnC version mismatch: expected={}, actual={}", CncFileDescriptor.CNC_VERSION, cncVersion);
                return builder.build();
            }

            CountersReader countersReader = createCountersReader(cncByteBuffer, cncMetaData);

            countersReader.forEach((counterId, typeId, keyBuffer, label) -> {
                long value = countersReader.getCounterValue(counterId);
                switch (typeId) {
                    case CLUSTER_NODE_ROLE_TYPE_ID:
                        builder.setNodeRole(roleToString(value));
                        break;
                    case COMMIT_POSITION_TYPE_ID:
                        builder.setCommitPosition(value);
                        break;
                    case ELECTION_STATE_TYPE_ID:
                        builder.setElectionState(String.valueOf(value));
                        break;
                    case CLUSTER_TIMED_OUT_CLIENT_COUNT_TYPE_ID:
                        builder.setConnectedClientCount((int) value);
                        break;
                    case LEADERSHIP_TERM_ID_TYPE_ID:
                        builder.setLeaderMemberId((int) value);
                        break;
                    default:
                        break;
                }
            });
        } finally {
            IoUtil.unmap(cncByteBuffer);
        }

        return builder.build();
    }

    private static CountersReader createCountersReader(MappedByteBuffer cncByteBuffer, DirectBuffer cncMetaData) {
        AtomicBuffer countersMetaDataBuffer = CncFileDescriptor.createCountersMetaDataBuffer(cncByteBuffer, cncMetaData);
        AtomicBuffer countersValuesBuffer = CncFileDescriptor.createCountersValuesBuffer(cncByteBuffer, cncMetaData);
        return new CountersReader(countersMetaDataBuffer, countersValuesBuffer);
    }

    /**
     * Converts the numeric cluster role value to a human-readable string.
     * Values correspond to io.aeron.cluster.service.Cluster.Role ordinals.
     */
    private static String roleToString(long roleValue) {
        switch ((int) roleValue) {
            case 0: return "FOLLOWER";
            case 1: return "CANDIDATE";
            case 2: return "LEADER";
            default: return "UNKNOWN(" + roleValue + ")";
        }
    }
}

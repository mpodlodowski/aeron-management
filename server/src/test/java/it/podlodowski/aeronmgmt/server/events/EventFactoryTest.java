package it.podlodowski.aeronmgmt.server.events;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class EventFactoryTest {

    @Test
    void shouldCreateLeaderElectedEvent() {
        ClusterEvent event = EventFactory.leaderElected("cluster-1", 2, 5L, 1);

        assertEquals(EventLevel.NODE, event.getLevel());
        assertEquals("LEADER_ELECTED", event.getType());
        assertEquals("cluster-1", event.getClusterId());
        assertEquals(2, event.getNodeId());
        assertEquals(EventSource.REALTIME, event.getSource());
        assertNotNull(event.getTimestamp());
        assertNotNull(event.getMessage());

        Map<String, Object> details = event.getDetails();
        assertEquals(5L, details.get("termId"));
        assertEquals(1, details.get("previousLeaderId"));
    }

    @Test
    void shouldCreateRoleChangeEvent() {
        ClusterEvent event = EventFactory.roleChange("cluster-1", 0, "FOLLOWER", "LEADER");

        assertEquals(EventLevel.NODE, event.getLevel());
        assertEquals("ROLE_CHANGE", event.getType());
        assertEquals("cluster-1", event.getClusterId());
        assertEquals(0, event.getNodeId());
        assertTrue(event.getMessage().contains("\u2192"));

        Map<String, Object> details = event.getDetails();
        assertEquals("FOLLOWER", details.get("from"));
        assertEquals("LEADER", details.get("to"));
    }

    @Test
    void shouldCreateAgentConnectedEvent() {
        ClusterEvent event = EventFactory.agentConnected("cluster-1", 3);

        assertEquals(EventLevel.AGENT, event.getLevel());
        assertEquals("AGENT_CONNECTED", event.getType());
        assertEquals("cluster-1", event.getClusterId());
        assertEquals(3, event.getNodeId());
        assertEquals(EventSource.REALTIME, event.getSource());
    }

    @Test
    void shouldCreateNodeActionEvent() {
        ClusterEvent event = EventFactory.nodeAction("cluster-1", 1, "snapshot", "admin", true, "snapshot taken");

        assertEquals(EventLevel.NODE, event.getLevel());
        assertEquals("NODE_ACTION", event.getType());
        assertEquals("cluster-1", event.getClusterId());
        assertEquals(1, event.getNodeId());
        assertEquals("admin", event.getUsername());

        Map<String, Object> details = event.getDetails();
        assertEquals("snapshot", details.get("action"));
        assertEquals(true, details.get("success"));
        assertEquals("snapshot taken", details.get("output"));
    }

    @Test
    void shouldCreateMonitoringGapEvent() {
        ClusterEvent event = EventFactory.monitoringGap("cluster-1", 0, 1000L, 5000L);

        assertEquals(EventLevel.AGENT, event.getLevel());
        assertEquals("MONITORING_GAP", event.getType());
        assertEquals("cluster-1", event.getClusterId());
        assertEquals(0, event.getNodeId());

        Map<String, Object> details = event.getDetails();
        assertEquals(1000L, details.get("gapStart"));
        assertEquals(5000L, details.get("gapEnd"));
    }

    @Test
    void shouldCreateSnapshotTakenEvent() {
        ClusterEvent event = EventFactory.snapshotTaken("cluster-1", 1, 3L, 1024L);

        assertEquals(EventLevel.NODE, event.getLevel());
        assertEquals("SNAPSHOT_TAKEN", event.getType());
        assertEquals("cluster-1", event.getClusterId());
        assertEquals(1, event.getNodeId());

        Map<String, Object> details = event.getDetails();
        assertEquals(3L, details.get("termId"));
        assertEquals(1024L, details.get("logPosition"));
    }

    @Test
    void shouldCreateModuleStateChangeEvent() {
        ClusterEvent event = EventFactory.moduleStateChange("cluster-1", 0, "INIT", "ACTIVE");

        assertEquals(EventLevel.NODE, event.getLevel());
        assertEquals("MODULE_STATE_CHANGE", event.getType());
        assertEquals("cluster-1", event.getClusterId());
        assertEquals(0, event.getNodeId());
        assertTrue(event.getMessage().contains("\u2192"));

        Map<String, Object> details = event.getDetails();
        assertEquals("INIT", details.get("from"));
        assertEquals("ACTIVE", details.get("to"));
    }

    @Test
    void shouldCreateElectionStartedEvent() {
        ClusterEvent event = EventFactory.electionStarted("cluster-1", 1, "CANVASS");

        assertEquals(EventLevel.NODE, event.getLevel());
        assertEquals("ELECTION_STARTED", event.getType());
        assertEquals("cluster-1", event.getClusterId());
        assertEquals(1, event.getNodeId());

        Map<String, Object> details = event.getDetails();
        assertEquals("CANVASS", details.get("electionState"));
    }

    @Test
    void shouldCreateNodeUpDownEvents() {
        ClusterEvent up = EventFactory.nodeUp("cluster-1", 2);
        assertEquals(EventLevel.NODE, up.getLevel());
        assertEquals("NODE_UP", up.getType());
        assertEquals("cluster-1", up.getClusterId());
        assertEquals(2, up.getNodeId());

        ClusterEvent down = EventFactory.nodeDown("cluster-1", 2);
        assertEquals(EventLevel.NODE, down.getLevel());
        assertEquals("NODE_DOWN", down.getType());
        assertEquals("cluster-1", down.getClusterId());
        assertEquals(2, down.getNodeId());
    }

    @Test
    void shouldCreateClusterStartEvent() {
        ClusterEvent event = EventFactory.clusterStart("cluster-1", 1700000000000L);

        assertEquals(EventLevel.CLUSTER, event.getLevel());
        assertEquals("CLUSTER_START", event.getType());
        assertEquals("cluster-1", event.getClusterId());
        assertEquals(EventSource.RECONCILIATION, event.getSource());
        assertEquals(1700000000000L, event.getTimestamp().toEpochMilli());
    }

    @Test
    void shouldCreateConsensusEstablishedEvent() {
        ClusterEvent event = EventFactory.consensusEstablished("cluster-1");

        assertEquals(EventLevel.CLUSTER, event.getLevel());
        assertEquals("CONSENSUS_ESTABLISHED", event.getType());
        assertEquals("cluster-1", event.getClusterId());
        assertNull(event.getNodeId());
    }

    @Test
    void shouldCreateConsensusLostEvent() {
        ClusterEvent event = EventFactory.consensusLost("cluster-1");

        assertEquals(EventLevel.CLUSTER, event.getLevel());
        assertEquals("CONSENSUS_LOST", event.getType());
        assertEquals("cluster-1", event.getClusterId());
        assertNull(event.getNodeId());
    }

    @Test
    void shouldCreateClusterActionEvents() {
        ClusterEvent suspend = EventFactory.clusterAction("cluster-1", "SUSPEND", "admin");
        assertEquals(EventLevel.CLUSTER, suspend.getLevel());
        assertEquals("CLUSTER_SUSPENDED", suspend.getType());
        assertEquals("admin", suspend.getUsername());

        ClusterEvent resume = EventFactory.clusterAction("cluster-1", "RESUME", "admin");
        assertEquals("CLUSTER_RESUMED", resume.getType());

        ClusterEvent shutdown = EventFactory.clusterAction("cluster-1", "SHUTDOWN", "ops");
        assertEquals("CLUSTER_SHUTDOWN", shutdown.getType());
        assertEquals("ops", shutdown.getUsername());
    }

    @Test
    void shouldCreateElectionCompletedEvent() {
        ClusterEvent event = EventFactory.electionCompleted("cluster-1", 1, 3L, 150L);

        assertEquals(EventLevel.NODE, event.getLevel());
        assertEquals("ELECTION_COMPLETED", event.getType());
        assertEquals("cluster-1", event.getClusterId());
        assertEquals(1, event.getNodeId());

        Map<String, Object> details = event.getDetails();
        assertEquals(3L, details.get("electionCount"));
        assertEquals(150L, details.get("durationMs"));
    }

    @Test
    void shouldCreateAgentDisconnectedEvent() {
        ClusterEvent event = EventFactory.agentDisconnected("cluster-1", 2);

        assertEquals(EventLevel.AGENT, event.getLevel());
        assertEquals("AGENT_DISCONNECTED", event.getType());
        assertEquals("cluster-1", event.getClusterId());
        assertEquals(2, event.getNodeId());
    }

    @Test
    void shouldCreateCncAccessibleEvent() {
        ClusterEvent event = EventFactory.cncAccessible("cluster-1", 0);

        assertEquals(EventLevel.AGENT, event.getLevel());
        assertEquals("NODE_CNC_ACCESSIBLE", event.getType());
        assertEquals("cluster-1", event.getClusterId());
        assertEquals(0, event.getNodeId());
    }

    @Test
    void shouldCreateCncLostEvent() {
        ClusterEvent event = EventFactory.cncLost("cluster-1", 1);

        assertEquals(EventLevel.AGENT, event.getLevel());
        assertEquals("NODE_CNC_LOST", event.getType());
        assertEquals("cluster-1", event.getClusterId());
        assertEquals(1, event.getNodeId());
    }

    @Test
    void shouldDefaultSourceToRealtime() {
        ClusterEvent event = EventFactory.roleChange("cluster-1", 0, "FOLLOWER", "LEADER");
        assertEquals(EventSource.REALTIME, event.getSource());
    }

    @Test
    void shouldDefaultUsernameToSystem() {
        ClusterEvent event = EventFactory.nodeUp("cluster-1", 0);
        assertEquals("system", event.getUsername());
    }
}

package it.podlodowski.aeronmgmt.server.grpc;

import io.grpc.stub.StreamObserver;
import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import it.podlodowski.aeronmgmt.common.proto.ServerMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Collections;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class AgentRegistry {

    private static final Logger LOGGER = LoggerFactory.getLogger(AgentRegistry.class);

    private final ConcurrentHashMap<Integer, AgentConnection> connections = new ConcurrentHashMap<>();

    public void register(int nodeId, String agentMode, String hostname,
                         StreamObserver<ServerMessage> responseObserver) {
        AgentConnection connection = new AgentConnection(nodeId, agentMode, hostname, responseObserver);
        connections.put(nodeId, connection);
        LOGGER.info("Agent registered: nodeId={}, mode={}, hostname={}", nodeId, agentMode, hostname);
    }

    public void unregister(int nodeId) {
        AgentConnection removed = connections.remove(nodeId);
        if (removed != null) {
            LOGGER.info("Agent unregistered: nodeId={}", nodeId);
        }
    }

    public AgentConnection get(int nodeId) {
        return connections.get(nodeId);
    }

    public Collection<AgentConnection> getAll() {
        return Collections.unmodifiableCollection(connections.values());
    }

    public static class AgentConnection {
        private final int nodeId;
        private final String agentMode;
        private final String hostname;
        private final StreamObserver<ServerMessage> responseObserver;
        private volatile MetricsReport latestMetrics;

        public AgentConnection(int nodeId, String agentMode, String hostname,
                               StreamObserver<ServerMessage> responseObserver) {
            this.nodeId = nodeId;
            this.agentMode = agentMode;
            this.hostname = hostname;
            this.responseObserver = responseObserver;
        }

        public int getNodeId() {
            return nodeId;
        }

        public String getAgentMode() {
            return agentMode;
        }

        public String getHostname() {
            return hostname;
        }

        public StreamObserver<ServerMessage> getResponseObserver() {
            return responseObserver;
        }

        public MetricsReport getLatestMetrics() {
            return latestMetrics;
        }

        public void setLatestMetrics(MetricsReport latestMetrics) {
            this.latestMetrics = latestMetrics;
        }
    }
}

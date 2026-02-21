package it.podlodowski.aeronmgmt.server.events;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "cluster_events", indexes = {
        @Index(name = "idx_events_cluster_timestamp", columnList = "clusterId, timestamp"),
        @Index(name = "idx_events_cluster_level", columnList = "clusterId, level"),
        @Index(name = "idx_events_cluster_type", columnList = "clusterId, type"),
        @Index(name = "idx_events_cluster_node", columnList = "clusterId, nodeId")
})
public class ClusterEvent {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String clusterId;

    @Column(nullable = false)
    private Instant timestamp;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EventLevel level;

    @Column(nullable = false)
    private String type;

    private Integer nodeId;

    private String agentId;

    @Column(nullable = false, length = 1024)
    private String message;

    @Column(nullable = false)
    private String username;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EventSource source;

    @Column(columnDefinition = "TEXT")
    private String detailsJson;

    @Column(nullable = false)
    private Instant createdAt;

    @Transient
    private Map<String, Object> details;

    protected ClusterEvent() {
    }

    private ClusterEvent(Builder builder) {
        this.id = builder.id;
        this.clusterId = builder.clusterId;
        this.timestamp = builder.timestamp;
        this.level = builder.level;
        this.type = builder.type;
        this.nodeId = builder.nodeId;
        this.agentId = builder.agentId;
        this.message = builder.message;
        this.username = builder.username;
        this.source = builder.source;
        this.detailsJson = builder.detailsJson;
        this.createdAt = builder.createdAt;
        this.details = builder.details;
    }

    public static Builder builder() {
        return new Builder();
    }

    public UUID getId() {
        return id;
    }

    public String getClusterId() {
        return clusterId;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public EventLevel getLevel() {
        return level;
    }

    public String getType() {
        return type;
    }

    public Integer getNodeId() {
        return nodeId;
    }

    public String getAgentId() {
        return agentId;
    }

    public String getMessage() {
        return message;
    }

    public String getUsername() {
        return username;
    }

    public EventSource getSource() {
        return source;
    }

    public String getDetailsJson() {
        return detailsJson;
    }

    public void setDetailsJson(String detailsJson) {
        this.detailsJson = detailsJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Map<String, Object> getDetails() {
        return details;
    }

    public void setDetails(Map<String, Object> details) {
        this.details = details;
    }

    public static class Builder {
        private UUID id = UUID.randomUUID();
        private String clusterId;
        private Instant timestamp;
        private EventLevel level;
        private String type;
        private Integer nodeId;
        private String agentId;
        private String message;
        private String username = "anonymous";
        private EventSource source = EventSource.REALTIME;
        private String detailsJson;
        private Instant createdAt = Instant.now();
        private Map<String, Object> details;

        private Builder() {
        }

        public Builder id(UUID id) {
            this.id = id;
            return this;
        }

        public Builder clusterId(String clusterId) {
            this.clusterId = clusterId;
            return this;
        }

        public Builder timestamp(Instant timestamp) {
            this.timestamp = timestamp;
            return this;
        }

        public Builder level(EventLevel level) {
            this.level = level;
            return this;
        }

        public Builder type(String type) {
            this.type = type;
            return this;
        }

        public Builder nodeId(Integer nodeId) {
            this.nodeId = nodeId;
            return this;
        }

        public Builder agentId(String agentId) {
            this.agentId = agentId;
            return this;
        }

        public Builder message(String message) {
            this.message = message;
            return this;
        }

        public Builder username(String username) {
            this.username = username;
            return this;
        }

        public Builder source(EventSource source) {
            this.source = source;
            return this;
        }

        public Builder detailsJson(String detailsJson) {
            this.detailsJson = detailsJson;
            return this;
        }

        public Builder createdAt(Instant createdAt) {
            this.createdAt = createdAt;
            return this;
        }

        public Builder details(Map<String, Object> details) {
            this.details = details;
            return this;
        }

        public ClusterEvent build() {
            return new ClusterEvent(this);
        }
    }
}

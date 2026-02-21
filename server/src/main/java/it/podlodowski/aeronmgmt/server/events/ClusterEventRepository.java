package it.podlodowski.aeronmgmt.server.events;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface ClusterEventRepository extends JpaRepository<ClusterEvent, UUID> {

    Page<ClusterEvent> findByClusterIdAndTimestampBetween(
            String clusterId, Instant from, Instant to, Pageable pageable);

    Page<ClusterEvent> findByClusterIdAndTimestampBetweenAndLevelIn(
            String clusterId, Instant from, Instant to,
            List<EventLevel> levels, Pageable pageable);

    Page<ClusterEvent> findByClusterIdAndTimestampBetweenAndNodeId(
            String clusterId, Instant from, Instant to,
            Integer nodeId, Pageable pageable);

    Page<ClusterEvent> findByClusterIdAndTimestampBetweenAndTypeIn(
            String clusterId, Instant from, Instant to,
            List<String> types, Pageable pageable);

    long countByClusterId(String clusterId);

    boolean existsByClusterId(String clusterId);

    @Query("SELECT e FROM ClusterEvent e WHERE e.clusterId = :clusterId " +
           "AND e.timestamp BETWEEN :from AND :to " +
           "AND e.type = :type AND e.nodeId = :nodeId")
    List<ClusterEvent> findForDedup(String clusterId, Instant from, Instant to,
                                     String type, Integer nodeId);

    @Modifying
    @Transactional
    @Query("DELETE FROM ClusterEvent e WHERE e.timestamp < :cutoff")
    int deleteByTimestampBefore(Instant cutoff);

    ClusterEvent findFirstByClusterIdOrderByTimestampDesc(String clusterId);

    ClusterEvent findFirstByClusterIdAndNodeIdOrderByTimestampDesc(String clusterId, Integer nodeId);
}

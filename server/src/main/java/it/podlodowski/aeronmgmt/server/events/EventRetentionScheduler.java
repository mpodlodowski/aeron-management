package it.podlodowski.aeronmgmt.server.events;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

@Component
public class EventRetentionScheduler {

    private static final Logger LOGGER = LoggerFactory.getLogger(EventRetentionScheduler.class);

    private final ClusterEventRepository repository;
    private final int retentionDays;
    private final int maxCount;

    public EventRetentionScheduler(ClusterEventRepository repository,
                                    @Value("${aeron.management.events.retention-days:7}") int retentionDays,
                                    @Value("${aeron.management.events.max-count:10000}") int maxCount) {
        this.repository = repository;
        this.retentionDays = retentionDays;
        this.maxCount = maxCount;
    }

    @Scheduled(fixedRate = 3600000) // every hour
    public void cleanup() {
        Instant cutoff = Instant.now().minus(retentionDays, ChronoUnit.DAYS);
        int deleted = repository.deleteByTimestampBefore(cutoff);
        if (deleted > 0) {
            LOGGER.info("Retention: deleted {} events older than {} days", deleted, retentionDays);
        }

        long count = repository.count();
        if (count > maxCount) {
            long excess = count - maxCount;
            LOGGER.info("Retention: event count {} exceeds max {}, will prune {} oldest", count, maxCount, excess);
            var oldest = repository.findAll(
                    PageRequest.of(0, (int) excess, Sort.by("timestamp")));
            repository.deleteAll(oldest.getContent());
        }
    }
}

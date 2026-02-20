package it.podlodowski.aeronmgmt.server.websocket;

import it.podlodowski.aeronmgmt.common.proto.MetricsReport;
import it.podlodowski.aeronmgmt.server.aggregator.ClusterStateAggregator;
import it.podlodowski.aeronmgmt.server.cluster.ClusterManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;

import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Sends current state to WebSocket clients when they subscribe to a topic.
 * This ensures clients always receive an initial snapshot without needing a separate REST fetch.
 */
@Component
public class WebSocketSubscriptionHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(WebSocketSubscriptionHandler.class);

    private static final Pattern CLUSTER_OVERVIEW = Pattern.compile("^/topic/clusters/([^/]+)/cluster$");
    private static final Pattern CLUSTER_ALERTS = Pattern.compile("^/topic/clusters/([^/]+)/alerts$");
    private static final Pattern CLUSTER_NODES = Pattern.compile("^/topic/clusters/([^/]+)/nodes$");

    private final ClusterManager clusterManager;
    private final SimpMessagingTemplate messagingTemplate;

    public WebSocketSubscriptionHandler(ClusterManager clusterManager, SimpMessagingTemplate messagingTemplate) {
        this.clusterManager = clusterManager;
        this.messagingTemplate = messagingTemplate;
    }

    @EventListener
    public void handleSubscribe(SessionSubscribeEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String destination = accessor.getDestination();
        if (destination == null) {
            return;
        }

        if ("/topic/clusters".equals(destination)) {
            LOGGER.debug("Subscription to /topic/clusters — sending current cluster list");
            messagingTemplate.convertAndSend("/topic/clusters", clusterManager.getAllClusterOverviews());
            return;
        }

        Matcher matcher;

        matcher = CLUSTER_OVERVIEW.matcher(destination);
        if (matcher.matches()) {
            ClusterStateAggregator aggregator = clusterManager.getCluster(matcher.group(1));
            if (aggregator != null) {
                messagingTemplate.convertAndSend(destination, aggregator.buildClusterOverview());
            }
            return;
        }

        matcher = CLUSTER_ALERTS.matcher(destination);
        if (matcher.matches()) {
            ClusterStateAggregator aggregator = clusterManager.getCluster(matcher.group(1));
            if (aggregator != null) {
                List<Map<String, Object>> events = aggregator.getRecentEvents();
                for (Map<String, Object> alert : events) {
                    messagingTemplate.convertAndSend(destination, alert);
                }
            }
            return;
        }

        matcher = CLUSTER_NODES.matcher(destination);
        if (matcher.matches()) {
            ClusterStateAggregator aggregator = clusterManager.getCluster(matcher.group(1));
            if (aggregator != null) {
                for (Map.Entry<Integer, MetricsReport> entry : aggregator.getLatestMetrics().entrySet()) {
                    messagingTemplate.convertAndSend(destination,
                            aggregator.convertMetricsToMap(entry.getValue()));
                }
            }
        }
    }
}

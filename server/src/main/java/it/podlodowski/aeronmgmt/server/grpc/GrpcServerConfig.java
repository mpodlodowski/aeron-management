package it.podlodowski.aeronmgmt.server.grpc;

import io.grpc.Server;
import io.grpc.ServerBuilder;
import it.podlodowski.aeronmgmt.server.aggregator.ClusterStateAggregator;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class GrpcServerConfig {

    private static final Logger LOGGER = LoggerFactory.getLogger(GrpcServerConfig.class);

    @Value("${grpc.server.port:8081}")
    private int grpcPort;

    private Server grpcServer;

    @Autowired
    private AgentConnectionService agentConnectionService;

    @Bean
    public AgentConnectionService agentConnectionService(AgentRegistry registry,
                                                          ClusterStateAggregator aggregator) {
        return new AgentConnectionService(registry, aggregator);
    }

    @PostConstruct
    public void startGrpcServer() throws Exception {
        grpcServer = ServerBuilder.forPort(grpcPort)
                .addService(agentConnectionService)
                .build()
                .start();
        LOGGER.info("gRPC server started on port {}", grpcPort);
    }

    @PreDestroy
    public void stopGrpcServer() {
        if (grpcServer != null) {
            LOGGER.info("Shutting down gRPC server");
            grpcServer.shutdown();
        }
    }
}

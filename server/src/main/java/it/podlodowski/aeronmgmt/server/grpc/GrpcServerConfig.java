package it.podlodowski.aeronmgmt.server.grpc;

import io.grpc.Server;
import io.grpc.netty.shaded.io.grpc.netty.NettyServerBuilder;
import it.podlodowski.aeronmgmt.server.aggregator.ClusterStateAggregator;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.TimeUnit;

@Configuration
public class GrpcServerConfig {

    private static final Logger LOGGER = LoggerFactory.getLogger(GrpcServerConfig.class);

    @Value("${grpc.server.port:8081}")
    private int grpcPort;

    private Server grpcServer;

    @Bean
    public AgentConnectionService agentConnectionService(AgentRegistry registry,
                                                          ClusterStateAggregator aggregator) {
        return new AgentConnectionService(registry, aggregator);
    }

    @Bean
    public Server grpcServer(AgentConnectionService agentConnectionService) throws Exception {
        grpcServer = NettyServerBuilder.forPort(grpcPort)
                .addService(agentConnectionService)
                .permitKeepAliveTime(30, TimeUnit.SECONDS)
                .permitKeepAliveWithoutCalls(true)
                .build()
                .start();
        LOGGER.info("gRPC server started on port {}", grpcPort);
        return grpcServer;
    }

    @PreDestroy
    public void stopGrpcServer() {
        if (grpcServer != null) {
            LOGGER.info("Shutting down gRPC server");
            grpcServer.shutdown();
        }
    }
}

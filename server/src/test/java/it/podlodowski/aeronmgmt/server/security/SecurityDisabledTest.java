package it.podlodowski.aeronmgmt.server.security;

import io.grpc.Server;
import it.podlodowski.aeronmgmt.server.grpc.AgentConnectionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "aeron.management.server.auth.type=none")
class SecurityDisabledTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private Server grpcServer;

    @MockBean
    private AgentConnectionService agentConnectionService;

    @Test
    void shouldAllowUnauthenticatedAccessWhenAuthDisabled() throws Exception {
        mockMvc.perform(get("/api/clusters"))
                .andExpect(status().isOk());
    }
}

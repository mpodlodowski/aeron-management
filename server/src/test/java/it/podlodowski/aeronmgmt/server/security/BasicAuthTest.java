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

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
    "aeron.management.server.auth.type=basic",
    "aeron.management.server.auth.basic.username=admin",
    "aeron.management.server.auth.basic.password=secret"
})
class BasicAuthTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private Server grpcServer;

    @MockBean
    private AgentConnectionService agentConnectionService;

    @Test
    void shouldRejectUnauthenticatedRequest() throws Exception {
        mockMvc.perform(get("/api/clusters"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void shouldRejectWrongCredentials() throws Exception {
        mockMvc.perform(get("/api/clusters")
                .with(httpBasic("admin", "wrong")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void shouldAllowValidCredentials() throws Exception {
        mockMvc.perform(get("/api/clusters")
                .with(httpBasic("admin", "secret")))
                .andExpect(status().isOk());
    }
}

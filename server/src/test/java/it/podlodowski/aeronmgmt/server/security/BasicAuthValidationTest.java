package it.podlodowski.aeronmgmt.server.security;

import it.podlodowski.aeronmgmt.server.ServerApplication;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BasicAuthValidationTest {

    @Test
    void shouldFailToStartWithBasicAuthAndNoCredentials() {
        var app = new SpringApplication(ServerApplication.class);
        var ex = assertThrows(Exception.class, () -> app.run(
            "--aeron.management.server.auth.type=basic",
            "--aeron.management.server.auth.basic.username=",
            "--aeron.management.server.auth.basic.password=",
            "--server.port=0",
            "--aeron.management.server.port=0"
        ));
        assertTrue(hasIllegalStateCause(ex),
            "Expected IllegalStateException about blank credentials, but got: " + ex);
    }

    private boolean hasIllegalStateCause(Throwable ex) {
        while (ex != null) {
            if (ex instanceof IllegalStateException
                    && ex.getMessage() != null
                    && ex.getMessage().contains("username/password are not configured")) {
                return true;
            }
            ex = ex.getCause();
        }
        return false;
    }
}

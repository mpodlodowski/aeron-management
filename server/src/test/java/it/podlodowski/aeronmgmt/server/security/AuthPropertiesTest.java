package it.podlodowski.aeronmgmt.server.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(
    classes = AuthProperties.class,
    webEnvironment = SpringBootTest.WebEnvironment.NONE
)
@EnableConfigurationProperties(AuthProperties.class)
@TestPropertySource(properties = {
    "aeron.management.server.auth.type=basic",
    "aeron.management.server.auth.basic.username=testuser",
    "aeron.management.server.auth.basic.password=testpass"
})
class AuthPropertiesTest {

    @Autowired
    private AuthProperties authProperties;

    @Test
    void shouldBindProperties() {
        assertEquals("basic", authProperties.getType());
        assertEquals("testuser", authProperties.getBasic().getUsername());
        assertEquals("testpass", authProperties.getBasic().getPassword());
    }
}

package it.podlodowski.aeronmgmt.server.security;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthProperties authProperties;

    public AuthController(AuthProperties authProperties) {
        this.authProperties = authProperties;
    }

    @GetMapping("/me")
    public Map<String, Object> me(Principal principal) {
        if (principal == null) {
            return Map.of("authenticated", false);
        }
        return Map.of(
            "authenticated", true,
            "username", principal.getName()
        );
    }
}

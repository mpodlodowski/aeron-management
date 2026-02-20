package it.podlodowski.aeronmgmt.server.security;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final AuthProperties authProperties;

    public SecurityConfig(AuthProperties authProperties) {
        this.authProperties = authProperties;
    }

    @PostConstruct
    public void validateAuthConfig() {
        if ("basic".equals(authProperties.getType())) {
            if (authProperties.getBasic().getUsername() == null
                    || authProperties.getBasic().getUsername().isBlank()
                    || authProperties.getBasic().getPassword() == null
                    || authProperties.getBasic().getPassword().isBlank()) {
                throw new IllegalStateException(
                    "Basic auth is enabled (aeron.management.server.auth.type=basic) " +
                    "but username/password are not configured. " +
                    "Set aeron.management.server.auth.basic.username and " +
                    "aeron.management.server.auth.basic.password.");
            }
        }
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        if ("basic".equals(authProperties.getType())) {
            http
                .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                .httpBasic(basic -> {})
                .csrf(csrf -> csrf.disable());
        } else {
            http
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .csrf(csrf -> csrf.disable());
        }
        return http.build();
    }

    @Bean
    @ConditionalOnProperty(name = "aeron.management.server.auth.type", havingValue = "basic")
    public UserDetailsService userDetailsService() {
        var user = User.withDefaultPasswordEncoder()
                .username(authProperties.getBasic().getUsername())
                .password(authProperties.getBasic().getPassword())
                .roles("USER")
                .build();
        return new InMemoryUserDetailsManager(user);
    }
}

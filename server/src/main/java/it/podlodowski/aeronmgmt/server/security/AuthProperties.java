package it.podlodowski.aeronmgmt.server.security;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "aeron.management.server.auth")
public class AuthProperties {

    private String type = "none";
    private BasicProperties basic = new BasicProperties();

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public BasicProperties getBasic() {
        return basic;
    }

    public void setBasic(BasicProperties basic) {
        this.basic = basic;
    }

    public static class BasicProperties {
        private String username;
        private String password;

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }
    }
}

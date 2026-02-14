package it.podlodowski.aeronmgmt.agent;

import io.javalin.Javalin;

public class HealthEndpoint {

    private final Javalin app;

    public HealthEndpoint(int port) {
        this.app = Javalin.create().start(port);
        this.app.get("/health", ctx -> ctx.result("OK"));
    }

    public void stop() {
        app.stop();
    }
}

package it.podlodowski.aeronmgmt.agent;

import java.io.IOException;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class HealthEndpoint {

    private static final Logger log = LoggerFactory.getLogger(HealthEndpoint.class);

    private static final String RESPONSE =
            "HTTP/1.1 200 OK\r\n"
                    + "Content-Type: text/plain\r\n"
                    + "Content-Length: 2\r\n"
                    + "Connection: close\r\n"
                    + "\r\n"
                    + "OK";

    private final ServerSocket serverSocket;
    private volatile boolean running = true;

    public HealthEndpoint(int port) throws IOException {
        this.serverSocket = new ServerSocket(port);
        Thread acceptThread = new Thread(this::acceptLoop, "health-endpoint");
        acceptThread.setDaemon(true);
        acceptThread.start();
        log.info("Health endpoint listening on port {}", port);
    }

    private void acceptLoop() {
        while (running) {
            try (Socket client = serverSocket.accept()) {
                // Drain the request (read until we see end of headers or socket times out)
                client.setSoTimeout(1000);
                try {
                    //noinspection StatementWithEmptyBody
                    while (client.getInputStream().read() != -1) {
                        // We only need to consume enough for the server to respond,
                        // but reading until EOF or timeout is simplest.
                    }
                } catch (IOException ignored) {
                    // Timeout or reset — fine, we still send the response
                }
                OutputStream out = client.getOutputStream();
                out.write(RESPONSE.getBytes());
                out.flush();
            } catch (IOException e) {
                if (running) {
                    log.debug("Health endpoint accept error", e);
                }
            }
        }
    }

    public void stop() {
        running = false;
        try {
            serverSocket.close();
        } catch (IOException e) {
            log.debug("Error closing health endpoint socket", e);
        }
    }
}

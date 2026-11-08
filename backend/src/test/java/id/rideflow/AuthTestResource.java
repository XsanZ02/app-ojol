package id.rideflow;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import com.sun.net.httpserver.HttpServer;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class AuthTestResource implements QuarkusTestResourceLifecycleManager {

    private static final Pattern HOST_PORT = Pattern.compile(":(\\d+)\\s*$");
    private static final long COMMAND_TIMEOUT_SECONDS = 180;
    private static final long DATABASE_STARTUP_TIMEOUT_SECONDS = 90;

    private String containerName;
    private HttpServer routeServer;

    @Override
    public Map<String, String> start() {
        containerName = "rideflow-auth-it-" + UUID.randomUUID().toString().replace("-", "");
        String databasePassword = UUID.randomUUID().toString();
        try {
            runDocker(
                    "run", "--detach", "--rm",
                    "--name", containerName,
                    "--publish", "127.0.0.1::5432",
                    "--env", "POSTGRES_PASSWORD=" + databasePassword,
                    "--env", "POSTGRES_DB=rideflow_auth_test",
                    "postgres:17");

            int port = mappedPort();
            String jdbcUrl = "jdbc:postgresql://127.0.0.1:" + port + "/rideflow_auth_test";
            awaitDatabaseReady(jdbcUrl, databasePassword);
            routeServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            routeServer.createContext("/route", exchange -> {
                String request = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                boolean fail = java.util.regex.Pattern
                        .compile("\"lat\"\\s*:\\s*0(?:\\.0+)?(?:\\s*[,}])")
                        .matcher(request)
                        .find();
                String body = fail
                        ? "{\"error_code\":154,\"error\":\"test provider failure\"}"
                        : """
                                {"trip":{"summary":{"length":4.8,"time":900},
                                  "legs":[{"shape":"_p~iF~ps|U_ulLnnqC_mqNvxq`@"}]}}
                                """;
                byte[] response = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(fail ? 503 : 200, response.length);
                try (var output = exchange.getResponseBody()) {
                    output.write(response);
                }
            });
            routeServer.start();
            Map<String, String> config = new HashMap<>();
            config.put("quarkus.datasource.db-kind", "postgresql");
            config.put("quarkus.datasource.jdbc.url", jdbcUrl);
            config.put("quarkus.datasource.username", "postgres");
            config.put("quarkus.datasource.password", databasePassword);
            config.put("quarkus.flyway.migrate-at-start", "true");
            config.put("quarkus.flyway.clean-disabled", "true");
            config.put("rideflow.jwt.ttl-seconds", "900");
            config.put(
                    "rideflow.routing.valhalla-url",
                    "http://127.0.0.1:" + routeServer.getAddress().getPort() + "/route");
            config.put("rideflow.routing.timeout-seconds", "2");
            return config;
        } catch (Exception exception) {
            stop();
            throw new IllegalStateException("Could not prepare isolated auth test resources", exception);
        }
    }

    @Override
    public void stop() {
        if (routeServer != null) {
            routeServer.stop(0);
            routeServer = null;
        }
        if (containerName != null) {
            try {
                runDocker("stop", "--time", "2", containerName);
            } catch (Exception exception) {
                throw new IllegalStateException("Could not stop isolated auth test container", exception);
            } finally {
                containerName = null;
            }
        }
    }

    private int mappedPort() throws Exception {
        String output = runDocker("port", containerName, "5432/tcp");
        Matcher matcher = HOST_PORT.matcher(output.trim());
        if (!matcher.find()) {
            throw new IllegalStateException("Could not determine isolated PostgreSQL port: " + output);
        }
        return Integer.parseInt(matcher.group(1));
    }

    private void awaitDatabaseReady(String jdbcUrl, String databasePassword) throws Exception {
        long deadline = System.nanoTime()
                + TimeUnit.SECONDS.toNanos(DATABASE_STARTUP_TIMEOUT_SECONDS);
        SQLException lastFailure = null;
        while (System.nanoTime() < deadline) {
            try (var connection = DriverManager.getConnection(jdbcUrl, "postgres", databasePassword)) {
                return;
            } catch (SQLException exception) {
                lastFailure = exception;
                Thread.sleep(500);
            }
        }
        throw new IllegalStateException("Disposable PostgreSQL did not become ready in time", lastFailure);
    }

    private static String runDocker(String... arguments) throws Exception {
        var command = new java.util.ArrayList<String>();
        command.add("docker");
        command.addAll(java.util.List.of(arguments));
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        if (!process.waitFor(COMMAND_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IllegalStateException("Docker command timed out: " + command.get(1));
        }
        String output = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        if (process.exitValue() != 0) {
            throw new IllegalStateException("Docker command failed (" + command.get(1) + "): " + output);
        }
        return output;
    }
}

package id.rideflow;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Duration;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.junit.jupiter.api.Assertions.assertThrows;

@EnabledIfSystemProperty(named = "rideflow.postgres17.integration", matches = "true")
class FlywayPostgres17Test {

    private static final Duration DOCKER_COMMAND_TIMEOUT = Duration.ofMinutes(3);
    private static final Duration DATABASE_STARTUP_TIMEOUT = Duration.ofSeconds(60);
    private static final Pattern HOST_PORT = Pattern.compile(":(\\d+)\\s*$");

    @Test
    void appliesV1ToDisposablePostgres17AndVerifiesSchema() throws Exception {
        String containerName = "rideflow-v1-it-" + UUID.randomUUID().toString().replace("-", "");
        String password = UUID.randomUUID().toString();
        boolean containerStarted = false;

        try {
            runDocker(
                    "run", "--detach", "--rm",
                    "--name", containerName,
                    "--publish", "127.0.0.1::5432",
                    "--env", "POSTGRES_PASSWORD=" + password,
                    "--env", "POSTGRES_DB=rideflow_validation",
                    "postgres:17");
            containerStarted = true;

            int port = mappedPort(containerName);
            String jdbcUrl = "jdbc:postgresql://127.0.0.1:" + port + "/rideflow_validation";
            awaitDatabase(jdbcUrl, password);

            Flyway flyway = Flyway.configure()
                    .dataSource(jdbcUrl, "postgres", password)
                    .locations("classpath:db/migration")
                    .load();
            var migrationResult = flyway.migrate();
            assertEquals(1, migrationResult.migrationsExecuted);
            flyway.validate();

            try (Connection connection = DriverManager.getConnection(jdbcUrl, "postgres", password)) {
                assertEquals("17", serverMajorVersion(connection));
                verifySchemaObjects(connection);
                verifyTripConstraints(connection);
            }
        } finally {
            if (containerStarted) {
                runDocker("stop", "--time", "2", containerName);
            }
        }
    }

    private static void verifySchemaObjects(Connection connection) throws SQLException {
        Set<String> tables = queryStringSet(connection,
                "SELECT table_name FROM information_schema.tables "
                        + "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
        assertTrue(tables.containsAll(Set.of(
                "users", "user_roles", "driver_profiles", "driver_vehicles",
                "trips", "trip_status_history", "payments", "ratings",
                "flyway_schema_history")));

        Set<String> foreignKeys = queryStringSet(connection,
                "SELECT conname FROM pg_constraint "
                        + "WHERE contype = 'f' AND connamespace = 'public'::regnamespace");
        assertTrue(foreignKeys.containsAll(Set.of(
                "user_roles_user_fk", "driver_profiles_user_role_fk",
                "driver_vehicles_driver_fk", "trips_rider_user_fk",
                "trips_driver_vehicle_fk", "trip_status_history_trip_fk",
                "trip_status_history_actor_fk", "payments_trip_fk",
                "ratings_trip_fk", "ratings_from_user_fk", "ratings_to_user_fk")));

        Set<String> checkConstraints = queryStringSet(connection,
                "SELECT conname FROM pg_constraint "
                        + "WHERE contype = 'c' AND connamespace = 'public'::regnamespace");
        assertTrue(checkConstraints.containsAll(Set.of(
                "trips_pickup_longitude_range", "trips_status_timestamps_consistent",
                "trips_timestamps_chronological", "payments_paid_state_matches_timestamp",
                "payments_settled_digital_has_provider_reference",
                "ratings_score_range", "ratings_users_distinct")));

        Set<String> indexes = queryStringSet(connection,
                "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'");
        assertTrue(indexes.containsAll(Set.of(
                "users_email_lowercase_uq", "users_phone_e164_uq",
                "driver_profiles_status_idx", "driver_vehicles_plate_uq",
                "driver_vehicles_active_driver_type_idx", "trips_rider_requested_at_idx",
                "trips_driver_requested_at_idx", "trips_status_requested_at_idx",
                "trip_status_history_trip_changed_idx", "payments_provider_reference_uq",
                "ratings_trip_from_user_uq")));

        Set<String> triggers = queryStringSet(connection,
                "SELECT tgname FROM pg_trigger "
                        + "WHERE NOT tgisinternal AND tgrelid IN "
                        + "(SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)");
        assertTrue(triggers.containsAll(Set.of(
                "users_set_updated_at", "driver_profiles_set_updated_at",
                "driver_vehicles_set_updated_at", "trips_set_updated_at",
                "payments_set_updated_at")));

        try (Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery(
                        "SELECT to_regprocedure('public.set_updated_at()') IS NOT NULL")) {
            assertTrue(result.next());
            assertTrue(result.getBoolean(1), "updated_at trigger function should exist");
        }
    }

    private static void verifyTripConstraints(Connection connection) throws SQLException {
        long riderId = insertUser(connection, "rider@rideflow.test");
        long driverId = insertUser(connection, "driver@rideflow.test");
        long otherDriverId = insertUser(connection, "other-driver@rideflow.test");
        insertRole(connection, riderId, "customer");
        insertRole(connection, driverId, "driver");
        insertRole(connection, otherDriverId, "driver");
        insertDriverProfile(connection, driverId);
        insertDriverProfile(connection, otherDriverId);
        long vehicleId = insertVehicle(connection, driverId);

        assertSqlState("23514", () -> insertTrip(
                connection, riderId, null, null, "completed", null));

        insertTrip(connection, riderId, driverId, vehicleId, "accepted", "CURRENT_TIMESTAMP");

        assertSqlState("23503", () -> insertTrip(
                connection, riderId, otherDriverId, vehicleId, "accepted", "CURRENT_TIMESTAMP"));
    }

    private static long insertUser(Connection connection, String email) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO users (full_name, email, password_hash) "
                        + "VALUES (?, ?, ?) RETURNING id")) {
            statement.setString(1, email);
            statement.setString(2, email);
            statement.setString(3, "test-password-hash");
            try (ResultSet result = statement.executeQuery()) {
                assertTrue(result.next());
                return result.getLong(1);
            }
        }
    }

    private static void insertRole(Connection connection, long userId, String role) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO user_roles (user_id, role) VALUES (?, ?)")) {
            statement.setLong(1, userId);
            statement.setString(2, role);
            statement.executeUpdate();
        }
    }

    private static void insertDriverProfile(Connection connection, long userId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO driver_profiles (user_id, status) VALUES (?, 'active')")) {
            statement.setLong(1, userId);
            statement.executeUpdate();
        }
    }

    private static long insertVehicle(Connection connection, long driverId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO driver_vehicles "
                        + "(driver_user_id, vehicle_type, plate_normalized, make, model, color, "
                        + "verification_status, is_active) "
                        + "VALUES (?, 'motorcycle', 'DK1234AB', 'Honda', 'Vario', 'Black', "
                        + "'verified', TRUE) RETURNING id")) {
            statement.setLong(1, driverId);
            try (ResultSet result = statement.executeQuery()) {
                assertTrue(result.next());
                return result.getLong(1);
            }
        }
    }

    private static void insertTrip(
            Connection connection,
            long riderId,
            Long driverId,
            Long vehicleId,
            String status,
            String acceptedAtExpression) throws SQLException {
        String acceptedAt = acceptedAtExpression == null ? "NULL" : acceptedAtExpression;
        String sql = "INSERT INTO trips "
                + "(rider_user_id, driver_user_id, vehicle_id, vehicle_type, "
                + "pickup_address, pickup_latitude, pickup_longitude, "
                + "dropoff_address, dropoff_latitude, dropoff_longitude, status, "
                + "estimated_fare, requested_at, accepted_at) "
                + "VALUES (?, ?, ?, 'motorcycle', 'Pickup', -8.650000, 115.210000, "
                + "'Dropoff', -8.670000, 115.230000, ?, 15000, "
                + "CURRENT_TIMESTAMP - INTERVAL '1 minute', " + acceptedAt + ")";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, riderId);
            if (driverId == null) {
                statement.setNull(2, java.sql.Types.BIGINT);
            } else {
                statement.setLong(2, driverId);
            }
            if (vehicleId == null) {
                statement.setNull(3, java.sql.Types.BIGINT);
            } else {
                statement.setLong(3, vehicleId);
            }
            statement.setString(4, status);
            statement.executeUpdate();
        }
    }

    private static String serverMajorVersion(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("SELECT current_setting('server_version_num')")) {
            assertTrue(result.next());
            String version = result.getString(1);
            assertNotNull(version);
            assertTrue(version.startsWith("17"), "Expected PostgreSQL 17, got " + version);
            return "17";
        }
    }

    private static Set<String> queryStringSet(Connection connection, String sql) throws SQLException {
        Set<String> values = new HashSet<>();
        try (Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery(sql)) {
            while (result.next()) {
                values.add(result.getString(1));
            }
        }
        return values;
    }

    private static void assertSqlState(String expectedState, SqlAction action) throws SQLException {
        SQLException exception = assertThrows(SQLException.class, action::run);
        assertEquals(expectedState, exception.getSQLState());
    }

    private static int mappedPort(String containerName) throws Exception {
        String output = runDocker("port", containerName, "5432/tcp");
        Matcher matcher = HOST_PORT.matcher(output.trim());
        if (!matcher.find()) {
            fail("Could not determine disposable PostgreSQL port from Docker output: " + output);
        }
        return Integer.parseInt(matcher.group(1));
    }

    private static void awaitDatabase(String jdbcUrl, String password) throws Exception {
        long deadline = System.nanoTime() + DATABASE_STARTUP_TIMEOUT.toNanos();
        SQLException lastFailure = null;
        while (System.nanoTime() < deadline) {
            try (Connection ignored = DriverManager.getConnection(jdbcUrl, "postgres", password)) {
                return;
            } catch (SQLException exception) {
                lastFailure = exception;
                Thread.sleep(500);
            }
        }
        throw new AssertionError("Disposable PostgreSQL did not become ready in time", lastFailure);
    }

    private static String runDocker(String... arguments) throws Exception {
        var command = new java.util.ArrayList<String>();
        command.add("docker");
        command.addAll(java.util.List.of(arguments));
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        if (!process.waitFor(DOCKER_COMMAND_TIMEOUT.toSeconds(), TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new AssertionError("Docker command timed out: " + command.get(1));
        }
        String output = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        if (process.exitValue() != 0) {
            throw new AssertionError("Docker command failed (" + command.get(1) + "): " + output);
        }
        return output;
    }

    @FunctionalInterface
    private interface SqlAction {
        void run() throws SQLException;
    }
}

package id.rideflow;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationState;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
@QuarkusTestResource(value = AuthTestResource.class, restrictToAnnotatedClass = true)
@QuarkusTestResource(JwtKeyTestResource.class)
class FlywayMigrationTest {

    @Inject
    Flyway flyway;

    @ConfigProperty(name = "quarkus.datasource.db-kind")
    String datasourceDbKind;

    @ConfigProperty(name = "quarkus.flyway.migrate-at-start")
    boolean migrateAtStart;

    @ConfigProperty(name = "quarkus.flyway.clean-at-start")
    boolean cleanAtStart;

    @ConfigProperty(name = "quarkus.flyway.clean-disabled")
    boolean cleanDisabled;

    @Test
    void migrationsAreConfiguredSafelyAndHaveExpectedSchema() throws IOException {
        assertEquals("postgresql", datasourceDbKind);
        assertTrue(migrateAtStart, "Only the disposable test database should migrate at startup");
        assertFalse(cleanAtStart);
        assertTrue(cleanDisabled);

        var initialMigration = java.util.Arrays.stream(flyway.info().all())
                .filter(migration -> "1".equals(migration.getVersion().getVersion())
                        && "create initial schema".equals(migration.getDescription()))
                .findFirst()
                .orElse(null);
        assertTrue(initialMigration != null, "Flyway should discover the initial schema migration");
        assertEquals(MigrationState.SUCCESS, initialMigration.getState());
        var onlineStatusMigration = java.util.Arrays.stream(flyway.info().all())
                .filter(migration -> "2".equals(migration.getVersion().getVersion())
                        && "add driver online status".equals(migration.getDescription()))
                .findFirst()
                .orElse(null);
        assertTrue(onlineStatusMigration != null, "Flyway should discover the driver status migration");
        assertEquals(MigrationState.SUCCESS, onlineStatusMigration.getState());
        var adminRoleMigration = java.util.Arrays.stream(flyway.info().all())
                .filter(migration -> "3".equals(migration.getVersion().getVersion())
                        && "add admin role".equals(migration.getDescription()))
                .findFirst()
                .orElse(null);
        assertTrue(adminRoleMigration != null, "Flyway should discover the admin role migration");
        assertEquals(MigrationState.SUCCESS, adminRoleMigration.getState());
        var routeEstimateMigration = java.util.Arrays.stream(flyway.info().all())
                .filter(migration -> "5".equals(migration.getVersion().getVersion())
                        && "store routed trip estimates".equals(migration.getDescription()))
                .findFirst()
                .orElse(null);
        assertTrue(routeEstimateMigration != null, "Flyway should discover the routed trip migration");
        assertEquals(MigrationState.SUCCESS, routeEstimateMigration.getState());
        var tripNotesMigration = java.util.Arrays.stream(flyway.info().all())
                .filter(migration -> "6".equals(migration.getVersion().getVersion())
                        && "store trip notes".equals(migration.getDescription()))
                .findFirst()
                .orElse(null);
        assertTrue(tripNotesMigration != null, "Flyway should discover the trip notes migration");
        assertEquals(MigrationState.SUCCESS, tripNotesMigration.getState());
        flyway.validate();

        String routeMigration;
        try (InputStream migrationResource = Thread.currentThread()
                .getContextClassLoader()
                .getResourceAsStream("db/migration/V5__store_routed_trip_estimates.sql")) {
            assertNotNull(migrationResource, "Routed trip migration should be on the classpath");
            routeMigration = new String(migrationResource.readAllBytes(), StandardCharsets.UTF_8)
                    .toLowerCase()
                    .replaceAll("\\s+", " ");
        }
        assertContains(routeMigration, "route_distance_meters bigint");
        assertContains(routeMigration, "estimated_duration_seconds integer");
        assertContains(routeMigration, "route_geometry text");
        assertContains(routeMigration, "routing_provider varchar(64)");
        assertContains(routeMigration, "fare_config_version varchar(32)");

        Properties productionProperties = new Properties();
        try (var reader = Files.newBufferedReader(Path.of("src/main/resources/application.properties"))) {
            productionProperties.load(reader);
        }
        assertEquals("false", productionProperties.getProperty("quarkus.flyway.migrate-at-start"));
        assertEquals("false", productionProperties.getProperty("quarkus.flyway.clean-at-start"));
        assertEquals("true", productionProperties.getProperty("quarkus.flyway.clean-disabled"));

        String sql;
        try (InputStream migrationResource = Thread.currentThread()
                .getContextClassLoader()
                .getResourceAsStream("db/migration/V1__create_initial_schema.sql")) {
            assertNotNull(migrationResource, "Initial migration SQL should be on the classpath");
            sql = new String(migrationResource.readAllBytes(), StandardCharsets.UTF_8)
                    .toLowerCase()
                    .replaceAll("\\s+", " ");
        }

        assertContains(sql, "create table users");
        assertContains(sql, "password_hash varchar(255) not null");
        assertContains(sql, "check (btrim(full_name) <> '')");
        assertContains(sql, "phone_e164 ~ '^\\+[1-9][0-9]{0,14}$'");
        assertContains(sql, "create unique index users_email_lowercase_uq on users (lower(email))");
        assertContains(sql, "create table user_roles");
        assertContains(sql, "check (role in ('customer', 'driver'))");
        assertContains(sql, "foreign key (user_id, role) references user_roles (user_id, role)");
        assertContains(sql, "create table driver_profiles");
        assertContains(sql, "check (status in ('pending', 'active', 'suspended'))");
        assertContains(sql, "create table driver_vehicles");
        assertContains(sql, "check (vehicle_type in ('motorcycle', 'car'))");
        assertContains(sql, "check (verification_status in ('pending', 'verified', 'rejected'))");
        assertContains(sql, "create unique index driver_vehicles_plate_uq on driver_vehicles (plate_normalized)");
        assertContains(sql, "create index driver_vehicles_active_driver_type_idx");
        assertContains(sql, "create table trips");
        assertContains(sql, "foreign key (rider_user_id) references users (id)");
        assertContains(sql, "foreign key (driver_user_id, vehicle_id, vehicle_type) references driver_vehicles (driver_user_id, id, vehicle_type)");
        assertContains(sql, "check (btrim(pickup_address) <> '')");
        assertContains(sql, "pickup_latitude numeric(9, 6) not null");
        assertContains(sql, "check (pickup_latitude between -90 and 90)");
        assertContains(sql, "check (pickup_longitude between -180 and 180)");
        assertContains(sql, "estimated_fare numeric(12, 2) not null");
        assertContains(sql, "status in ('requested', 'accepted', 'picking_up', 'in_progress', 'completed', 'cancelled')");
        assertContains(sql, "constraint trips_assignment_matches_acceptance check");
        assertContains(sql, "constraint trips_status_timestamps_consistent check");
        assertContains(sql, "(status = 'requested' and accepted_at is null and started_at is null and completed_at is null and cancelled_at is null and final_fare is null)");
        assertContains(sql, "or (status in ('accepted', 'picking_up') and driver_user_id is not null and accepted_at is not null and started_at is null and completed_at is null and cancelled_at is null and final_fare is null)");
        assertContains(sql, "or (status = 'in_progress' and driver_user_id is not null and accepted_at is not null and started_at is not null and completed_at is null and cancelled_at is null and final_fare is null)");
        assertContains(sql, "or (status = 'completed' and driver_user_id is not null and accepted_at is not null and started_at is not null and completed_at is not null and cancelled_at is null and final_fare is not null)");
        assertContains(sql, "or (status = 'cancelled' and cancelled_at is not null and started_at is null and completed_at is null and final_fare is null)");
        assertContains(sql, "constraint trips_timestamps_chronological check");
        assertContains(sql, "cancelled_at >= coalesce(accepted_at, requested_at)");
        assertContains(sql, "create index trips_status_requested_at_idx");
        assertContains(sql, "create table trip_status_history");
        assertContains(sql, "create index trip_status_history_trip_changed_idx");
        assertContains(sql, "foreign key (actor_user_id) references users (id)");
        assertContains(sql, "create table payments");
        assertContains(sql, "trip_id bigint primary key");
        assertContains(sql, "create unique index payments_provider_reference_uq");
        assertContains(sql, "constraint payments_paid_state_matches_timestamp check");
        assertContains(sql, "constraint payments_settled_digital_has_provider_reference check");
        assertContains(sql, "provider_reference is not null");
        assertContains(sql, "constraint payments_amount_nonnegative check (amount >= 0)");
        assertContains(sql, "create table ratings");
        assertContains(sql, "unique (trip_id, from_user_id)");
        assertContains(sql, "check (score between 1 and 5)");
        assertContains(sql, "comment on table ratings is");
        assertContains(sql, "trip is completed and from_user_id and to_user_id are the two distinct trip participants");
        assertContains(sql, "create trigger driver_vehicles_set_updated_at");
        assertContains(sql, "create trigger payments_set_updated_at");
        assertContains(sql, "create function set_updated_at()");
        assertContains(sql, "new.updated_at := statement_timestamp()");
        assertContains(sql, "accepted -> picking_up or cancelled");
        assertContains(sql, "picking_up -> in_progress or cancelled");
        assertContains(sql, "in_progress -> completed");

        String onlineStatusSql;
        try (InputStream migrationResource = Thread.currentThread()
                .getContextClassLoader()
                .getResourceAsStream("db/migration/V2__add_driver_online_status.sql")) {
            assertNotNull(migrationResource, "Online status migration should be on the classpath");
            onlineStatusSql = new String(migrationResource.readAllBytes(), StandardCharsets.UTF_8)
                    .toLowerCase()
                    .replaceAll("\\s+", " ");
        }
        assertContains(onlineStatusSql,
                "alter table driver_profiles add column is_online boolean not null default false");

        String adminRoleSql;
        try (InputStream migrationResource = Thread.currentThread()
                .getContextClassLoader()
                .getResourceAsStream("db/migration/V3__add_admin_role.sql")) {
            assertNotNull(migrationResource, "Admin role migration should be on the classpath");
            adminRoleSql = new String(migrationResource.readAllBytes(), StandardCharsets.UTF_8)
                    .toLowerCase()
                    .replaceAll("\\s+", " ");
        }
        assertContains(adminRoleSql, "alter table user_roles drop constraint user_roles_role_valid");
        assertContains(adminRoleSql, "check (role in ('customer', 'driver', 'admin'))");
        assertContains(sql, "validate actor authorization");
    }

    private static void assertContains(String sql, String expected) {
        assertTrue(sql.contains(expected), "Migration should contain: " + expected);
    }
}

package id.rideflow;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FlywayReconciliationTest {

    @Test
    @EnabledIfSystemProperty(named = "rideflow.v4.reconcile.integration", matches = "true")
    void recordsAlreadyMaterializedV4ThroughFlyway() {
        Flyway flyway = configuredFlyway();

        var result = flyway.migrate();
        assertEquals(1, result.migrationsExecuted);
        assertEquals("4", flyway.info().current().getVersion().getVersion());
        flyway.validate();
    }

    @Test
    @EnabledIfSystemProperty(named = "rideflow.v4.repair.integration", matches = "true")
    void repairsChecksumAfterCorrectingTheReconciliationGuard() {
        Flyway flyway = configuredFlyway();
        flyway.repair();
        flyway.validate();
        assertEquals("4", flyway.info().current().getVersion().getVersion());
    }

    @Test
    @EnabledIfSystemProperty(named = "rideflow.v4.validate.integration", matches = "true")
    void validatesAlreadyAppliedV4WithoutRerunningIt() {
        Flyway flyway = configuredFlyway();

        flyway.validate();

        assertEquals("4", flyway.info().current().getVersion().getVersion());
        assertEquals(0, flyway.info().pending().length);
    }

    private static Flyway configuredFlyway() {
        String url = requiredEnvironment("RIDEFLOW_V4_JDBC_URL");
        String username = requiredEnvironment("RIDEFLOW_V4_DB_USERNAME");
        String password = requiredEnvironment("RIDEFLOW_V4_DB_PASSWORD");
        return Flyway.configure()
                .dataSource(url, username, password)
                .locations("filesystem:src/main/resources/db/migration")
                .cleanDisabled(true)
                .load();
    }

    private static String requiredEnvironment(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(name + " is required for this opt-in integration test");
        }
        return value;
    }
}

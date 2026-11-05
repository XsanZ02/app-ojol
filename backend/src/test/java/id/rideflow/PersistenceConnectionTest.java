package id.rideflow;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
@QuarkusTestResource(value = AuthTestResource.class, restrictToAnnotatedClass = true)
@QuarkusTestResource(JwtKeyTestResource.class)
class PersistenceConnectionTest {

    @Inject
    DataSource dataSource;

    @Test
    void connectsToConfiguredPostgresDatabase() throws SQLException {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT current_database(), current_user");
                ResultSet resultSet = statement.executeQuery()) {
            resultSet.next();
            assertEquals("rideflow_auth_test", resultSet.getString(1));
            assertEquals("postgres", resultSet.getString(2));
        }
    }
}

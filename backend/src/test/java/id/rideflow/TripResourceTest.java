package id.rideflow;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
@QuarkusTestResource(value = AuthTestResource.class, restrictToAnnotatedClass = true)
@QuarkusTestResource(JwtKeyTestResource.class)
class TripResourceTest {

    @Inject
    DataSource dataSource;

    @BeforeEach
    void clearDisposableTestData() throws Exception {
        try (Connection connection = dataSource.getConnection();
                var statement = connection.createStatement()) {
            statement.execute("TRUNCATE TABLE ratings, payments, trip_status_history, trips, "
                    + "driver_vehicles, driver_profiles, user_roles, users RESTART IDENTITY CASCADE");
        }
    }

    @Test
    void customerCreatesAndListsOwnTripWithServerCalculatedFare() {
        String customerToken = registerAccount("CUSTOMER");
        Response response = createTrip(customerToken);

        response.then()
                .statusCode(201)
                .body("status", equalTo("PENDING"))
                .body("vehicleType", equalTo("MOTOR"))
                .body("estimatedFare", equalTo(17500.0f))
                .body("id", matchesPattern("\\d+"))
                .body("currencyCode", equalTo("IDR"))
                .body("pickup.address", equalTo("Pickup point"))
                .body("statusHistory", hasSize(1))
                .body("statusHistory[0].status", equalTo("PENDING"))
                .body("statusHistory[0].note", nullValue());

        String tripId = response.jsonPath().getString("id");
        given()
                .auth().oauth2(customerToken)
                .when().get("/trips/me")
                .then()
                .statusCode(200)
                .body("$", hasSize(1))
                .body("[0].id", equalTo(tripId));

        given()
                .auth().oauth2(customerToken)
                .when().get("/trips/" + tripId)
                .then()
                .statusCode(200)
                .body("id", equalTo(tripId))
                .body("status", equalTo("PENDING"))
                .body("pickup.address", equalTo("Pickup point"));
    }

    @Test
    void customerCanCreateOrderWithoutAnyDriverVerification() {
        String customerToken = registerAccount("CUSTOMER");

        createTrip(customerToken)
                .then()
                .statusCode(201)
                .body("status", equalTo("PENDING"));
    }

    @Test
    void invalidPublicStyleAndUnknownTripIdsReturnNotFound() {
        String customerToken = registerAccount("CUSTOMER");

        given()
                .auth().oauth2(customerToken)
                .when().get("/trips/RF-261028-9889")
                .then().statusCode(404);

        given()
                .auth().oauth2(customerToken)
                .when().get("/trips/not-a-trip")
                .then().statusCode(404);

        given()
                .auth().oauth2(customerToken)
                .when().get("/trips/9223372036854775807")
                .then().statusCode(404);
    }

    @Test
    void customerCannotReadOtherCustomersTrip() {
        String ownerToken = registerAccount("CUSTOMER");
        String otherCustomerToken = registerAccount("CUSTOMER");
        String tripId = createTrip(ownerToken).then().statusCode(201).extract().path("id");

        given()
                .auth().oauth2(otherCustomerToken)
                .when().get("/trips/" + tripId)
                .then().statusCode(404);

        given()
                .auth().oauth2(otherCustomerToken)
                .when().get("/trips/me")
                .then().statusCode(200)
                .body("$", hasSize(0));
    }

    @Test
    void availableOrderIsMatchedToEligibleDriverAndAcceptedAtomically() {
        String customerToken = registerAccount("CUSTOMER");
        String driverToken = eligibleDriverToken("MOTOR");
        String tripId = createTrip(customerToken).then().statusCode(201).extract().path("id");

        given()
                .auth().oauth2(driverToken)
                .when().get("/drivers/me/orders")
                .then()
                .statusCode(200)
                .body("id", hasItem(tripId));

        String carDriver = eligibleDriverToken("MOBIL");
        given()
                .auth().oauth2(carDriver)
                .when().get("/drivers/me/orders")
                .then().statusCode(200)
                .body("$", hasSize(0));

        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/accept")
                .then()
                .statusCode(200)
                .body("status", equalTo("ACCEPTED"))
                .body("statusHistory", hasSize(2))
                .body("statusHistory[1].status", equalTo("ACCEPTED"));

        given()
                .auth().oauth2(customerToken)
                .when().get("/trips/" + tripId)
                .then()
                .statusCode(200)
                .body("status", equalTo("ACCEPTED"));
        given()
                .auth().oauth2(driverToken)
                .when().get("/trips/" + tripId)
                .then()
                .statusCode(200);

        String anotherDriver = eligibleDriverToken("MOTOR");
        given()
                .auth().oauth2(anotherDriver)
                .when().get("/trips/" + tripId)
                .then().statusCode(404);
    }

    @Test
    void ineligibleDriverCannotAcceptOrder() {
        String customerToken = registerAccount("CUSTOMER");
        String pendingProfileToken = registerAccount("DRIVER");
        String tripId = createTrip(customerToken).then().statusCode(201).extract().path("id");

        given()
                .auth().oauth2(pendingProfileToken)
                .when().post("/trips/" + tripId + "/accept")
                .then()
                .statusCode(403)
                .body("code", equalTo("driver_not_eligible"));
        assertEquals("requested", tripStatus(Long.parseLong(tripId)));

        String noVehicleToken = registerAccount("DRIVER");
        activateDriver(noVehicleToken);
        given()
                .auth().oauth2(noVehicleToken)
                .when().post("/trips/" + tripId + "/accept")
                .then().statusCode(403);

        String suspendedProfile = eligibleDriverToken("MOTOR");
        executeUpdate("UPDATE driver_profiles SET status = 'suspended' WHERE user_id = ?",
                userIdFromToken(suspendedProfile));
        given()
                .auth().oauth2(suspendedProfile)
                .when().post("/trips/" + tripId + "/accept")
                .then().statusCode(403);

        String suspendedAccount = eligibleDriverToken("MOTOR");
        executeUpdate("UPDATE users SET status = 'suspended' WHERE id = ?",
                userIdFromToken(suspendedAccount));
        given()
                .auth().oauth2(suspendedAccount)
                .when().post("/trips/" + tripId + "/accept")
                .then().statusCode(403);
    }

    @Test
    void driverWithPendingVehicleCannotSeeOrAcceptOrders() {
        String customerToken = registerAccount("CUSTOMER");
        String driverToken = registerAccount("DRIVER");
        activateDriver(driverToken);
        String plate = "T" + UUID.randomUUID().toString().replace("-", "")
                .substring(0, 9).toUpperCase();
        String tripId = createTrip(customerToken).then().statusCode(201).extract().path("id");

        given()
                .auth().oauth2(driverToken)
                .contentType("application/json")
                .body("""
                        {
                          "vehicleType":"MOTOR",
                          "vehiclePlate":"%s",
                          "make":"Honda",
                          "model":"Vario",
                          "color":"Black"
                        }
                        """.formatted(plate))
                .when().post("/drivers/me/vehicles")
                .then()
                .statusCode(201)
                .body("verificationStatus", equalTo("pending"))
                .body("isActive", equalTo(false));

        given()
                .auth().oauth2(driverToken)
                .when().get("/drivers/me/orders")
                .then()
                .statusCode(403)
                .body("code", equalTo("driver_not_eligible"));

        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/accept")
                .then()
                .statusCode(403)
                .body("code", equalTo("driver_not_eligible"));
        assertEquals("requested", tripStatus(Long.parseLong(tripId)));
    }

    @Test
    void offlineDriverCannotSeeOrAcceptOrders() {
        String customerToken = registerAccount("CUSTOMER");
        String driverToken = eligibleDriverToken("MOTOR");
        String tripId = createTrip(customerToken).then().statusCode(201).extract().path("id");

        given()
                .auth().oauth2(driverToken)
                .when().get("/drivers/me/orders")
                .then()
                .statusCode(200)
                .body("$", hasSize(1));

        executeUpdate("UPDATE driver_profiles SET is_online = FALSE WHERE user_id = ?",
                userIdFromToken(driverToken));

        given()
                .auth().oauth2(driverToken)
                .when().get("/drivers/me/orders")
                .then()
                .statusCode(403)
                .body("code", equalTo("driver_not_eligible"));

        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/accept")
                .then()
                .statusCode(403)
                .body("code", equalTo("driver_not_eligible"));
    }

    @Test
    void activeTripCanBeCompletedEvenIfDriverGoesOffline() {
        String customerToken = registerAccount("CUSTOMER");
        String driverToken = eligibleDriverToken("MOTOR");
        String tripId = createTrip(customerToken).then().statusCode(201).extract().path("id");

        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/accept")
                .then().statusCode(200);

        executeUpdate("UPDATE driver_profiles SET is_online = FALSE WHERE user_id = ?",
                userIdFromToken(driverToken));

        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/picking-up")
                .then().statusCode(200);

        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/start")
                .then().statusCode(200);

        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/complete")
                .then()
                .statusCode(200)
                .body("status", equalTo("COMPLETED"));
    }

    @Test
    void twoDriversCannotAcceptTheSameTrip() throws Exception {
        String customerToken = registerAccount("CUSTOMER");
        String firstDriver = eligibleDriverToken("MOTOR");
        String secondDriver = eligibleDriverToken("MOTOR");
        String tripId = createTrip(customerToken).then().statusCode(201).extract().path("id");

        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Integer> firstAttempt = () -> given()
                    .auth().oauth2(firstDriver)
                    .when().post("/trips/" + tripId + "/accept")
                    .statusCode();
            Callable<Integer> secondAttempt = () -> given()
                    .auth().oauth2(secondDriver)
                    .when().post("/trips/" + tripId + "/accept")
                    .statusCode();
            var responses = executor.invokeAll(java.util.List.of(firstAttempt, secondAttempt));
            Set<Integer> statuses = Set.of(responses.get(0).get(), responses.get(1).get());
            assertEquals(Set.of(200, 409), statuses);
        }
        assertEquals(2, historyCount(Long.parseLong(tripId)));
    }

    @Test
    void permitsOnlyValidDriverTransitionsAndWritesHistory() {
        String customerToken = registerAccount("CUSTOMER");
        String driverToken = eligibleDriverToken("MOTOR");
        String tripId = createTrip(customerToken).then().statusCode(201).extract().path("id");

        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/start")
                .then().statusCode(404);

        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/accept")
                .then().statusCode(200);
        given()
                .auth().oauth2(customerToken)
                .contentType("application/json")
                .body("{}")
                .when().post("/trips/" + tripId + "/cancel")
                .then().statusCode(409);
        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/picking-up")
                .then()
                .statusCode(200)
                .body("status", equalTo("PICKING_UP"));
        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/start")
                .then()
                .statusCode(200)
                .body("status", equalTo("IN_PROGRESS"));
        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/complete")
                .then()
                .statusCode(200)
                .body("status", equalTo("COMPLETED"))
                .body("finalFare", equalTo(17500.0f))
                .body("statusHistory", hasSize(5));

        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/complete")
                .then().statusCode(409);
        assertEquals(5, historyCount(Long.parseLong(tripId)));
    }

    @Test
    void cancellationIsAllowedOnlyForRequestedTripsOwnedByCustomer() {
        String customerToken = registerAccount("CUSTOMER");
        String otherCustomerToken = registerAccount("CUSTOMER");
        String tripId = createTrip(customerToken).then().statusCode(201).extract().path("id");

        given()
                .auth().oauth2(otherCustomerToken)
                .contentType("application/json")
                .body("{\"reason\":\"not mine\"}")
                .when().post("/trips/" + tripId + "/cancel")
                .then().statusCode(404);

        given()
                .auth().oauth2(customerToken)
                .contentType("application/json")
                .body("{\"reason\":\"Changed plans\"}")
                .when().post("/trips/" + tripId + "/cancel")
                .then()
                .statusCode(200)
                .body("status", equalTo("CANCELLED"))
                .body("statusHistory", hasSize(2))
                .body("statusHistory[1].note", equalTo("Changed plans"));

        given()
                .auth().oauth2(customerToken)
                .contentType("application/json")
                .body("{}")
                .when().post("/trips/" + tripId + "/cancel")
                .then().statusCode(409);
        assertEquals(2, historyCount(Long.parseLong(tripId)));
    }

    @Test
    void validatesCoordinatesTypeAndCurrencyAndDoesNotTrustClientFare() {
        String customerToken = registerAccount("CUSTOMER");
        given()
                .auth().oauth2(customerToken)
                .contentType("application/json")
                .body("""
                        {
                          "pickupAddress":"A",
                          "pickupLatitude":100,
                          "pickupLongitude":115,
                          "destinationAddress":"B",
                          "destinationLatitude":-8,
                          "destinationLongitude":115,
                          "vehicleType":"TRUCK",
                          "currencyCode":"USD",
                          "estimatedFare":1
                        }
                        """)
                .when().post("/trips")
                .then().statusCode(400);

        given()
                .auth().oauth2(customerToken)
                .contentType("application/json")
                .body("""
                        {
                          "pickupAddress":"A",
                          "pickupLatitude":-8,
                          "pickupLongitude":115,
                          "destinationAddress":"B",
                          "destinationLatitude":-8.1,
                          "destinationLongitude":115.1,
                          "vehicleType":"MOTOR",
                          "currencyCode":"USD"
                        }
                        """)
                .when().post("/trips")
                .then().statusCode(400);

        Response response = createTrip(customerToken, "MOTOR", 1);
        response.then()
                .statusCode(201)
                .body("estimatedFare", not(equalTo(1)));
    }

    @Test
    void statusAndHistoryRollbackTogetherWhenHistoryInsertFails() throws Exception {
        String customerToken = registerAccount("CUSTOMER");
        String driverToken = eligibleDriverToken("MOTOR");
        String tripId = createTrip(customerToken).then().statusCode(201).extract().path("id");
        createFailingHistoryTrigger();
        try {
            given()
                    .auth().oauth2(driverToken)
                    .when().post("/trips/" + tripId + "/accept")
                    .then().statusCode(500);
            assertEquals("requested", tripStatus(Long.parseLong(tripId)));
            assertEquals(1, historyCount(Long.parseLong(tripId)));
        } finally {
            dropFailingHistoryTrigger();
        }
    }

    @Test
    void unauthenticatedAndNonCustomerCannotCreateTrip() {
        given()
                .contentType("application/json")
                .body(createBody("MOTOR", 9000))
                .when().post("/trips")
                .then().statusCode(401);

        given()
                .auth().oauth2(registerAccount("DRIVER"))
                .contentType("application/json")
                .body(createBody("MOTOR", 9000))
                .when().post("/trips")
                .then().statusCode(403);
    }

    private String registerAccount(String role) {
        String email = "trip-api-" + UUID.randomUUID() + "@rideflow.test";
        return given()
                .contentType("application/json")
                .body("""
                        {
                          "name":"Trip API Test",
                          "email":"%s",
                          "password":"Correct-Horse-Battery-42",
                          "role":"%s"
                        }
                        """.formatted(email, role))
                .when().post("/auth/register")
                .then().statusCode(201)
                .extract().path("token");
    }

    private String eligibleDriverToken(String vehicleType) {
        String token = registerAccount("DRIVER");
        long driverId = userIdFromToken(token);
        String dbType = "MOTOR".equals(vehicleType) ? "motorcycle" : "car";
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO driver_vehicles "
                                + "(driver_user_id, vehicle_type, plate_normalized, make, model, color, "
                                + "verification_status, is_active) "
                                + "VALUES (?, ?, ?, 'TestMake', 'TestModel', 'Black', 'pending', FALSE) "
                                + "RETURNING id")) {
            VerificationTestFixtures.approveProfile(connection, driverId, true);
            statement.setLong(1, driverId);
            statement.setString(2, dbType);
            statement.setString(3, "T" + UUID.randomUUID().toString().replace("-", "")
                    .substring(0, 9).toUpperCase());
            long vehicleId;
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw new IllegalStateException("Test vehicle insert did not return an id");
                }
                vehicleId = result.getLong(1);
            }
            VerificationTestFixtures.approveVehicle(connection, vehicleId, driverId, true);
            return token;
        } catch (Exception exception) {
            throw new IllegalStateException("Could not prepare eligible test driver", exception);
        }
    }

    private void activateDriver(String token) {
        long driverId = userIdFromToken(token);
        try (Connection connection = dataSource.getConnection()) {
            VerificationTestFixtures.approveProfile(connection, driverId, true);
        } catch (Exception exception) {
            throw new IllegalStateException("Could not prepare approved test driver", exception);
        }
    }

    private Response createTrip(String token) {
        return createTrip(token, "MOTOR", 999999);
    }

    private Response createTrip(String token, String vehicleType, long fare) {
        return given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body(createBody(vehicleType, fare))
                .when().post("/trips");
    }

    private static String createBody(String vehicleType, long fare) {
        return """
                {
                  "pickupAddress":"Pickup point",
                  "pickupLatitude":-8.6834,
                  "pickupLongitude":115.2289,
                  "destinationAddress":"Destination point",
                  "destinationLatitude":-8.6755,
                  "destinationLongitude":115.2635,
                  "vehicleType":"%s",
                  "currencyCode":"IDR",
                  "estimatedFare":%d
                }
                """.formatted(vehicleType, fare);
    }

    private long userIdFromToken(String token) {
        String email = given()
                .auth().oauth2(token)
                .when().get("/auth/me")
                .then().statusCode(200)
                .extract().path("user.email");
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement("SELECT id FROM users WHERE email = ?")) {
            statement.setString(1, email);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw new IllegalStateException("Test account was not persisted");
                }
                return result.getLong(1);
            }
        } catch (Exception exception) {
            throw new IllegalStateException("Could not load test user id", exception);
        }
    }

    private void executeUpdate(String sql, long userId) {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, userId);
            statement.executeUpdate();
        } catch (Exception exception) {
            throw new IllegalStateException("Could not prepare trip test state", exception);
        }
    }

    private String tripStatus(long tripId) {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement("SELECT status FROM trips WHERE id = ?")) {
            statement.setLong(1, tripId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? result.getString(1) : null;
            }
        } catch (Exception exception) {
            throw new IllegalStateException("Could not inspect test trip", exception);
        }
    }

    private int historyCount(long tripId) {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT count(*) FROM trip_status_history WHERE trip_id = ?")) {
            statement.setLong(1, tripId);
            try (ResultSet result = statement.executeQuery()) {
                result.next();
                return result.getInt(1);
            }
        } catch (Exception exception) {
            throw new IllegalStateException("Could not inspect trip history", exception);
        }
    }

    private void createFailingHistoryTrigger() throws Exception {
        try (Connection connection = dataSource.getConnection();
                var statement = connection.createStatement()) {
            statement.execute("""
                    CREATE FUNCTION fail_accept_history_insert() RETURNS trigger
                    LANGUAGE plpgsql AS $$
                    BEGIN
                      IF NEW.new_status = 'accepted' THEN
                        RAISE EXCEPTION 'test-only history failure';
                      END IF;
                      RETURN NEW;
                    END;
                    $$;
                    """);
            statement.execute("""
                    CREATE TRIGGER fail_accept_history_insert
                    BEFORE INSERT ON trip_status_history
                    FOR EACH ROW EXECUTE FUNCTION fail_accept_history_insert()
                    """);
        }
    }

    private void dropFailingHistoryTrigger() throws Exception {
        try (Connection connection = dataSource.getConnection();
                var statement = connection.createStatement()) {
            statement.execute("DROP TRIGGER IF EXISTS fail_accept_history_insert ON trip_status_history");
            statement.execute("DROP FUNCTION IF EXISTS fail_accept_history_insert()");
        }
    }
}

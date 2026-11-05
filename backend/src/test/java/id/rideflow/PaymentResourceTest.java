package id.rideflow;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
@QuarkusTestResource(value = AuthTestResource.class, restrictToAnnotatedClass = true)
@QuarkusTestResource(JwtKeyTestResource.class)
class PaymentResourceTest {

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
    void ownerCanCreateAndReadPaymentUsingCompletedTripFare() {
        CompletedTrip trip = completedTrip();

        given()
                .auth().oauth2(trip.customerToken())
                .contentType("application/json")
                .body("""
                        {"method":"digital","amount":0,"currencyCode":"USD","status":"succeeded",
                         "provider":"untrusted","providerReference":"forged"}
                        """)
                .when().post(paymentPath(trip.tripId()))
                .then()
                .statusCode(201)
                .body("tripId", equalTo(trip.tripId()))
                .body("method", equalTo("digital"))
                .body("status", equalTo("pending"))
                .body("amount", equalTo(17500.0f))
                .body("currencyCode", equalTo("IDR"))
                .body("paidAt", org.hamcrest.Matchers.nullValue())
                .body("$", not(hasKey("providerReference")));

        given()
                .auth().oauth2(trip.customerToken())
                .when().get(paymentPath(trip.tripId()))
                .then()
                .statusCode(200)
                .body("amount", equalTo(17500.0f))
                .body("currencyCode", equalTo("IDR"))
                .body("status", equalTo("pending"));
    }

    @Test
    void nonOwnerCannotReadOrCreatePaymentAndIncompleteTripCannotBePaid() {
        String customerToken = registerAccount("CUSTOMER");
        String otherCustomerToken = registerAccount("CUSTOMER");
        String requestedTripId = createTrip(customerToken);
        CompletedTrip completedTrip = completedTrip();

        given().auth().oauth2(customerToken).when().get(paymentPath(completedTrip.tripId()))
                .then().statusCode(404);
        given().auth().oauth2(customerToken).contentType("application/json").body("{\"method\":\"cash\"}")
                .when().post(paymentPath(completedTrip.tripId())).then().statusCode(404);
        given().auth().oauth2(completedTrip.customerToken()).contentType("application/json")
                .body("{\"method\":\"cash\"}").when().post(paymentPath(requestedTripId))
                .then().statusCode(404);
        given().auth().oauth2(otherCustomerToken).when().get(paymentPath(completedTrip.tripId()))
                .then().statusCode(404);
        given().auth().oauth2(otherCustomerToken).contentType("application/json")
                .body("{\"method\":\"cash\"}").when().post(paymentPath(completedTrip.tripId()))
                .then().statusCode(404);
    }

    @Test
    void sameMethodRetryIsIdempotentAndDifferentMethodConflicts() {
        CompletedTrip trip = completedTrip();
        String path = paymentPath(trip.tripId());

        given().auth().oauth2(trip.customerToken()).contentType("application/json")
                .body("{\"method\":\"cash\"}").when().post(path).then().statusCode(201);
        given().auth().oauth2(trip.customerToken()).contentType("application/json")
                .body("{\"method\":\"cash\"}").when().post(path)
                .then().statusCode(200).body("status", equalTo("pending"));
        given().auth().oauth2(trip.customerToken()).contentType("application/json")
                .body("{\"method\":\"digital\"}").when().post(path)
                .then().statusCode(409);

        assertEquals(1, paymentCount(Long.parseLong(trip.tripId())));
    }

    @Test
    void concurrentSameMethodRequestsCreateOnlyOnePayment() throws Exception {
        CompletedTrip trip = completedTrip();
        Callable<Integer> request = () -> given()
                .auth().oauth2(trip.customerToken())
                .contentType("application/json")
                .body("{\"method\":\"digital\"}")
                .when().post(paymentPath(trip.tripId()))
                .statusCode();

        try (var executor = Executors.newFixedThreadPool(2)) {
            List<Integer> statuses = executor.invokeAll(List.of(request, request)).stream()
                    .map(future -> {
                        try {
                            return future.get();
                        } catch (Exception exception) {
                            throw new IllegalStateException("Concurrent payment request failed", exception);
                        }
                    }).toList();
            assertEquals(Set.of(200, 201), Set.copyOf(statuses));
        }
        assertEquals(1, paymentCount(Long.parseLong(trip.tripId())));
    }

    @Test
    void cashRequiresAssignedDriverAcknowledgementAndDigitalCannotBeSettledByCustomer() {
        CompletedTrip trip = completedTrip();
        given().auth().oauth2(trip.customerToken()).contentType("application/json")
                .body("{\"method\":\"cash\",\"status\":\"succeeded\"}")
                .when().post(paymentPath(trip.tripId())).then()
                .statusCode(201).body("status", equalTo("pending"));

        given().auth().oauth2(trip.customerToken()).when()
                .post(paymentPath(trip.tripId()) + "/cash/confirm")
                .then().statusCode(403);
        given().auth().oauth2(eligibleDriverToken()).when()
                .post(paymentPath(trip.tripId()) + "/cash/confirm")
                .then().statusCode(404);
        given().auth().oauth2(trip.driverToken()).when()
                .post(paymentPath(trip.tripId()) + "/cash/confirm")
                .then().statusCode(200)
                .body("status", equalTo("succeeded"))
                .body("paidAt", org.hamcrest.Matchers.notNullValue());
        given().auth().oauth2(trip.driverToken()).when()
                .post(paymentPath(trip.tripId()) + "/cash/confirm")
                .then().statusCode(200).body("status", equalTo("succeeded"));

        CompletedTrip digitalTrip = completedTrip();
        given().auth().oauth2(digitalTrip.customerToken()).contentType("application/json")
                .body("{\"method\":\"digital\",\"status\":\"succeeded\",\"paidAt\":\"2026-01-01T00:00:00Z\"}")
                .when().post(paymentPath(digitalTrip.tripId())).then()
                .statusCode(201).body("status", equalTo("pending"));
        given().auth().oauth2(digitalTrip.driverToken()).when()
                .post(paymentPath(digitalTrip.tripId()) + "/cash/confirm")
                .then().statusCode(404);
    }

    @Test
    void databaseFailureRollsBackPaymentInsert() throws Exception {
        CompletedTrip trip = completedTrip();
        createFailingPaymentTrigger();
        try {
            given().auth().oauth2(trip.customerToken()).contentType("application/json")
                    .body("{\"method\":\"digital\"}")
                    .when().post(paymentPath(trip.tripId())).then().statusCode(500);
            assertEquals(0, paymentCount(Long.parseLong(trip.tripId())));
        } finally {
            dropFailingPaymentTrigger();
        }
    }

    @Test
    void paymentRequiresAuthenticationAndValidMethod() {
        given().contentType("application/json").body("{\"method\":\"cash\"}")
                .when().post(paymentPath("1")).then().statusCode(401);
        given().when().get(paymentPath("1")).then().statusCode(401);

        String token = registerAccount("CUSTOMER");
        given().auth().oauth2(token).contentType("application/json")
                .body("{\"method\":\"bitcoin\"}").when().post(paymentPath("1"))
                .then().statusCode(400);
    }

    private CompletedTrip completedTrip() {
        String customerToken = registerAccount("CUSTOMER");
        String driverToken = eligibleDriverToken();
        String tripId = createTrip(customerToken);

        given().auth().oauth2(driverToken).when().post("/trips/" + tripId + "/accept")
                .then().statusCode(200);
        given().auth().oauth2(driverToken).when().post("/trips/" + tripId + "/picking-up")
                .then().statusCode(200);
        given().auth().oauth2(driverToken).when().post("/trips/" + tripId + "/start")
                .then().statusCode(200);
        given().auth().oauth2(driverToken).when().post("/trips/" + tripId + "/complete")
                .then().statusCode(200).body("status", equalTo("COMPLETED"));
        return new CompletedTrip(customerToken, driverToken, tripId);
    }

    private String registerAccount(String role) {
        String email = "payment-api-" + UUID.randomUUID() + "@rideflow.test";
        return given().contentType("application/json")
                .body("""
                        {"name":"Payment API Test","email":"%s",
                         "password":"Correct-Horse-Battery-42","role":"%s"}
                        """.formatted(email, role))
                .when().post("/auth/register").then().statusCode(201).extract().path("token");
    }

    private String eligibleDriverToken() {
        String token = registerAccount("DRIVER");
        long driverId = userIdFromToken(token);
        try (Connection connection = dataSource.getConnection()) {
            VerificationTestFixtures.approveProfile(connection, driverId, true);
            long vehicleId;
            try (PreparedStatement vehicle = connection.prepareStatement(
                        "INSERT INTO driver_vehicles "
                                + "(driver_user_id, vehicle_type, plate_normalized, make, model, color, "
                                + "verification_status, is_active) "
                                + "VALUES (?, 'motorcycle', ?, 'TestMake', 'TestModel', 'Black', 'pending', FALSE) "
                                + "RETURNING id")) {
                vehicle.setLong(1, driverId);
                vehicle.setString(2, "P" + UUID.randomUUID().toString().replace("-", "")
                        .substring(0, 9).toUpperCase());
                try (ResultSet result = vehicle.executeQuery()) {
                    if (!result.next()) {
                        throw new IllegalStateException("Test vehicle insert did not return an id");
                    }
                    vehicleId = result.getLong(1);
                }
            }
            VerificationTestFixtures.approveVehicle(connection, vehicleId, driverId, true);
            return token;
        } catch (Exception exception) {
            throw new IllegalStateException("Could not prepare eligible payment test driver", exception);
        }
    }

    private String createTrip(String token) {
        return given().auth().oauth2(token).contentType("application/json")
                .body("""
                        {"pickupAddress":"Pickup point","pickupLatitude":-8.6834,"pickupLongitude":115.2289,
                         "destinationAddress":"Destination point","destinationLatitude":-8.6755,
                         "destinationLongitude":115.2635,"vehicleType":"MOTOR","currencyCode":"IDR"}
                        """)
                .when().post("/trips").then().statusCode(201).extract().path("id");
    }

    private String paymentPath(String tripId) {
        return "/trips/" + tripId + "/payment";
    }

    private long userIdFromToken(String token) {
        String email = given().auth().oauth2(token).when().get("/auth/me")
                .then().statusCode(200).extract().path("user.email");
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
            throw new IllegalStateException("Could not load payment test user", exception);
        }
    }

    private int paymentCount(long tripId) {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT count(*) FROM payments WHERE trip_id = ?")) {
            statement.setLong(1, tripId);
            try (ResultSet result = statement.executeQuery()) {
                result.next();
                return result.getInt(1);
            }
        } catch (Exception exception) {
            throw new IllegalStateException("Could not inspect payment test data", exception);
        }
    }

    private void createFailingPaymentTrigger() throws Exception {
        try (Connection connection = dataSource.getConnection();
                var statement = connection.createStatement()) {
            statement.execute("""
                    CREATE FUNCTION payment_test_reject_insert() RETURNS TRIGGER AS $$
                    BEGIN
                        RAISE EXCEPTION 'intentional payment test failure';
                    END;
                    $$ LANGUAGE plpgsql
                    """);
            statement.execute("""
                    CREATE TRIGGER payment_test_reject_insert
                    BEFORE INSERT ON payments FOR EACH ROW
                    EXECUTE FUNCTION payment_test_reject_insert()
                    """);
        }
    }

    private void dropFailingPaymentTrigger() throws Exception {
        try (Connection connection = dataSource.getConnection();
                var statement = connection.createStatement()) {
            statement.execute("DROP TRIGGER IF EXISTS payment_test_reject_insert ON payments");
            statement.execute("DROP FUNCTION IF EXISTS payment_test_reject_insert()");
        }
    }

    private record CompletedTrip(String customerToken, String driverToken, String tripId) {
    }
}

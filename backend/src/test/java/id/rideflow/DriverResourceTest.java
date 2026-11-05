
package id.rideflow;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

@QuarkusTest
@QuarkusTestResource(value = AuthTestResource.class, restrictToAnnotatedClass = true)
@QuarkusTestResource(JwtKeyTestResource.class)
class DriverResourceTest {

    @Inject
    DataSource dataSource;

    @Test
    void driverCanCreateAndListOwnPendingVehicle() {
        String token = activeDriverToken();
        String plate = uniquePlate();

        given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body(vehicleBody(plate, ""))
                .when().post("/drivers/me/vehicles")
                .then()
                .statusCode(201)
                .body("vehicleType", equalTo("MOTOR"))
                .body("vehiclePlate", equalTo(plate))
                .body("verificationStatus", equalTo("pending"))
                .body("isActive", equalTo(false))
                .body("id", not(nullValue()));

        given()
                .auth().oauth2(token)
                .when().get("/drivers/me/vehicles")
                .then()
                .statusCode(200)
                .body("vehicles", hasSize(1))
                .body("vehicles[0].vehiclePlate", equalTo(plate))
                .body("vehicles[0].verificationStatus", equalTo("pending"));
    }

    @Test
    void createsMissingDriverProfileAsPending() throws Exception {
        String token = registerAccount("DRIVER");
        long userId = userIdFromToken(token);
        executeUpdate("DELETE FROM driver_profiles WHERE user_id = ?", userId);

        given()
                .auth().oauth2(token)
                .when().post("/drivers/me/profile")
                .then()
                .statusCode(201)
                .body("userId", equalTo(Long.toString(userId)))
                .body("status", equalTo("pending"));

        given()
                .auth().oauth2(token)
                .when().get("/drivers/me/profile")
                .then()
                .statusCode(200)
                .body("status", equalTo("pending"));

        given()
                .auth().oauth2(token)
                .when().post("/drivers/me/profile")
                .then()
                .statusCode(200)
                .body("status", equalTo("pending"));
    }

    @Test
    void driverCanUpdatePersonalProfileAndVerifySession() {
        String token = activeDriverToken();

        given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body("""
                        {
                          "name": "Budi Driver Baru",
                          "phone": "081234567890"
                        }
                        """)
                .when().put("/drivers/me/profile")
                .then()
                .statusCode(200)
                .body("name", equalTo("Budi Driver Baru"))
                .body("phone", equalTo("+6281234567890"));

        given()
                .auth().oauth2(token)
                .when().get("/auth/me")
                .then()
                .statusCode(200)
                .body("user.name", equalTo("Budi Driver Baru"))
                .body("user.phone", equalTo("+6281234567890"));
    }

    @Test
    void driverProfileUpdateRejectsInvalidInputsAndDuplicates() {
        String driver1 = activeDriverToken();
        String driver2 = activeDriverToken();

        given()
                .auth().oauth2(driver1)
                .contentType("application/json")
                .body("""
                        {
                          "name": "Driver Satu",
                          "phone": "089876543210"
                        }
                        """)
                .when().put("/drivers/me/profile")
                .then().statusCode(200);

        given()
                .auth().oauth2(driver2)
                .contentType("application/json")
                .body("""
                        {
                          "name": "Driver Dua",
                          "phone": "089876543210"
                        }
                        """)
                .when().put("/drivers/me/profile")
                .then()
                .statusCode(409)
                .body("code", equalTo("profile_conflict"));

        given()
                .auth().oauth2(driver2)
                .contentType("application/json")
                .body("""
                        {
                          "name": "Driver Dua",
                          "phone": "invalid-phone"
                        }
                        """)
                .when().put("/drivers/me/profile")
                .then()
                .statusCode(400)
                .body("code", equalTo("invalid_profile"));

        given()
                .auth().oauth2(driver2)
                .contentType("application/json")
                .body("""
                        {
                          "name": "   ",
                          "phone": "08111222333"
                        }
                        """)
                .when().put("/drivers/me/profile")
                .then().statusCode(400);

        String customerToken = registerAccount("CUSTOMER");
        given()
                .auth().oauth2(customerToken)
                .contentType("application/json")
                .body("""
                        {
                          "name": "Customer Fake",
                          "phone": "08111222444"
                        }
                        """)
                .when().put("/drivers/me/profile")
                .then()
                .statusCode(403)
                .body("code", equalTo("driver_access_denied"));
    }

    @Test
    void rejectsCustomersAndUnauthenticatedRequests() {
        given()
                .when().get("/drivers/me/vehicles")
                .then().statusCode(401);

        String customerToken = registerAccount("CUSTOMER");

        given()
                .auth().oauth2(customerToken)
                .when().get("/drivers/me/profile")
                .then()
                .statusCode(403)
                .body("code", equalTo("driver_access_denied"));
    }

    @Test
    void rejectsSuspendedAccountsAndDriverProfiles() throws Exception {
        String suspendedAccountToken = activeDriverToken();

        executeUpdate(
                "UPDATE users SET status = 'suspended' WHERE id = ?",
                userIdFromToken(suspendedAccountToken));

        given()
                .auth().oauth2(suspendedAccountToken)
                .when().get("/drivers/me/vehicles")
                .then().statusCode(403);

        String suspendedProfileToken = activeDriverToken();

        executeUpdate(
                "UPDATE driver_profiles SET status = 'suspended' WHERE user_id = ?",
                userIdFromToken(suspendedProfileToken));

        given()
                .auth().oauth2(suspendedProfileToken)
                .when().get("/drivers/me/vehicles")
                .then().statusCode(403);
    }

    @Test
    void duplicatePlateReturnsGenericConflict() {
        String firstDriver = activeDriverToken();
        String secondDriver = activeDriverToken();
        String plate = uniquePlate();

        given()
                .auth().oauth2(firstDriver)
                .contentType("application/json")
                .body(vehicleBody(plate, ""))
                .when().post("/drivers/me/vehicles")
                .then().statusCode(201);

        given()
                .auth().oauth2(secondDriver)
                .contentType("application/json")
                .body(vehicleBody(plate.toLowerCase(java.util.Locale.ROOT), ""))
                .when().post("/drivers/me/vehicles")
                .then()
                .statusCode(409)
                .body("message", equalTo("Vehicle could not be registered"))
                .body("message", not(org.hamcrest.Matchers.containsString(plate)));
    }

    @Test
    void rejectsInvalidVehicleTypeAndPlate() {
        String token = activeDriverToken();

        given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body("""
                        {
                          "vehicleType": "BICYCLE",
                          "vehiclePlate": "DK 1234 AB",
                          "make": "Honda",
                          "model": "Vario",
                          "color": "Black"
                        }
                        """)
                .when().post("/drivers/me/vehicles")
                .then()
                .statusCode(400)
                .body("code", equalTo("invalid_vehicle"));

        given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body("""
                        {
                          "vehicleType": "MOTOR",
                          "vehiclePlate": "DK 12!",
                          "make": "Honda",
                          "model": "Vario",
                          "color": "Black"
                        }
                        """)
                .when().post("/drivers/me/vehicles")
                .then()
                .statusCode(400)
                .body("code", equalTo("invalid_vehicle"));
    }

    @Test
    void pendingVehicleCannotBeActivatedOrSelfVerified() {
        String token = activeDriverToken();
        String plate = uniquePlate();

        Response created = given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body(vehicleBody(plate, """
                          ,"verificationStatus":"verified",
                          "isActive":true
                        """))
                .when().post("/drivers/me/vehicles");

        created.then()
                .statusCode(201)
                .body("verificationStatus", equalTo("pending"))
                .body("isActive", equalTo(false));

        String vehicleId = created.jsonPath().getString("id");

        given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body("{\"isActive\":true}")
                .when().patch("/drivers/me/vehicles/" + vehicleId + "/active")
                .then()
                .statusCode(409)
                .body("code", equalTo("vehicle_not_verified"));

        assertEquals("pending", vehicleStatus(Long.parseLong(vehicleId)));
    }

    @Test
    void vehicleChangesAreRestrictedToItsOwner() {
        String ownerToken = activeDriverToken();
        String otherDriverToken = activeDriverToken();
        String plate = uniquePlate();

        Response created = given()
                .auth().oauth2(ownerToken)
                .contentType("application/json")
                .body(vehicleBody(plate, ""))
                .when().post("/drivers/me/vehicles");

        created.then().statusCode(201);

        String vehicleId = created.jsonPath().getString("id");

        given()
                .auth().oauth2(otherDriverToken)
                .when().get("/drivers/me/vehicles")
                .then()
                .statusCode(200)
                .body("vehicles", hasSize(0));

        given()
                .auth().oauth2(otherDriverToken)
                .contentType("application/json")
                .body(vehicleBody(uniquePlate(), ""))
                .when().put("/drivers/me/vehicles/" + vehicleId)
                .then().statusCode(404);

        given()
                .auth().oauth2(otherDriverToken)
                .contentType("application/json")
                .body("{\"isActive\":false}")
                .when().patch("/drivers/me/vehicles/" + vehicleId + "/active")
                .then().statusCode(404);
    }

    @Test
    void verifiedVehicleCanBeActivatedAndPendingDataCanBeEdited() throws Exception {
        String token = activeDriverToken();
        String plate = uniquePlate();

        Response created = given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body(vehicleBody(plate, ""))
                .when().post("/drivers/me/vehicles");

        created.then().statusCode(201);

        String vehicleId = created.jsonPath().getString("id");

        given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body(vehicleBody(uniquePlate(), ""))
                .when().put("/drivers/me/vehicles/" + vehicleId)
                .then()
                .statusCode(200)
                .body("verificationStatus", equalTo("pending"))
                .body("isActive", equalTo(false));

        try (Connection connection = dataSource.getConnection()) {
            VerificationTestFixtures.approveVehicle(
                    connection,
                    Long.parseLong(vehicleId),
                    userIdFromToken(token),
                    false);
        } catch (Exception exception) {
            throw new IllegalStateException("Could not prepare verified test vehicle", exception);
        }

        given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body("{\"isActive\":true}")
                .when().patch("/drivers/me/vehicles/" + vehicleId + "/active")
                .then()
                .statusCode(200)
                .body("verificationStatus", equalTo("verified"))
                .body("isActive", equalTo(true));
    }

    @Test
    void onlineStatusRequiresActiveVerifiedVehicleAndIsBoundToAuthenticatedDriver()
            throws Exception {
        String token = activeDriverToken();
        long driverId = userIdFromToken(token);
        String customerToken = registerAccount("CUSTOMER");
        String pendingDriverToken = registerAccount("DRIVER");

        insertVerifiedActiveVehicle(userIdFromToken(pendingDriverToken));

        given()
                .auth().oauth2(pendingDriverToken)
                .contentType("application/json")
                .body("{\"isOnline\":true}")
                .when().put("/drivers/me/status")
                .then()
                .statusCode(403)
                .body("code", equalTo("driver_not_eligible"));

        given()
                .when().get("/drivers/me/status")
                .then().statusCode(401);

        given()
                .auth().oauth2(token)
                .when().get("/drivers/me/status")
                .then()
                .statusCode(200)
                .body("isOnline", equalTo(false));

        given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body("{\"isOnline\":true}")
                .when().put("/drivers/me/status")
                .then()
                .statusCode(403)
                .body("code", equalTo("driver_not_eligible"));

        Response vehicle = given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body(vehicleBody(uniquePlate(), ""))
                .when().post("/drivers/me/vehicles");

        vehicle.then().statusCode(201);

        try (Connection connection = dataSource.getConnection()) {
            VerificationTestFixtures.approveProfile(connection, driverId, true);
            VerificationTestFixtures.approveVehicle(
                    connection,
                    Long.parseLong(vehicle.jsonPath().getString("id")),
                    driverId,
                    true);
        } catch (Exception exception) {
            throw new IllegalStateException("Could not prepare eligible test driver", exception);
        }

        given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body("{\"isOnline\":true}")
                .when().put("/drivers/me/status")
                .then()
                .statusCode(200)
                .body("isOnline", equalTo(true));

        given()
                .auth().oauth2(registerAccount("DRIVER"))
                .contentType("application/json")
                .body("{\"isOnline\":false}")
                .when().put("/drivers/me/status")
                .then()
                .statusCode(200)
                .body("isOnline", equalTo(false));

        assertEquals(true, onlineStatus(driverId));

        given()
                .auth().oauth2(customerToken)
                .contentType("application/json")
                .body("{\"isOnline\":false}")
                .when().put("/drivers/me/status")
                .then()
                .statusCode(403)
                .body("code", equalTo("driver_access_denied"));

        given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body("{\"isOnline\":false}")
                .when().put("/drivers/me/status")
                .then()
                .statusCode(200)
                .body("isOnline", equalTo(false));

        assertEquals(false, onlineStatus(driverId));
    }

    @Test
    void driverStatisticsUseCompletedTripsAndRatingsForTheAuthenticatedDriver()
            throws Exception {
        String driverToken = activeDriverToken();
        long driverId = userIdFromToken(driverToken);
        String customerToken = registerAccount("CUSTOMER");
        long riderId = userIdFromToken(customerToken);
        long vehicleId = insertVerifiedActiveVehicle(driverId);

        Response emptyStatistics = given()
                .auth().oauth2(driverToken)
                .when().get("/drivers/me/statistics")
                .then().statusCode(200)
                .extract().response();

        assertEquals(0.0, emptyStatistics.jsonPath().getDouble("todayEarnings"), 0.001);
        assertEquals(0L, emptyStatistics.jsonPath().getLong("todayTrips"));
        assertEquals(0L, emptyStatistics.jsonPath().getLong("completedTrips"));
        assertNull(emptyStatistics.jsonPath().get("rating"));
        assertEquals(0L, emptyStatistics.jsonPath().getLong("totalRatingsCount"));

        long firstTripId = insertCompletedTrip(riderId, driverId, vehicleId, 12000);
        long secondTripId = insertCompletedTrip(riderId, driverId, vehicleId, 15000);

        insertRating(firstTripId, riderId, driverId, 4);
        insertRating(secondTripId, riderId, driverId, 5);

        given()
                .auth().oauth2(driverToken)
                .when().get("/drivers/me/trips")
                .then()
                .statusCode(200)
                .body("$", hasSize(2));

        given()
                .auth().oauth2(driverToken)
                .when().get("/drivers/me/trips/active")
                .then().statusCode(204);

        Response statistics = given()
                .auth().oauth2(driverToken)
                .when().get("/drivers/me/statistics")
                .then().statusCode(200)
                .extract().response();

        assertEquals(27000.0, statistics.jsonPath().getDouble("todayEarnings"), 0.001);
        assertEquals(2L, statistics.jsonPath().getLong("todayTrips"));
        assertEquals(2L, statistics.jsonPath().getLong("completedTrips"));
        assertEquals(4.5, statistics.jsonPath().getDouble("rating"), 0.001);
        assertEquals(2L, statistics.jsonPath().getLong("totalRatingsCount"));

        Response otherDriverStatistics = given()
                .auth().oauth2(activeDriverToken())
                .when().get("/drivers/me/statistics")
                .then().statusCode(200)
                .extract().response();

        assertEquals(0.0, otherDriverStatistics.jsonPath().getDouble("todayEarnings"), 0.001);
        assertEquals(0L, otherDriverStatistics.jsonPath().getLong("completedTrips"));
        assertNull(otherDriverStatistics.jsonPath().get("rating"));
        assertEquals(0L, otherDriverStatistics.jsonPath().getLong("totalRatingsCount"));

        given()
                .auth().oauth2(customerToken)
                .when().get("/drivers/me/statistics")
                .then()
                .statusCode(403)
                .body("code", equalTo("driver_access_denied"));
    }

    @Test
    void activeTripEndpointOnlyReturnsTheAuthenticatedDriversTrip() {
        String driverToken = activeDriverToken();
        long driverId = userIdFromToken(driverToken);
        String customerToken = registerAccount("CUSTOMER");
        long riderId = userIdFromToken(customerToken);
        long vehicleId = insertVerifiedActiveVehicle(driverId);
        long tripId = insertActiveTrip(riderId, driverId, vehicleId);

        given()
                .auth().oauth2(driverToken)
                .when().get("/drivers/me/trips/active")
                .then()
                .statusCode(200)
                .body("id", equalTo(Long.toString(tripId)))
                .body("status", equalTo("ACCEPTED"));

        given()
                .auth().oauth2(registerAccount("DRIVER"))
                .when().get("/drivers/me/trips/active")
                .then().statusCode(204);
    }

    private String activeDriverToken() {
        String token = registerAccount("DRIVER");

        executeUpdate(
                "UPDATE driver_profiles SET status = 'active' WHERE user_id = ?",
                userIdFromToken(token));

        return token;
    }

    private String registerAccount(String role) {
        String email = "driver-api-" + UUID.randomUUID() + "@rideflow.test";

        return given()
                .contentType("application/json")
                .body("""
                        {
                          "name": "Driver API Test",
                          "email": "%s",
                          "password": "Correct-Horse-Battery-42",
                          "role": "%s"
                        }
                        """.formatted(email, role))
                .when().post("/auth/register")
                .then()
                .statusCode(201)
                .extract().path("token");
    }

    private long insertVerifiedActiveVehicle(long driverId) {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO driver_vehicles "
                                + "(driver_user_id, vehicle_type, plate_normalized, make, model, color, "
                                + "verification_status, is_active) "
                                + "VALUES (?, 'motorcycle', ?, 'TestMake', 'TestModel', 'Black', "
                                + "'pending', FALSE) RETURNING id")) {
            statement.setLong(1, driverId);
            statement.setString(2, uniquePlate());

            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw new IllegalStateException(
                            "Test vehicle insert did not return an id");
                }
                long vehicleId = result.getLong(1);
                VerificationTestFixtures.approveVehicle(connection, vehicleId, driverId, true);
                return vehicleId;
            }
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Could not prepare driver statistics vehicle", exception);
        }
    }

    private long insertCompletedTrip(long riderId, long driverId, long vehicleId, long fare) {
        OffsetDateTime requestedAt = LocalDate.now(ZoneId.of("Asia/Makassar"))
                .atTime(12, 0)
                .atZone(ZoneId.of("Asia/Makassar"))
                .toOffsetDateTime();

        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO trips (rider_user_id, driver_user_id, vehicle_id, vehicle_type, "
                                + "pickup_address, pickup_latitude, pickup_longitude, dropoff_address, "
                                + "dropoff_latitude, dropoff_longitude, status, estimated_fare, final_fare, "
                                + "currency_code, requested_at, accepted_at, started_at, completed_at) "
                                + "VALUES (?, ?, ?, 'motorcycle', 'Pickup', -8.65, 115.21, 'Dropoff', "
                                + "-8.66, 115.22, 'completed', ?, ?, 'IDR', ?, ?, ?, ?) RETURNING id")) {
            statement.setLong(1, riderId);
            statement.setLong(2, driverId);
            statement.setLong(3, vehicleId);
            statement.setBigDecimal(4, BigDecimal.valueOf(fare));
            statement.setBigDecimal(5, BigDecimal.valueOf(fare));
            statement.setObject(6, requestedAt);
            statement.setObject(7, requestedAt.plusMinutes(1));
            statement.setObject(8, requestedAt.plusMinutes(2));
            statement.setObject(9, requestedAt.plusMinutes(3));

            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw new IllegalStateException(
                            "Test trip insert did not return an id");
                }
                return result.getLong(1);
            }
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Could not prepare completed driver test trip", exception);
        }
    }

    private long insertActiveTrip(long riderId, long driverId, long vehicleId) {
        OffsetDateTime requestedAt = LocalDate.now(ZoneId.of("Asia/Makassar"))
                .atTime(12, 0)
                .atZone(ZoneId.of("Asia/Makassar"))
                .toOffsetDateTime();

        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO trips (rider_user_id, driver_user_id, vehicle_id, vehicle_type, "
                                + "pickup_address, pickup_latitude, pickup_longitude, dropoff_address, "
                                + "dropoff_latitude, dropoff_longitude, status, estimated_fare, currency_code, "
                                + "requested_at, accepted_at) "
                                + "VALUES (?, ?, ?, 'motorcycle', 'Pickup', -8.65, 115.21, 'Dropoff', "
                                + "-8.66, 115.22, 'accepted', 12000, 'IDR', ?, ?) RETURNING id")) {
            statement.setLong(1, riderId);
            statement.setLong(2, driverId);
            statement.setLong(3, vehicleId);
            statement.setObject(4, requestedAt);
            statement.setObject(5, requestedAt.plusMinutes(1));

            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw new IllegalStateException(
                            "Test active trip insert did not return an id");
                }
                return result.getLong(1);
            }
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Could not prepare active driver test trip", exception);
        }
    }

    private void insertRating(long tripId, long riderId, long driverId, int score) {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO ratings (trip_id, from_user_id, to_user_id, score) "
                                + "VALUES (?, ?, ?, ?)")) {
            statement.setLong(1, tripId);
            statement.setLong(2, riderId);
            statement.setLong(3, driverId);
            statement.setInt(4, score);
            statement.executeUpdate();
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Could not prepare driver test rating", exception);
        }
    }

    private boolean onlineStatus(long driverId) {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT is_online FROM driver_profiles WHERE user_id = ?")) {
            statement.setLong(1, driverId);

            try (ResultSet result = statement.executeQuery()) {
                return result.next() && result.getBoolean(1);
            }
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Could not inspect driver online state", exception);
        }
    }

    private static String vehicleBody(String plate, String extraProperties) {
        return """
                {
                  "vehicleType": "MOTOR",
                  "vehiclePlate": "%s",
                  "make": "Honda",
                  "model": "Vario 160",
                  "color": "Black"%s
                }
                """.formatted(plate, extraProperties);
    }

    private static String uniquePlate() {
        return "D" + UUID.randomUUID()
                .toString()
                .replace("-", "")
                .substring(0, 9)
                .toUpperCase();
    }

    private long userIdFromToken(String token) {
        String email = given()
                .auth().oauth2(token)
                .when().get("/auth/me")
                .then()
                .statusCode(200)
                .extract().path("user.email");

        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT id FROM users WHERE email = ?")) {
            statement.setString(1, email);

            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw new IllegalStateException(
                            "Test account was not persisted");
                }
                return result.getLong(1);
            }
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Could not load test user id", exception);
        }
    }

    private void executeUpdate(String sql, long value) {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, value);
            statement.executeUpdate();
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Could not prepare driver test state", exception);
        }
    }

    private String vehicleStatus(long vehicleId) {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT verification_status FROM driver_vehicles WHERE id = ?")) {
            statement.setLong(1, vehicleId);

            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? result.getString(1) : null;
            }
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Could not inspect test vehicle state", exception);
        }
    }
}

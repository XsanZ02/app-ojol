package id.rideflow;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Base64;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
@TestProfile(DriverVerificationFlowTest.VerificationEnabledProfile.class)
@QuarkusTestResource(value = AuthTestResource.class, restrictToAnnotatedClass = true)
@QuarkusTestResource(JwtKeyTestResource.class)
class DriverVerificationFlowTest {

    private static final byte[] PNG = {
            (byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a
    };
    private static final Path STORAGE = Path.of("target/test-driver-documents").toAbsolutePath();

    @Inject
    DataSource dataSource;

    private final Set<String> filesBefore = new HashSet<>();

    @Test
    void verifiesDriverDocumentsAndRunsOrderLifecycle() throws Exception {
        filesBefore.addAll(storageFiles());
        String driverToken = registerAccount("DRIVER");
        long driverId = userIdFromToken(driverToken);
        String customerToken = registerAccount("CUSTOMER");
        String adminToken = promoteToAdmin(registerAccount("CUSTOMER"));

        given()
                .auth().oauth2(driverToken)
                .contentType("application/json")
                .body("{\"isOnline\":true}")
                .when().put("/drivers/me/status")
                .then().statusCode(403).body("code", equalTo("driver_not_eligible"));

        String vehicleId = given()
                .auth().oauth2(driverToken)
                .contentType("application/json")
                .body("""
                        {
                          "vehicleType":"MOTOR",
                          "vehiclePlate":"T%s",
                          "make":"Honda",
                          "model":"Vario",
                          "color":"Black"
                        }
                        """.formatted(UUID.randomUUID().toString().replace("-", "")
                        .substring(0, 9).toUpperCase()))
                .when().post("/drivers/me/vehicles")
                .then().statusCode(201)
                .extract().path("id");

        String ktpV1 = uploadDocument(driverToken, "ktp", null, "ktp-v1.png");
        String sim = uploadDocument(driverToken, "sim", null, "sim.png");
        String stnk = uploadDocument(driverToken, "stnk", vehicleId, "stnk.png");
        String vehiclePhoto = uploadDocument(driverToken, "vehicle_photo", vehicleId, "vehicle.png");

        given()
                .auth().oauth2(driverToken)
                .when().get("/drivers/me/documents")
                .then().statusCode(200).body("$", hasSize(4));
        given()
                .auth().oauth2(driverToken)
                .when().get("/admin/verifications")
                .then().statusCode(403);
        given()
                .auth().oauth2(adminToken)
                .when().get("/admin/verifications")
                .then().statusCode(200)
                .body("documents", hasSize(4))
                .body("profiles", hasSize(1))
                .body("vehicles", hasSize(1));

        given()
                .auth().oauth2(adminToken)
                .when().get("/admin/verifications/drivers/" + driverId)
                .then().statusCode(200)
                .body("profile.verificationStatus", equalTo("pending"))
                .body("documents", hasSize(4));
        byte[] retrieved = given()
                .auth().oauth2(adminToken)
                .when().get("/admin/verifications/documents/" + ktpV1 + "/file")
                .then().statusCode(200)
                .contentType("image/png")
                .extract().asByteArray();
        assertArrayEquals(PNG, retrieved);

        given()
                .auth().oauth2(adminToken)
                .contentType("application/json")
                .body(Map.of("decision", "rejected"))
                .when().post("/admin/verifications/documents/" + ktpV1 + "/decision")
                .then().statusCode(400)
                .body("code", equalTo("rejection_reason_required"));
        given()
                .auth().oauth2(adminToken)
                .contentType("application/json")
                .body(Map.of("decision", "rejected", "reason", "Foto KTP buram"))
                .when().post("/admin/verifications/documents/" + ktpV1 + "/decision")
                .then().statusCode(200)
                .body("status", equalTo("rejected"))
                .body("rejectionReason", equalTo("Foto KTP buram"))
                .body("reviewerId", notNullValue())
                .body("reviewedAt", notNullValue());

        String ktpV2 = uploadDocument(driverToken, "ktp", null, "ktp-v2.png");
        assertEquals("2", given()
                .auth().oauth2(driverToken)
                .when().get("/drivers/me/documents")
                .then().statusCode(200)
                .extract().path("find { it.id == '" + ktpV2 + "' }.version").toString());

        for (String documentId : new String[] { ktpV2, sim, stnk, vehiclePhoto }) {
            given()
                    .auth().oauth2(adminToken)
                    .contentType("application/json")
                    .body(Map.of("decision", "approved"))
                    .when().post("/admin/verifications/documents/" + documentId + "/decision")
                    .then().statusCode(200)
                    .body("status", equalTo("verified"))
                    .body("reviewerId", notNullValue())
                    .body("reviewedAt", notNullValue());
        }

        given()
                .auth().oauth2(adminToken)
                .contentType("application/json")
                .body(Map.of("decision", "approved"))
                .when().post("/admin/verifications/profiles/" + driverId + "/decision")
                .then().statusCode(200)
                .body("verificationStatus", equalTo("approved"))
                .body("operationalStatus", equalTo("active"));

        given()
                .auth().oauth2(adminToken)
                .contentType("application/json")
                .body(Map.of("decision", "rejected", "reason", "Nomor plat tidak sesuai"))
                .when().post("/admin/verifications/vehicles/" + vehicleId + "/decision")
                .then().statusCode(200)
                .body("verificationStatus", equalTo("rejected"))
                .body("rejectionReason", equalTo("Nomor plat tidak sesuai"));

        given()
                .auth().oauth2(driverToken)
                .when().get("/drivers/me/vehicles")
                .then().statusCode(200)
                .body("vehicles[0].rejectionReason", equalTo("Nomor plat tidak sesuai"));

        String revisedPlate = "T" + UUID.randomUUID().toString().replace("-", "")
                .substring(0, 9).toUpperCase();
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
                        """.formatted(revisedPlate))
                .when().put("/drivers/me/vehicles/" + vehicleId)
                .then().statusCode(200)
                .body("verificationStatus", equalTo("pending"))
                .body("rejectionReason", org.hamcrest.Matchers.nullValue())
                .body("isActive", equalTo(false));

        given()
                .auth().oauth2(driverToken)
                .contentType("application/json")
                .body("{\"isOnline\":true}")
                .when().put("/drivers/me/status")
                .then().statusCode(403).body("code", equalTo("driver_not_eligible"));

        given()
                .auth().oauth2(adminToken)
                .contentType("application/json")
                .body(Map.of("decision", "approved"))
                .when().post("/admin/verifications/vehicles/" + vehicleId + "/decision")
                .then().statusCode(200)
                .body("verificationStatus", equalTo("verified"));

        given()
                .auth().oauth2(driverToken)
                .contentType("application/json")
                .body("{\"isActive\":true}")
                .when().patch("/drivers/me/vehicles/" + vehicleId + "/active")
                .then().statusCode(200).body("isActive", equalTo(true));
        given()
                .auth().oauth2(driverToken)
                .contentType("application/json")
                .body("{\"isOnline\":true}")
                .when().put("/drivers/me/status")
                .then().statusCode(200).body("isOnline", equalTo(true));

        String tripId = given()
                .auth().oauth2(customerToken)
                .contentType("application/json")
                .body("""
                        {
                          "pickupAddress":"Pickup point",
                          "pickupLatitude":-8.6834,
                          "pickupLongitude":115.2289,
                          "destinationAddress":"Destination point",
                          "destinationLatitude":-8.6755,
                          "destinationLongitude":115.2635,
                          "vehicleType":"MOTOR",
                          "currencyCode":"IDR"
                        }
                        """)
                .when().post("/trips")
                .then().statusCode(201)
                .extract().path("id");

        given()
                .auth().oauth2(driverToken)
                .when().get("/drivers/me/orders")
                .then().statusCode(200).body("id", org.hamcrest.Matchers.hasItem(tripId));
        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/accept")
                .then().statusCode(200).body("status", equalTo("ACCEPTED"));
        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/picking-up")
                .then().statusCode(200).body("status", equalTo("PICKING_UP"));
        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/start")
                .then().statusCode(200).body("status", equalTo("IN_PROGRESS"));
        given()
                .auth().oauth2(driverToken)
                .when().post("/trips/" + tripId + "/complete")
                .then().statusCode(200).body("status", equalTo("COMPLETED"));
        given()
                .auth().oauth2(customerToken)
                .when().get("/trips/" + tripId)
                .then().statusCode(200).body("status", equalTo("COMPLETED"));

        Response detail = given()
                .auth().oauth2(adminToken)
                .when().get("/admin/verifications/drivers/" + driverId)
                .then().statusCode(200)
                .body("history", hasSize(8))
                .extract().response();
        assertTrue(detail.jsonPath().getList("history.rejectionReason").contains("Foto KTP buram"));
    }

    @AfterEach
    void removeTestDocuments() throws Exception {
        if (Files.exists(STORAGE)) {
            for (String filename : storageFiles()) {
                if (!filesBefore.contains(filename)) {
                    Files.deleteIfExists(STORAGE.resolve(filename));
                }
            }
        }
    }

    private String uploadDocument(String token, String type, String vehicleId, String filename) {
        var body = new java.util.HashMap<String, Object>();
        body.put("documentType", type);
        body.put("filename", filename);
        body.put("mimeType", "image/png");
        body.put("contentBase64", Base64.getEncoder().encodeToString(PNG));
        if (vehicleId != null) {
            body.put("vehicleId", vehicleId);
        }
        return given()
                .auth().oauth2(token)
                .contentType("application/json")
                .body(body)
                .when().post("/drivers/me/documents")
                .then().statusCode(201)
                .extract().path("id");
    }

    private String registerAccount(String role) {
        String email = "verification-" + UUID.randomUUID() + "@rideflow.test";
        return given()
                .contentType("application/json")
                .body("""
                        {
                          "name":"Verification Test",
                          "email":"%s",
                          "password":"Correct-Horse-Battery-42",
                          "role":"%s"
                        }
                        """.formatted(email, role))
                .when().post("/auth/register")
                .then().statusCode(201)
                .extract().path("token");
    }

    private String promoteToAdmin(String token) throws Exception {
        long userId = userIdFromToken(token);
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO user_roles (user_id, role) VALUES (?, 'admin')")) {
            statement.setLong(1, userId);
            statement.executeUpdate();
        }
        return given()
                .auth().oauth2(token)
                .when().get("/auth/me")
                .then().statusCode(200)
                .extract().path("token");
    }

    private long userIdFromToken(String token) throws Exception {
        String email = given().auth().oauth2(token).when().get("/auth/me")
                .then().statusCode(200).extract().path("user.email");
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement("SELECT id FROM users WHERE email = ?")) {
            statement.setString(1, email);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw new IllegalStateException("Test account was not persisted");
                }
                return result.getLong("id");
            }
        }
    }

    private static Set<String> storageFiles() throws Exception {
        if (!Files.exists(STORAGE)) {
            return Set.of();
        }
        try (var files = Files.list(STORAGE)) {
            return files.map(file -> file.getFileName().toString())
                    .collect(java.util.stream.Collectors.toSet());
        }
    }

    public static class VerificationEnabledProfile implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "rideflow.driver-verification.v4-enabled", "true",
                    "rideflow.documents.storage-path", "target/test-driver-documents");
        }
    }
}

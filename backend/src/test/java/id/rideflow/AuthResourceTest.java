package id.rideflow;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.elytron.security.common.BcryptUtil;
import io.restassured.response.Response;
import io.smallrye.jwt.build.Jwt;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Set;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
@QuarkusTestResource(value = AuthTestResource.class, restrictToAnnotatedClass = true)
@QuarkusTestResource(JwtKeyTestResource.class)
class AuthResourceTest {

    @Inject
    DataSource dataSource;

    @Test
    void registersAndAuthenticatesCustomer() {
        String email = uniqueEmail();
        Response registration = register(email, "CUSTOMER", "0812-3456-7890");

        registration.then()
                .statusCode(201)
                .body("user.email", equalTo(email))
                .body("user.phone", equalTo("+6281234567890"))
                .body("user.role", equalTo("CUSTOMER"))
                .body("user.roles", hasItems("CUSTOMER"))
                .body("token", not(nullValue()))
                .body(not(containsString("password_hash")))
                .body(not(containsString("Correct-Horse-Battery-42")));

        String token = registration.jsonPath().getString("token");
        given()
                .auth().oauth2(token)
                .when().get("/auth/me")
                .then()
                .statusCode(200)
                .body("user.email", equalTo(email))
                .body("user.roles", hasItems("CUSTOMER"))
                .body("token", equalTo(token));

        String passwordHash = passwordHashFor(email);
        assertNotNull(passwordHash);
        assertNotEquals("Correct-Horse-Battery-42", passwordHash);
        org.junit.jupiter.api.Assertions.assertTrue(
                BcryptUtil.matches("Correct-Horse-Battery-42", passwordHash));
    }

    @Test
    void supportsBothRolesButLeavesDriverProfilePending() throws Exception {
        String email = uniqueEmail();
        Response response = given()
                .contentType("application/json")
                .body("""
                        {
                          "name": "Dual Role User",
                          "email": "%s",
                          "password": "Correct-Horse-Battery-42",
                          "roles": ["CUSTOMER", "DRIVER"]
                        }
                        """.formatted(email))
                .when().post("/auth/register");

        response.then()
                .statusCode(201)
                .body("user.roles", hasItems("CUSTOMER", "DRIVER"))
                .body("user.role", equalTo("DRIVER"));
        assertEquals("pending", driverProfileStatus(email));
    }

    @Test
    void loginMapsCustomerDriverAndAdminRoles() throws Exception {
        String customerEmail = uniqueEmail();
        register(customerEmail, "CUSTOMER").then().statusCode(201);
        assertLoginRole(customerEmail, "CUSTOMER", "customer");

        String driverEmail = uniqueEmail();
        register(driverEmail, "DRIVER").then().statusCode(201);
        assertLoginRole(driverEmail, "DRIVER", "driver");

        String adminEmail = uniqueEmail();
        register(adminEmail, "CUSTOMER").then().statusCode(201);
        setRoles(adminEmail, "admin");
        assertLoginRole(adminEmail, "ADMIN", "admin");
    }

    @Test
    void adminRoleTakesPrecedenceOverCustomerAndDriver() throws Exception {
        String customerAdminEmail = uniqueEmail();
        register(customerAdminEmail, "CUSTOMER").then().statusCode(201);
        setRoles(customerAdminEmail, "customer", "admin");
        assertLoginRole(customerAdminEmail, "ADMIN", "customer", "admin");

        String driverAdminEmail = uniqueEmail();
        register(driverAdminEmail, "CUSTOMER").then().statusCode(201);
        setRoles(driverAdminEmail, "driver", "admin");
        assertLoginRole(driverAdminEmail, "ADMIN", "driver", "admin");
    }

    @Test
    void currentSessionUsesLatestDatabaseRolesAndRefreshesJwtGroups() throws Exception {
        String email = uniqueEmail();
        String originalToken = register(email, "CUSTOMER")
                .then().statusCode(201)
                .extract().path("token");
        setRoles(email, "customer", "admin");

        Response refreshed = given()
                .auth().oauth2(originalToken)
                .when().get("/auth/me");

        refreshed.then()
                .statusCode(200)
                .body("user.role", equalTo("ADMIN"))
                .body("user.roles", hasItems("CUSTOMER", "ADMIN"));
        String refreshedToken = refreshed.jsonPath().getString("token");
        assertNotEquals(originalToken, refreshedToken);
        assertTokenGroups(refreshedToken, "customer", "admin");

        given()
                .auth().oauth2(refreshedToken)
                .when().get("/auth/me")
                .then()
                .statusCode(200)
                .body("user.role", equalTo("ADMIN"))
                .body("token", equalTo(refreshedToken));
    }

    @Test
    void adminEndpointRequiresAdminAndDoesNotBreakCustomerOrDriverEndpoints() throws Exception {
        given()
                .when().get("/admin/access")
                .then().statusCode(401);

        String customerEmail = uniqueEmail();
        String customerToken = register(customerEmail, "CUSTOMER")
                .then().statusCode(201)
                .extract().path("token");
        given()
                .auth().oauth2(customerToken)
                .when().get("/admin/access")
                .then().statusCode(403);
        given()
                .auth().oauth2(customerToken)
                .when().get("/trips/me")
                .then().statusCode(200);

        String driverEmail = uniqueEmail();
        String driverToken = register(driverEmail, "DRIVER")
                .then().statusCode(201)
                .extract().path("token");
        given()
                .auth().oauth2(driverToken)
                .when().get("/admin/access")
                .then().statusCode(403);
        given()
                .auth().oauth2(driverToken)
                .when().get("/drivers/me/profile")
                .then().statusCode(200);

        String adminSubject = "admin-test-subject";
        String adminToken = Jwt.issuer("rideflow")
                .audience("rideflow-api")
                .subject(adminSubject)
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300))
                .groups(Set.of("admin"))
                .claim("jti", UUID.randomUUID().toString())
                .sign();
        given()
                .auth().oauth2(adminToken)
                .when().get("/admin/access")
                .then()
                .statusCode(200)
                .body("authorized", equalTo(true))
                .body("subject", equalTo(adminSubject));
    }

    @Test
    void adminUsersEndpointIsReadOnlyRoleProtectedAndSearchable() throws Exception {
        given()
                .when().get("/admin/users")
                .then().statusCode(401);

        String customerEmail = uniqueEmail();
        String customerToken = register(customerEmail, "CUSTOMER")
                .then().statusCode(201)
                .extract().path("token");
        given()
                .auth().oauth2(customerToken)
                .when().get("/admin/users")
                .then().statusCode(403);

        String driverEmail = uniqueEmail();
        String driverToken = register(driverEmail, "DRIVER")
                .then().statusCode(201)
                .extract().path("token");
        given()
                .auth().oauth2(driverToken)
                .when().get("/admin/users")
                .then().statusCode(403);

        String adminEmail = uniqueEmail();
        register(adminEmail, "CUSTOMER").then().statusCode(201);
        setRoles(adminEmail, "admin");
        String adminToken = given()
                .contentType("application/json")
                .body("""
                        {
                          "email": "%s",
                          "password": "Correct-Horse-Battery-42"
                        }
                        """.formatted(adminEmail))
                .when().post("/auth/login")
                .then().statusCode(200)
                .extract().path("token");

        given()
                .auth().oauth2(adminToken)
                .queryParam("search", adminEmail)
                .when().get("/admin/users")
                .then()
                .statusCode(200)
                .body("total", equalTo(1))
                .body("page", equalTo(1))
                .body("size", equalTo(20))
                .body("users[0].email", equalTo(adminEmail))
                .body("users[0].name", equalTo("RideFlow Test User"))
                .body("users[0].roles", hasItems("ADMIN"))
                .body("users[0].createdAt", not(nullValue()))
                .body(not(containsString("password")))
                .body(not(containsString("token")));

        given()
                .auth().oauth2(adminToken)
                .queryParam("search", "no-user-matches-this-query")
                .when().get("/admin/users")
                .then()
                .statusCode(200)
                .body("total", equalTo(0))
                .body("users.size()", equalTo(0));
    }

    @Test
    void rejectsInvalidRegistrationInput() {
        given()
                .contentType("application/json")
                .body("""
                        {
                          "name": "Invalid",
                          "email": "not-an-email",
                          "password": "short",
                          "role": "ADMIN"
                        }
                        """)
                .when().post("/auth/register")
                .then().statusCode(400);

        given()
                        .contentType("application/json")
                        .body("""
                                {
                                  "name": "Invalid",
                                  "email": "valid@example.test",
                                  "password": "Correct-Horse-Battery-42",
                                  "roles": ["CUSTOMER", "ADMIN"]
                                }
                                """)
                        .when().post("/auth/register")
                        .then().statusCode(400);

        given()
                .contentType("application/json")
                .body("""
                        {
                          "name": "Invalid",
                          "email": "valid@example.test",
                          "password": "Correct-Horse-Battery-42",
                          "role": "ADMIN"
                        }
                        """)
                .when().post("/auth/register")
                .then().statusCode(400);
    }

    @Test
    void duplicateEmailHasGenericConflictResponse() {
        String email = uniqueEmail();
        register(email, "CUSTOMER").then().statusCode(201);

        given()
                .contentType("application/json")
                .body(registrationBody(email.toUpperCase(java.util.Locale.ROOT), "CUSTOMER"))
                .when().post("/auth/register")
                .then()
                .statusCode(409)
                .body("message", equalTo("Registration could not be completed"))
                .body("message", not(org.hamcrest.Matchers.containsString(email)));
    }

    @Test
    void loginSucceedsAndUsesGenericFailureForInvalidCredentials() {
        String email = uniqueEmail();
        register(email, "CUSTOMER").then().statusCode(201);

        given()
                .contentType("application/json")
                .body("""
                        {
                          "email": "%s",
                          "password": "Correct-Horse-Battery-42",
                          "rememberMe": true
                        }
                        """.formatted(email))
                .when().post("/auth/login")
                .then()
                .statusCode(200)
                .body("user.email", equalTo(email))
                .body("token", not(nullValue()))
                .body(not(containsString("password_hash")))
                .body(not(containsString("Correct-Horse-Battery-42")));

        given()
                .contentType("application/json")
                .body("""
                        {"email":"%s","password":"wrong-password"}
                        """.formatted(email))
                .when().post("/auth/login")
                .then()
                .statusCode(401)
                .body("message", equalTo("Email or password is invalid"));

        given()
                .contentType("application/json")
                .body("""
                        {"email":"%s","password":"wrong-password"}
                        """.formatted(uniqueEmail()))
                .when().post("/auth/login")
                .then()
                .statusCode(401)
                .body("message", equalTo("Email or password is invalid"));
    }

    @Test
    void rejectsMissingInvalidAndExpiredBearerTokens() {
        given().when().get("/auth/me").then().statusCode(401);

        String email = uniqueEmail();
        String validToken = register(email, "CUSTOMER").jsonPath().getString("token");
        String[] tokenParts = validToken.split("\\.");
        char replacement = tokenParts[2].charAt(0) == 'A' ? 'B' : 'A';
        tokenParts[2] = replacement + tokenParts[2].substring(1);
        String tamperedToken = String.join(".", tokenParts);
        given()
                .auth().oauth2(tamperedToken)
                .when().get("/auth/me")
                .then().statusCode(401);

        String expiredToken = Jwt.issuer("rideflow")
                .audience("rideflow-api")
                .subject("1")
                .issuedAt(Instant.now().minusSeconds(120))
                .expiresAt(Instant.now().minusSeconds(60))
                .claim("jti", UUID.randomUUID().toString())
                .sign();
        given()
                .auth().oauth2(expiredToken)
                .when().get("/auth/me")
                .then().statusCode(401);
    }

    @Test
    void rejectsTokensWithIncorrectIssuerOrAudience() {
        String email = uniqueEmail();
        String accountId = userIdFromSession(register(email, "CUSTOMER"));
        String wrongIssuerToken = Jwt.issuer("unexpected-issuer")
                .audience("rideflow-api")
                .subject(accountId)
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300))
                .sign();
        given()
                .auth().oauth2(wrongIssuerToken)
                .when().get("/auth/me")
                .then().statusCode(401);

        String wrongAudienceToken = Jwt.issuer("rideflow")
                .audience("unexpected-api")
                .subject(accountId)
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300))
                .sign();
        given()
                .auth().oauth2(wrongAudienceToken)
                .when().get("/auth/me")
                .then().statusCode(401);
    }

    @Test
    void rejectsSessionAfterAccountIsSuspendedInDatabase() throws Exception {
        String email = uniqueEmail();
        Response registration = register(email, "CUSTOMER");
        registration.then().statusCode(201);
        String token = registration.jsonPath().getString("token");
        long accountId = Long.parseLong(userIdFor(email));
        setAccountStatus(accountId, "suspended");

        given()
                .auth().oauth2(token)
                .when().get("/auth/me")
                .then().statusCode(401);
    }

    @Test
    void identityRolesComeFromDatabaseRatherThanJwtRoleClaims() {
        String email = uniqueEmail();
        String token = register(email, "CUSTOMER").jsonPath().getString("token");
        var accountId = userIdFor(email);
        String tokenWithAlteredRoles = Jwt.issuer("rideflow")
                .audience("rideflow-api")
                .subject(accountId)
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300))
                .groups(Set.of("driver"))
                .claim("jti", UUID.randomUUID().toString())
                .sign();

        given()
                .auth().oauth2(tokenWithAlteredRoles)
                .when().get("/auth/me")
                .then()
                .statusCode(200)
                .body("user.role", equalTo("CUSTOMER"))
                .body("user.roles", hasItems("CUSTOMER"));
        assertNotNull(token);
    }

    private static Response register(String email, String role) {
        return given()
                .contentType("application/json")
                .body(registrationBody(email, role))
                .when().post("/auth/register");
    }

    private static Response register(String email, String role, String phone) {
        return given()
                .contentType("application/json")
                .body("""
                        {
                          "name": "RideFlow Test User",
                          "email": "%s",
                          "password": "Correct-Horse-Battery-42",
                          "phone": "%s",
                          "role": "%s"
                        }
                        """.formatted(email, phone, role))
                .when().post("/auth/register");
    }

    private void assertLoginRole(String email, String expectedRole, String... expectedDatabaseRoles) {
        Response login = given()
                .contentType("application/json")
                .body("""
                        {
                          "email": "%s",
                          "password": "Correct-Horse-Battery-42"
                        }
                        """.formatted(email))
                .when().post("/auth/login");

        login.then()
                .statusCode(200)
                .body("user.role", equalTo(expectedRole))
                .body("user.roles", hasItems(
                        java.util.Arrays.stream(expectedDatabaseRoles)
                                .map(role -> role.toUpperCase(java.util.Locale.ROOT))
                                .toArray(String[]::new)));
        assertTokenGroups(login.jsonPath().getString("token"), expectedDatabaseRoles);
    }

    private static void assertTokenGroups(String token, String... expectedRoles) {
        String[] parts = token.split("\\.");
        String claims = new String(
                Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
        for (String role : expectedRoles) {
            assertTrue(claims.contains("\"" + role + "\""),
                    "JWT groups must contain database role " + role);
        }
    }

    private void setRoles(String email, String... roles) throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            long userId;
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT id FROM users WHERE email = ?")) {
                statement.setString(1, email);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw new IllegalStateException("Test account was not persisted");
                    }
                    userId = result.getLong(1);
                }
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "DELETE FROM user_roles WHERE user_id = ?")) {
                statement.setLong(1, userId);
                statement.executeUpdate();
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO user_roles (user_id, role) VALUES (?, ?)")) {
                for (String role : roles) {
                    statement.setLong(1, userId);
                    statement.setString(2, role);
                    statement.addBatch();
                }
                statement.executeBatch();
            }
        }
    }

    private static String registrationBody(String email, String role) {
        return """
                {
                  "name": "RideFlow Test User",
                  "email": "%s",
                  "password": "Correct-Horse-Battery-42",
                  "role": "%s"
                }
                """.formatted(email, role);
    }

    private static String uniqueEmail() {
        return "auth-" + UUID.randomUUID() + "@rideflow.test";
    }

    private static String userIdFromSession(Response registration) {
        registration.then().statusCode(201);
        return registration.jsonPath().getString("user.id");
    }

    private void setAccountStatus(long userId, String status) throws Exception {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "UPDATE users SET status = ? WHERE id = ?")) {
            statement.setString(1, status);
            statement.setLong(2, userId);
            assertEquals(1, statement.executeUpdate());
        }
    }

    private String passwordHashFor(String email) {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT password_hash FROM users WHERE email = ?")) {
            statement.setString(1, email);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? result.getString(1) : null;
            }
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private String driverProfileStatus(String email) throws Exception {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT dp.status FROM driver_profiles dp "
                                + "JOIN users u ON u.id = dp.user_id WHERE u.email = ?")) {
            statement.setString(1, email);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? result.getString(1) : null;
            }
        }
    }

    private String userIdFor(String email) {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT id FROM users WHERE email = ?")) {
            statement.setString(1, email);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw new IllegalStateException("Test account was not persisted");
                }
                return Long.toString(result.getLong(1));
            }
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}

package id.rideflow.service;

import io.quarkus.elytron.security.common.BcryptUtil;
import io.smallrye.jwt.build.Jwt;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import id.rideflow.dto.AuthRequests;
import id.rideflow.dto.AuthResponses;

@ApplicationScoped
public class AuthService {

    private static final Pattern E164 = Pattern.compile("^\\+[1-9][0-9]{0,14}$");
    private static final Pattern EMAIL_FORMAT = Pattern.compile("^[^\\s@]+@[^\\s@]+$");
    private static final Set<String> ALLOWED_ROLES = Set.of("customer", "driver");

    @Inject
    DataSource dataSource;

    @ConfigProperty(name = "mp.jwt.verify.issuer")
    String issuer;

    @ConfigProperty(name = "mp.jwt.verify.audiences")
    String audience;

    @ConfigProperty(name = "rideflow.jwt.ttl-seconds")
    long tokenTtlSeconds;

    @Transactional
    public AuthResponses.Session register(AuthRequests.Register request) {
        if (request.password().getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72) {
            throw invalidRegistration();
        }
        String name = request.name().trim();
        String email = normalizeEmail(request.email());
        List<String> roles = resolveRoles(request);
        String phone = normalizePhone(request.phone());
        String passwordHash = BcryptUtil.bcryptHash(request.password());

        try (Connection connection = dataSource.getConnection()) {
            long userId;
            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO users (full_name, email, phone_e164, password_hash) "
                            + "VALUES (?, ?, ?, ?) RETURNING id")) {
                statement.setString(1, name);
                statement.setString(2, email);
                statement.setString(3, phone);
                statement.setString(4, passwordHash);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw new IllegalStateException("Account insert did not return an id");
                    }
                    userId = result.getLong(1);
                }
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

            if (roles.contains("driver")) {
                try (PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO driver_profiles (user_id, status) VALUES (?, 'pending')")) {
                    statement.setLong(1, userId);
                    statement.executeUpdate();
                }
            }

            return createSession(connection, userId);
        } catch (SQLException exception) {
            if ("23505".equals(exception.getSQLState())) {
                throw error(Response.Status.CONFLICT, "Registration could not be completed", "registration_conflict");
            }
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public AuthResponses.Session login(AuthRequests.Login request) {
        String email = normalizeEmail(request.email());
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT id, password_hash, status FROM users WHERE lower(email) = ?")) {
            statement.setString(1, email);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()
                        || !"active".equals(result.getString("status"))
                        || !BcryptUtil.matches(request.password(), result.getString("password_hash"))) {
                    throw invalidCredentials();
                }
                return createSession(connection, result.getLong("id"));
            }
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public AuthResponses.Session currentSession(
            String subject, String rawToken, Set<String> tokenRoles) {
        long userId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            AuthResponses.Session session = createSession(connection, userId, rawToken, tokenRoles);
            if (session == null) {
                throw invalidCredentials();
            }
            return session;
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    private AuthResponses.Session createSession(Connection connection, long userId) throws SQLException {
        return createSession(connection, userId, null, null);
    }

    private AuthResponses.Session createSession(
            Connection connection,
            long userId,
            String existingToken,
            Set<String> existingTokenRoles) throws SQLException {
        String name;
        String email;
        String phone;
        String status;
        OffsetDateTime createdAt;
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT full_name, email, phone_e164, status, created_at "
                        + "FROM users WHERE id = ?")) {
            statement.setLong(1, userId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next() || !"active".equals(result.getString("status"))) {
                    return null;
                }
                name = result.getString("full_name");
                email = result.getString("email");
                phone = result.getString("phone_e164");
                status = result.getString("status");
                createdAt = result.getObject("created_at", OffsetDateTime.class);
            }
        }

        List<String> roles = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT role FROM user_roles WHERE user_id = ? ORDER BY role")) {
            statement.setLong(1, userId);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    roles.add(result.getString(1));
                }
            }
        }
        if (roles.isEmpty()) {
            throw new IllegalStateException("Active account has no assigned role");
        }

        String token = existingToken != null
                && existingTokenRoles != null
                && Set.copyOf(roles).equals(existingTokenRoles)
                        ? existingToken
                        : issueToken(userId, email, roles);
        String frontendRole;
        if (roles.contains("admin")) {
            frontendRole = "ADMIN";
        } else if (roles.contains("driver")) {
            frontendRole = "DRIVER";
        } else if (roles.contains("customer")) {
            frontendRole = "CUSTOMER";
        } else {
            throw new IllegalStateException("Active account has no supported role");
        }
        var user = new AuthResponses.User(
                Long.toString(userId),
                name,
                email,
                frontendRole,
                roles.stream().map(role -> role.toUpperCase(Locale.ROOT)).toList(),
                phone,
                createdAt.toInstant().toString());
        return new AuthResponses.Session(user, token);
    }

    private String issueToken(long userId, String email, List<String> roles) {
        Instant issuedAt = Instant.now();
        return Jwt.issuer(issuer)
                .audience(audience)
                .subject(Long.toString(userId))
                .issuedAt(issuedAt)
                .expiresAt(issuedAt.plusSeconds(tokenTtlSeconds))
                .claim("jti", UUID.randomUUID().toString())
                .claim("email", email)
                .groups(Set.copyOf(roles))
                .sign();
    }

    private static List<String> resolveRoles(AuthRequests.Register request) {
        if ((request.role() == null) == (request.roles() == null)) {
            throw invalidRegistration();
        }
        List<String> providedRoles = request.roles() == null
                ? List.of(request.role())
                : request.roles();
        if (providedRoles.isEmpty() || providedRoles.size() > ALLOWED_ROLES.size()) {
            throw invalidRegistration();
        }
        List<String> roles = providedRoles.stream()
                .map(role -> role == null ? "" : role.trim().toLowerCase(Locale.ROOT))
                .distinct()
                .toList();
        if (roles.size() != providedRoles.size() || !ALLOWED_ROLES.containsAll(roles)) {
            throw invalidRegistration();
        }
        return roles;
    }

    private static String normalizeEmail(String email) {
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() > 320 || !EMAIL_FORMAT.matcher(normalized).matches()) {
            throw invalidRegistration();
        }
        return normalized;
    }

    private static String normalizePhone(String phone) {
        if (phone == null || phone.isBlank()) {
            return null;
        }
        String normalized = phone.trim().replaceAll("[\\s()\\-]", "");
        if (normalized.startsWith("00")) {
            normalized = "+" + normalized.substring(2);
        } else if (normalized.startsWith("0")) {
            normalized = "+62" + normalized.substring(1);
        } else if (normalized.startsWith("62")) {
            normalized = "+" + normalized;
        }
        if (!E164.matcher(normalized).matches()) {
            throw invalidRegistration();
        }
        return normalized;
    }

    private static long parseSubject(String subject) {
        try {
            long id = Long.parseLong(subject);
            if (id <= 0) {
                throw new NumberFormatException("Subject must be positive");
            }
            return id;
        } catch (NumberFormatException exception) {
            throw invalidCredentials();
        }
    }

    private static WebApplicationException invalidCredentials() {
        return error(Response.Status.UNAUTHORIZED, "Email or password is invalid", "invalid_credentials");
    }

    private static WebApplicationException invalidRegistration() {
        return error(Response.Status.BAD_REQUEST, "Registration data is invalid", "invalid_registration");
    }

    private static WebApplicationException error(Response.Status status, String message, String code) {
        return new WebApplicationException(
                Response.status(status).entity(new AuthResponses.Error(message, code)).build());
    }

    private static IllegalStateException databaseFailure(SQLException exception) {
        return new IllegalStateException("Authentication persistence operation failed", exception);
    }
}

package id.rideflow.service;

import id.rideflow.dto.DriverRequests;
import id.rideflow.dto.DriverResponses;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

@ApplicationScoped
public class DriverService {

    private static final Pattern NORMALIZED_PLATE = Pattern.compile("^[A-Z0-9]{4,16}$");
    private static final Pattern E164_PHONE = Pattern.compile("^\\+[1-9][0-9]{0,14}$");
    private static final Logger LOG = Logger.getLogger(DriverService.class);

    @Inject
    DataSource dataSource;

    @Inject
    DriverEligibilityService driverEligibilityService;

    @Transactional
    public ProfileResult getOrCreateProfile(String subject) {
        long userId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            requireActiveDriverAccount(connection, userId);
            DriverResponses.Profile profile = findProfile(connection, userId);
            if (profile != null) {
                requireProfileNotSuspended(profile);
                return new ProfileResult(profile, false);
            }

            int inserted;
            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO driver_profiles (user_id, status) VALUES (?, 'pending') "
                            + "ON CONFLICT (user_id) DO NOTHING")) {
                statement.setLong(1, userId);
                inserted = statement.executeUpdate();
            }
            profile = findProfile(connection, userId);
            if (profile == null) {
                throw new IllegalStateException("Driver profile insert did not persist");
            }
            requireProfileNotSuspended(profile);
            return new ProfileResult(profile, inserted == 1);
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public DriverResponses.Profile getProfile(String subject) {
        long userId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            requireActiveDriverAccount(connection, userId);
            DriverResponses.Profile profile = findProfile(connection, userId);
            if (profile == null) {
                throw error(Response.Status.NOT_FOUND, "Driver profile was not found", "driver_profile_not_found");
            }
            requireProfileNotSuspended(profile);
            return profile;
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public DriverResponses.PersonalProfile updatePersonalProfile(
            String subject, DriverRequests.ProfileUpdate request) {
        long userId = parseSubject(subject);
        String name = request.name().trim();
        String phone = normalizePhone(request.phone());
        if (name.isEmpty() || name.length() > 120 || phone == null) {
            throw invalidProfile();
        }

        try (Connection connection = dataSource.getConnection()) {
            requireUsableDriverProfile(connection, userId);
            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE users SET full_name = ?, phone_e164 = ?, updated_at = statement_timestamp() "
                            + "WHERE id = ? RETURNING full_name, phone_e164")) {
                statement.setString(1, name);
                statement.setString(2, phone);
                statement.setLong(3, userId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw error(Response.Status.NOT_FOUND, "Driver account was not found", "driver_not_found");
                    }
                    return new DriverResponses.PersonalProfile(
                            result.getString("full_name"), result.getString("phone_e164"));
                }
            }
        } catch (SQLException exception) {
            if ("23505".equals(exception.getSQLState())) {
                throw error(Response.Status.CONFLICT, "Phone number is already in use", "profile_conflict");
            }
            if ("23514".equals(exception.getSQLState())) {
                throw invalidProfile();
            }
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public DriverResponses.OnlineStatus getOnlineStatus(String subject) {
        long userId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            requireActiveDriverAccount(connection, userId);
            DriverResponses.Profile profile = findProfile(connection, userId);
            if (profile == null) {
                throw error(Response.Status.NOT_FOUND, "Driver profile was not found", "driver_profile_not_found");
            }
            requireProfileNotSuspended(profile);
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT is_online FROM driver_profiles WHERE user_id = ?")) {
                statement.setLong(1, userId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw error(Response.Status.NOT_FOUND, "Driver profile was not found",
                                "driver_profile_not_found");
                    }
                    return new DriverResponses.OnlineStatus(result.getBoolean("is_online"));
                }
            }
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public DriverResponses.OnlineStatus setOnlineStatus(String subject, DriverRequests.OnlineStatus request) {
        long userId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            requireActiveDriverAccount(connection, userId);
            String profileStatus;
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT status FROM driver_profiles WHERE user_id = ? FOR UPDATE")) {
                statement.setLong(1, userId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw error(Response.Status.NOT_FOUND, "Driver profile was not found",
                                "driver_profile_not_found");
                    }
                    profileStatus = result.getString("status");
                }
            }
            if ("suspended".equals(profileStatus)) {
                throw driverAccessDenied();
            }
            if (request.isOnline()) {
                if (!"active".equals(profileStatus)
                        || driverEligibilityService
                                .findEligibleVehicle(connection, userId, null, false, false)
                                .isEmpty()) {
                    throw driverNotEligible();
                }
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE driver_profiles SET is_online = ? WHERE user_id = ? RETURNING is_online")) {
                statement.setBoolean(1, request.isOnline());
                statement.setLong(2, userId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw error(Response.Status.NOT_FOUND, "Driver profile was not found",
                                "driver_profile_not_found");
                    }
                    return new DriverResponses.OnlineStatus(result.getBoolean("is_online"));
                }
            }
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public DriverResponses.Statistics getStatistics(String subject) {
        long userId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            requireUsableDriverProfile(connection, userId);
            BigDecimal todayEarnings;
            long todayTrips;
            long completedTrips;
            try (PreparedStatement statement = connection.prepareStatement(
                    "WITH local_day AS ("
                            + "SELECT date_trunc('day', statement_timestamp() AT TIME ZONE 'Asia/Makassar') AS start_local"
                            + "), day_window AS ("
                            + "SELECT start_local AT TIME ZONE 'Asia/Makassar' AS starts_at, "
                            + "(start_local + INTERVAL '1 day') AT TIME ZONE 'Asia/Makassar' AS ends_at "
                            + "FROM local_day) "
                            + "SELECT COALESCE(SUM(t.final_fare) FILTER ("
                            + "WHERE t.completed_at >= d.starts_at AND t.completed_at < d.ends_at), 0) "
                            + "AS today_earnings, "
                            + "COUNT(*) FILTER (WHERE t.completed_at >= d.starts_at "
                            + "AND t.completed_at < d.ends_at) AS today_trips, "
                            + "COUNT(*) AS completed_trips FROM trips t CROSS JOIN day_window d "
                            + "WHERE t.driver_user_id = ? AND t.status = 'completed'")) {
                statement.setLong(1, userId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw new IllegalStateException("Driver statistics query returned no result");
                    }
                    todayEarnings = result.getBigDecimal("today_earnings");
                    todayTrips = result.getLong("today_trips");
                    completedTrips = result.getLong("completed_trips");
                }
            }

            BigDecimal rating;
            long totalRatingsCount;
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT AVG(r.score) AS average_rating, COUNT(*) AS rating_count "
                            + "FROM ratings r JOIN trips t ON t.id = r.trip_id "
                            + "WHERE t.driver_user_id = ? AND t.status = 'completed' AND r.to_user_id = ?")) {
                statement.setLong(1, userId);
                statement.setLong(2, userId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw new IllegalStateException("Driver rating query returned no result");
                    }
                    rating = result.getBigDecimal("average_rating");
                    totalRatingsCount = result.getLong("rating_count");
                }
            }
            return new DriverResponses.Statistics(
                    todayEarnings,
                    todayTrips,
                    completedTrips,
                    rating,
                    totalRatingsCount);
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public DriverResponses.VehicleList listVehicles(String subject) {
        long userId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            requireUsableDriverProfile(connection, userId);
            List<DriverResponses.Vehicle> vehicles = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT id, vehicle_type, plate_normalized, make, model, color, "
                            + "verification_status, rejection_reason, is_active, created_at, updated_at "
                            + "FROM driver_vehicles WHERE driver_user_id = ? ORDER BY created_at, id")) {
                statement.setLong(1, userId);
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) {
                        vehicles.add(mapVehicle(result));
                    }
                }
            }
            return new DriverResponses.VehicleList(List.copyOf(vehicles));
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public DriverResponses.Vehicle registerVehicle(String subject, DriverRequests.VehicleRegistration request) {
        long userId = parseSubject(subject);
        String type = normalizeVehicleType(request.vehicleType());
        String plate = normalizePlate(request.vehiclePlate());
        String make = normalizeText(request.make());
        String model = normalizeText(request.model());
        String color = normalizeText(request.color());

        try (Connection connection = dataSource.getConnection()) {
            requireUsableDriverProfile(connection, userId);
            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO driver_vehicles "
                            + "(driver_user_id, vehicle_type, plate_normalized, make, model, color) "
                            + "VALUES (?, ?, ?, ?, ?, ?) "
                            + "RETURNING id, vehicle_type, plate_normalized, make, model, color, "
                            + "verification_status, rejection_reason, is_active, created_at, updated_at")) {
                statement.setLong(1, userId);
                statement.setString(2, type);
                statement.setString(3, plate);
                statement.setString(4, make);
                statement.setString(5, model);
                statement.setString(6, color);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw new IllegalStateException("Vehicle insert did not return a row");
                    }
                    return mapVehicle(result);
                }
            }
        } catch (SQLException exception) {
            if ("23505".equals(exception.getSQLState())) {
                throw error(Response.Status.CONFLICT, "Vehicle could not be registered", "vehicle_conflict");
            }
            if ("23503".equals(exception.getSQLState())) {
                throw error(Response.Status.CONFLICT, "Vehicle could not be registered", "vehicle_conflict");
            }
            if ("23514".equals(exception.getSQLState())) {
                throw invalidVehicle();
            }
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public DriverResponses.Vehicle updatePendingVehicle(
            String subject,
            long vehicleId,
            DriverRequests.VehicleRegistration request) {
        long userId = parseSubject(subject);
        String type = normalizeVehicleType(request.vehicleType());
        String plate = normalizePlate(request.vehiclePlate());
        String make = normalizeText(request.make());
        String model = normalizeText(request.model());
        String color = normalizeText(request.color());

        try (Connection connection = dataSource.getConnection()) {
            requireUsableDriverProfile(connection, userId);
            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE driver_vehicles SET vehicle_type = ?, plate_normalized = ?, "
                            + "make = ?, model = ?, color = ?, "
                            + "verification_status = CASE WHEN verification_status = 'rejected' "
                            + "THEN 'pending' ELSE verification_status END, "
                            + "verification_version = verification_version "
                            + "+ CASE WHEN verification_status = 'rejected' THEN 1 ELSE 0 END, "
                            + "is_active = CASE WHEN verification_status = 'rejected' THEN FALSE ELSE is_active END, "
                            + "reviewer_admin_id = CASE WHEN verification_status = 'rejected' "
                            + "THEN NULL ELSE reviewer_admin_id END, "
                            + "reviewed_at = CASE WHEN verification_status = 'rejected' "
                            + "THEN NULL ELSE reviewed_at END, "
                            + "rejection_reason = CASE WHEN verification_status = 'rejected' "
                            + "THEN NULL ELSE rejection_reason END, review_metadata_legacy = FALSE "
                            + "WHERE id = ? AND driver_user_id = ? "
                            + "AND verification_status IN ('pending', 'rejected') "
                            + "RETURNING id, vehicle_type, plate_normalized, make, model, color, "
                            + "verification_status, rejection_reason, is_active, created_at, updated_at")) {
                statement.setString(1, type);
                statement.setString(2, plate);
                statement.setString(3, make);
                statement.setString(4, model);
                statement.setString(5, color);
                statement.setLong(6, vehicleId);
                statement.setLong(7, userId);
                try (ResultSet result = statement.executeQuery()) {
                    if (result.next()) {
                        return mapVehicle(result);
                    }
                }
            }
            assertVehicleOwned(connection, userId, vehicleId);
            throw error(Response.Status.CONFLICT,
                    "Only pending or rejected vehicles can be edited", "vehicle_not_editable");
        } catch (SQLException exception) {
            if ("23505".equals(exception.getSQLState()) || "23503".equals(exception.getSQLState())) {
                throw error(Response.Status.CONFLICT, "Vehicle could not be updated", "vehicle_conflict");
            }
            if ("23514".equals(exception.getSQLState())) {
                throw invalidVehicle();
            }
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public DriverResponses.Vehicle setVehicleActive(
            String subject,
            long vehicleId,
            DriverRequests.VehicleActivation request) {
        long userId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            requireUsableDriverProfile(connection, userId);
            if (request.isActive()) {
                try (PreparedStatement statement = connection.prepareStatement(
                        "UPDATE driver_vehicles SET is_active = TRUE "
                                + "WHERE id = ? AND driver_user_id = ? AND verification_status = 'verified' "
                                + "RETURNING id, vehicle_type, plate_normalized, make, model, color, "
                                + "verification_status, rejection_reason, is_active, created_at, updated_at")) {
                    statement.setLong(1, vehicleId);
                    statement.setLong(2, userId);
                    try (ResultSet result = statement.executeQuery()) {
                        if (result.next()) {
                            return mapVehicle(result);
                        }
                    }
                }
                assertVehicleOwned(connection, userId, vehicleId);
                throw error(Response.Status.CONFLICT, "Vehicle must be verified before activation",
                        "vehicle_not_verified");
            }

            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE driver_vehicles SET is_active = FALSE "
                            + "WHERE id = ? AND driver_user_id = ? "
                            + "RETURNING id, vehicle_type, plate_normalized, make, model, color, "
                                    + "verification_status, rejection_reason, is_active, created_at, updated_at")) {
                statement.setLong(1, vehicleId);
                statement.setLong(2, userId);
                try (ResultSet result = statement.executeQuery()) {
                    if (result.next()) {
                        return mapVehicle(result);
                    }
                }
            }
            throw vehicleNotFound();
        } catch (SQLException exception) {
            if ("23514".equals(exception.getSQLState())) {
                throw error(Response.Status.CONFLICT, "Vehicle state could not be changed", "vehicle_state_conflict");
            }
            throw databaseFailure(exception);
        }
    }

    private static void requireActiveDriverAccount(Connection connection, long userId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT u.status, EXISTS ("
                        + "SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'driver') AS has_driver_role "
                        + "FROM users u WHERE u.id = ?")) {
            statement.setLong(1, userId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()
                        || !"active".equals(result.getString("status"))
                        || !result.getBoolean("has_driver_role")) {
                    throw driverAccessDenied();
                }
            }
        }
    }

    private static void requireUsableDriverProfile(Connection connection, long userId) throws SQLException {
        requireActiveDriverAccount(connection, userId);
        DriverResponses.Profile profile = findProfile(connection, userId);
        if (profile == null) {
            throw error(Response.Status.NOT_FOUND, "Driver profile was not found", "driver_profile_not_found");
        }
        requireProfileNotSuspended(profile);
    }

    private static DriverResponses.Profile findProfile(Connection connection, long userId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT status, verification_status, rejection_reason, reviewed_at, submission_version, "
                        + "created_at, updated_at FROM driver_profiles WHERE user_id = ?")) {
            statement.setLong(1, userId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return null;
                }
                return new DriverResponses.Profile(
                        Long.toString(userId),
                        result.getString("status"),
                        result.getString("verification_status"),
                        result.getString("rejection_reason"),
                        result.getObject("reviewed_at", OffsetDateTime.class) == null
                                ? null
                                : result.getObject("reviewed_at", OffsetDateTime.class).toInstant().toString(),
                        result.getInt("submission_version"),
                        result.getObject("created_at", OffsetDateTime.class).toInstant().toString(),
                        result.getObject("updated_at", OffsetDateTime.class).toInstant().toString());
            }
        }
    }

    private static void requireProfileNotSuspended(DriverResponses.Profile profile) {
        if ("suspended".equals(profile.status())) {
            throw driverAccessDenied();
        }
    }

    private static void assertVehicleOwned(Connection connection, long userId, long vehicleId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT 1 FROM driver_vehicles WHERE id = ? AND driver_user_id = ?")) {
            statement.setLong(1, vehicleId);
            statement.setLong(2, userId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw vehicleNotFound();
                }
            }
        }
    }

    private static DriverResponses.Vehicle mapVehicle(ResultSet result) throws SQLException {
        String databaseType = result.getString("vehicle_type");
        String frontendType = "motorcycle".equals(databaseType) ? "MOTOR" : "MOBIL";
        return new DriverResponses.Vehicle(
                Long.toString(result.getLong("id")),
                frontendType,
                result.getString("plate_normalized"),
                result.getString("make"),
                result.getString("model"),
                result.getString("color"),
                result.getString("verification_status"),
                result.getString("rejection_reason"),
                result.getBoolean("is_active"),
                result.getObject("created_at", OffsetDateTime.class).toInstant().toString(),
                result.getObject("updated_at", OffsetDateTime.class).toInstant().toString());
    }

    private static String normalizeVehicleType(String value) {
        return switch (value.trim().toLowerCase(Locale.ROOT)) {
            case "motor", "motorcycle" -> "motorcycle";
            case "mobil", "car" -> "car";
            default -> throw invalidVehicle();
        };
    }

    private static String normalizePlate(String value) {
        String normalized = value.trim().toUpperCase(Locale.ROOT).replaceAll("[\\s-]", "");
        if (!NORMALIZED_PLATE.matcher(normalized).matches()) {
            throw invalidVehicle();
        }
        return normalized;
    }

    private static String normalizeText(String value) {
        String normalized = value.trim();
        if (normalized.isEmpty()) {
            throw invalidVehicle();
        }
        return normalized;
    }

    private static String normalizePhone(String value) {
        String normalized = value.trim().replaceAll("[\\s()\\-]", "");
        if (normalized.startsWith("00")) {
            normalized = "+" + normalized.substring(2);
        } else if (normalized.startsWith("0")) {
            normalized = "+62" + normalized.substring(1);
        } else if (normalized.startsWith("62")) {
            normalized = "+" + normalized;
        }
        return E164_PHONE.matcher(normalized).matches() ? normalized : null;
    }

    private static long parseSubject(String subject) {
        try {
            long userId = Long.parseLong(subject);
            if (userId <= 0) {
                throw new NumberFormatException("Subject must be positive");
            }
            return userId;
        } catch (NumberFormatException exception) {
            throw error(Response.Status.UNAUTHORIZED, "Authentication is required", "unauthorized");
        }
    }

    private static WebApplicationException driverAccessDenied() {
        return error(Response.Status.FORBIDDEN, "Driver access is not available", "driver_access_denied");
    }

    private static WebApplicationException driverNotEligible() {
        return error(Response.Status.FORBIDDEN, "Driver is not eligible to go online", "driver_not_eligible");
    }

    private static WebApplicationException vehicleNotFound() {
        return error(Response.Status.NOT_FOUND, "Vehicle was not found", "vehicle_not_found");
    }

    private static WebApplicationException invalidVehicle() {
        return error(Response.Status.BAD_REQUEST, "Vehicle data is invalid", "invalid_vehicle");
    }

    private static WebApplicationException invalidProfile() {
        return error(Response.Status.BAD_REQUEST, "Driver profile data is invalid", "invalid_profile");
    }

    private static WebApplicationException error(Response.Status status, String message, String code) {
        return new WebApplicationException(
                Response.status(status).entity(new DriverResponses.Error(message, code)).build());
    }

    private static WebApplicationException databaseFailure(SQLException exception) {
        LOG.error("Driver persistence operation failed", exception);
        return new WebApplicationException(
                Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                        .entity(new DriverResponses.Error("Driver operation could not be completed",
                                "driver_operation_failed"))
                        .build());
    }

    public record ProfileResult(DriverResponses.Profile profile, boolean created) {
    }
}

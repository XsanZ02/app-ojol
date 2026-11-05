package id.rideflow.service;

import id.rideflow.dto.TripRequests;
import id.rideflow.dto.TripResponses;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

@ApplicationScoped
public class TripService {

    private static final Logger LOG = Logger.getLogger(TripService.class);
    private static final BigDecimal EARTH_RADIUS_KM = BigDecimal.valueOf(6371);
    private static final BigDecimal MOTOR_BASE_FARE = BigDecimal.valueOf(9000);
    private static final BigDecimal CAR_BASE_FARE = BigDecimal.valueOf(18000);
    private static final BigDecimal MOTOR_RATE_PER_KM = BigDecimal.valueOf(2500);
    private static final BigDecimal CAR_RATE_PER_KM = BigDecimal.valueOf(5000);
    private static final BigDecimal BASE_DISTANCE_KM = BigDecimal.valueOf(2);
    private static final BigDecimal ROAD_FACTOR = BigDecimal.valueOf(1.35);
    private static final BigDecimal MIN_DISTANCE_KM = BigDecimal.valueOf(1.2);
    private static final BigDecimal HALF_THOUSAND = BigDecimal.valueOf(500);
    private static final double DEGREE_TO_RADIAN = Math.PI / 180.0;

    @Inject
    DataSource dataSource;

    @Inject
    DriverEligibilityService driverEligibilityService;

    @Transactional
    public TripResponses.Trip create(String subject, TripRequests.Create request) {
        long customerId = parseSubject(subject);
        String vehicleType = normalizeVehicleType(request.vehicleType());
        String currency = request.currencyCode() == null ? "IDR" : request.currencyCode();
        validateCoordinates(request);
        BigDecimal distance = estimateDistance(
                request.pickupLatitude(), request.pickupLongitude(),
                request.destinationLatitude(), request.destinationLongitude());
        BigDecimal fare = calculateFare(distance, vehicleType);
        int duration = estimateDuration(distance, vehicleType);

        try (Connection connection = dataSource.getConnection()) {
            requireAccountRole(connection, customerId, "customer");
            long tripId;
            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO trips (rider_user_id, vehicle_type, pickup_address, pickup_latitude, "
                            + "pickup_longitude, dropoff_address, dropoff_latitude, dropoff_longitude, "
                            + "status, estimated_fare, currency_code) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?) RETURNING id")) {
                statement.setLong(1, customerId);
                statement.setString(2, vehicleType);
                statement.setString(3, request.pickupAddress().trim());
                statement.setBigDecimal(4, request.pickupLatitude());
                statement.setBigDecimal(5, request.pickupLongitude());
                statement.setString(6, request.destinationAddress().trim());
                statement.setBigDecimal(7, request.destinationLatitude());
                statement.setBigDecimal(8, request.destinationLongitude());
                statement.setBigDecimal(9, fare);
                statement.setString(10, currency);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw new IllegalStateException("Trip insert did not return an id");
                    }
                    tripId = result.getLong(1);
                }
            }
            insertStatusHistory(connection, tripId, null, "requested", customerId, null);
            return loadTrip(connection, tripId, distance, duration);
        } catch (SQLException exception) {
            if ("23514".equals(exception.getSQLState())) {
                throw invalidTrip();
            }
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public List<TripResponses.Trip> myTrips(String subject) {
        long customerId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            requireAccountRole(connection, customerId, "customer");
            List<Long> tripIds = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT id FROM trips WHERE rider_user_id = ? ORDER BY requested_at DESC, id DESC")) {
                statement.setLong(1, customerId);
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) {
                        tripIds.add(result.getLong(1));
                    }
                }
            }
            return loadTrips(connection, tripIds);
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public List<TripResponses.Trip> driverTrips(String subject) {
        long driverId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            requireDriverAccount(connection, driverId);
            List<Long> tripIds = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT id FROM trips WHERE driver_user_id = ? ORDER BY requested_at DESC, id DESC")) {
                statement.setLong(1, driverId);
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) {
                        tripIds.add(result.getLong(1));
                    }
                }
            }
            return loadTrips(connection, tripIds);
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public TripResponses.Trip activeDriverTrip(String subject) {
        long driverId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            requireDriverAccount(connection, driverId);
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT id FROM trips WHERE driver_user_id = ? "
                            + "AND status IN ('accepted', 'picking_up', 'in_progress') "
                            + "ORDER BY accepted_at DESC, id DESC LIMIT 1")) {
                statement.setLong(1, driverId);
                try (ResultSet result = statement.executeQuery()) {
                    return result.next() ? loadTrip(connection, result.getLong("id")) : null;
                }
            }
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public TripResponses.Trip getTrip(String subject, long tripId) {
        long userId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            requireActiveAccount(connection, userId);
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT id FROM trips WHERE id = ? AND (rider_user_id = ? OR driver_user_id = ?)")) {
                statement.setLong(1, tripId);
                statement.setLong(2, userId);
                statement.setLong(3, userId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw tripNotFound();
                    }
                }
            }
            return loadTrip(connection, tripId);
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public TripResponses.Trip cancel(String subject, long tripId, TripRequests.Cancel request) {
        long customerId = parseSubject(subject);
        String reason = request == null || request.reason() == null || request.reason().isBlank()
                ? null
                : request.reason().trim();
        try (Connection connection = dataSource.getConnection()) {
            requireAccountRole(connection, customerId, "customer");
            String previousStatus;
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT status FROM trips WHERE id = ? AND rider_user_id = ? FOR UPDATE")) {
                statement.setLong(1, tripId);
                statement.setLong(2, customerId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw tripNotFound();
                    }
                    previousStatus = result.getString("status");
                }
            }
            if (!"requested".equals(previousStatus)) {
                throw invalidTransition();
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE trips SET status = 'cancelled', cancelled_at = statement_timestamp() "
                            + "WHERE id = ? AND rider_user_id = ? AND status = 'requested'")) {
                statement.setLong(1, tripId);
                statement.setLong(2, customerId);
                if (statement.executeUpdate() != 1) {
                    throw invalidTransition();
                }
            }
            insertStatusHistory(connection, tripId, previousStatus, "cancelled", customerId, reason);
            return loadTrip(connection, tripId);
        } catch (SQLException exception) {
            if ("23514".equals(exception.getSQLState())) {
                throw invalidTransition();
            }
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public List<TripResponses.Trip> availableOrders(String subject) {
        long driverId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            List<String> eligibleVehicleTypes =
                    driverEligibilityService.findEligibleVehicleTypes(connection, driverId, true);
            if (eligibleVehicleTypes.isEmpty()) {
                throw driverNotEligible();
            }
            List<Long> tripIds = new ArrayList<>();
            String vehicleTypePlaceholders = eligibleVehicleTypes.stream()
                    .map(type -> "?")
                    .collect(Collectors.joining(", "));
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT DISTINCT t.id FROM trips t "
                            + "JOIN driver_vehicles v ON v.driver_user_id = ? "
                            + "AND v.vehicle_type = t.vehicle_type "
                            + "AND v.vehicle_type IN (" + vehicleTypePlaceholders + ") "
                            + "AND v.is_active AND v.verification_status = 'verified' "
                            + "WHERE t.status = 'requested' AND t.driver_user_id IS NULL "
                            + "ORDER BY t.id")) {
                statement.setLong(1, driverId);
                for (int index = 0; index < eligibleVehicleTypes.size(); index++) {
                    statement.setString(index + 2, eligibleVehicleTypes.get(index));
                }
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) {
                        tripIds.add(result.getLong(1));
                    }
                }
            }
            return loadTrips(connection, tripIds);
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public TripResponses.Trip accept(String subject, long tripId) {
        long driverId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            if (!driverEligibilityService.lockDriverProfile(connection, driverId)) {
                throw driverNotEligible();
            }
            TripRow initialTrip = findTrip(connection, tripId);
            if (initialTrip == null) {
                throw tripNotFound();
            }
            long vehicleId = driverEligibilityService
                    .findEligibleVehicle(connection, driverId, initialTrip.vehicleType(), true, true)
                    .orElseThrow(TripService::driverNotEligible);
            TripRow trip = lockTrip(connection, tripId);
            if (trip == null) {
                throw tripNotFound();
            }
            if (!"requested".equals(trip.status())
                    || trip.driverId() != null
                    || !initialTrip.vehicleType().equals(trip.vehicleType())) {
                throw invalidTransition();
            }

            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE trips SET driver_user_id = ?, vehicle_id = ?, status = 'accepted', "
                            + "accepted_at = statement_timestamp() "
                            + "WHERE id = ? AND status = 'requested' AND driver_user_id IS NULL")) {
                statement.setLong(1, driverId);
                statement.setLong(2, vehicleId);
                statement.setLong(3, tripId);
                if (statement.executeUpdate() != 1) {
                    throw invalidTransition();
                }
            }
            insertStatusHistory(connection, tripId, "requested", "accepted", driverId, null);
            return loadTrip(connection, tripId);
        } catch (SQLException exception) {
            if ("23503".equals(exception.getSQLState()) || "23514".equals(exception.getSQLState())) {
                throw error(Response.Status.CONFLICT, "Order could not be accepted", "order_not_available");
            }
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public TripResponses.Trip progress(String subject, long tripId, String nextStatus) {
        long driverId = parseSubject(subject);
        String expectedStatus;
        String timestampColumn;
        switch (nextStatus) {
            case "picking_up" -> {
                expectedStatus = "accepted";
                timestampColumn = null;
            }
            case "in_progress" -> {
                expectedStatus = "picking_up";
                timestampColumn = "started_at";
            }
            case "completed" -> {
                expectedStatus = "in_progress";
                timestampColumn = "completed_at";
            }
            default -> throw new IllegalArgumentException("Unsupported driver transition");
        }

        try (Connection connection = dataSource.getConnection()) {
            if (!driverEligibilityService.lockDriverProfile(connection, driverId)) {
                throw driverNotEligible();
            }
            TripRow initialTrip = findTripForDriver(connection, tripId, driverId);
            if (initialTrip == null || initialTrip.vehicleId() == null) {
                throw tripNotFound();
            }
            if (!driverEligibilityService.lockVehicle(connection, driverId, initialTrip.vehicleId())) {
                throw tripNotFound();
            }
            TripRow trip = lockTrip(connection, tripId);
            if (trip == null
                    || trip.driverId() == null
                    || trip.driverId() != driverId
                    || !initialTrip.vehicleId().equals(trip.vehicleId())) {
                throw tripNotFound();
            }
            boolean drainingTrip = driverEligibilityService.isAssignedTripDraining(
                    connection, driverId, tripId);
            boolean eligibleVehicle = driverEligibilityService.isEligibleVehicle(
                    connection, driverId, trip.vehicleId(), trip.vehicleType(), false);
            if (!DriverEligibilityService.allowsAssignedTripProgress(eligibleVehicle, drainingTrip)) {
                throw driverNotEligible();
            }
            if (drainingTrip) {
                requireActiveDriverProfile(connection, driverId);
            }
            if (!expectedStatus.equals(trip.status())) {
                throw invalidTransition();
            }
            String update = timestampColumn == null
                    ? "UPDATE trips SET status = ? WHERE id = ? AND driver_user_id = ? AND status = ?"
                    : timestampColumn.equals("completed_at")
                            ? "UPDATE trips SET status = ?, completed_at = statement_timestamp(), "
                                    + "final_fare = estimated_fare WHERE id = ? AND driver_user_id = ? AND status = ?"
                            : "UPDATE trips SET status = ?, started_at = statement_timestamp() "
                                    + "WHERE id = ? AND driver_user_id = ? AND status = ?";
            try (PreparedStatement statement = connection.prepareStatement(update)) {
                statement.setString(1, nextStatus);
                statement.setLong(2, tripId);
                statement.setLong(3, driverId);
                statement.setString(4, expectedStatus);
                if (statement.executeUpdate() != 1) {
                    throw invalidTransition();
                }
            }
            insertStatusHistory(connection, tripId, expectedStatus, nextStatus, driverId, null);
            return loadTrip(connection, tripId);
        } catch (SQLException exception) {
            if ("23514".equals(exception.getSQLState())) {
                throw invalidTransition();
            }
            throw databaseFailure(exception);
        }
    }

    private List<TripResponses.Trip> loadTrips(Connection connection, List<Long> tripIds) throws SQLException {
        List<TripResponses.Trip> trips = new ArrayList<>();
        for (long id : tripIds) {
            trips.add(loadTrip(connection, id));
        }
        return List.copyOf(trips);
    }

    private TripResponses.Trip loadTrip(Connection connection, long tripId) throws SQLException {
        return loadTrip(connection, tripId, null, null);
    }

    private TripResponses.Trip loadTrip(
            Connection connection,
            long tripId,
            BigDecimal calculatedDistance,
            Integer calculatedDuration) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT id, vehicle_type, pickup_address, pickup_latitude, pickup_longitude, "
                        + "dropoff_address, dropoff_latitude, dropoff_longitude, status, estimated_fare, "
                        + "final_fare, currency_code, requested_at, accepted_at, started_at, completed_at, "
                        + "cancelled_at, created_at, updated_at FROM trips WHERE id = ?")) {
            statement.setLong(1, tripId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw tripNotFound();
                }
                BigDecimal distance = calculatedDistance != null
                        ? calculatedDistance
                        : estimateDistance(
                                result.getBigDecimal("pickup_latitude"),
                                result.getBigDecimal("pickup_longitude"),
                                result.getBigDecimal("dropoff_latitude"),
                                result.getBigDecimal("dropoff_longitude"));
                int duration = calculatedDuration != null
                        ? calculatedDuration
                        : estimateDuration(distance, result.getString("vehicle_type"));
                return new TripResponses.Trip(
                        Long.toString(result.getLong("id")),
                        frontendStatus(result.getString("status")),
                        frontendVehicleType(result.getString("vehicle_type")),
                        new TripResponses.Location(
                                result.getString("pickup_address"),
                                result.getString("pickup_address"),
                                result.getBigDecimal("pickup_latitude"),
                                result.getBigDecimal("pickup_longitude")),
                        new TripResponses.Location(
                                result.getString("dropoff_address"),
                                result.getString("dropoff_address"),
                                result.getBigDecimal("dropoff_latitude"),
                                result.getBigDecimal("dropoff_longitude")),
                        distance,
                        duration,
                        result.getBigDecimal("estimated_fare"),
                        result.getBigDecimal("final_fare"),
                        result.getString("currency_code"),
                        loadHistory(connection, tripId),
                        instant(result, "created_at"),
                        instant(result, "updated_at"),
                        instant(result, "accepted_at"),
                        instant(result, "started_at"),
                        instant(result, "completed_at"),
                        instant(result, "cancelled_at"));
            }
        }
    }

    private static List<TripResponses.StatusHistory> loadHistory(Connection connection, long tripId)
            throws SQLException {
        List<TripResponses.StatusHistory> history = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT new_status, changed_at, reason FROM trip_status_history "
                        + "WHERE trip_id = ? ORDER BY changed_at, id")) {
            statement.setLong(1, tripId);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    history.add(new TripResponses.StatusHistory(
                            frontendStatus(result.getString("new_status")),
                            result.getObject("changed_at", OffsetDateTime.class).toInstant().toString(),
                            result.getString("reason")));
                }
            }
        }
        return List.copyOf(history);
    }

    private static String instant(ResultSet result, String column) throws SQLException {
        OffsetDateTime value = result.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant().toString();
    }

    private static TripRow lockTrip(Connection connection, long tripId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT status, driver_user_id, vehicle_id, vehicle_type FROM trips WHERE id = ? FOR UPDATE")) {
            statement.setLong(1, tripId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return null;
                }
                long driverId = result.getLong("driver_user_id");
                Long assignedDriverId = result.wasNull() ? null : driverId;
                long vehicleId = result.getLong("vehicle_id");
                Long assignedVehicleId = result.wasNull() ? null : vehicleId;
                return new TripRow(result.getString("status"), assignedDriverId, assignedVehicleId,
                        result.getString("vehicle_type"));
            }
        }
    }

    private static TripRow findTripForDriver(Connection connection, long tripId, long driverId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT status, driver_user_id, vehicle_id, vehicle_type FROM trips "
                        + "WHERE id = ? AND driver_user_id = ?")) {
            statement.setLong(1, tripId);
            statement.setLong(2, driverId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return null;
                }
                long vehicleId = result.getLong("vehicle_id");
                Long assignedVehicleId = result.wasNull() ? null : vehicleId;
                return new TripRow(
                        result.getString("status"),
                        driverId,
                        assignedVehicleId,
                        result.getString("vehicle_type"));
            }
        }
    }

    private static TripRow findTrip(Connection connection, long tripId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT status, driver_user_id, vehicle_id, vehicle_type FROM trips WHERE id = ?")) {
            statement.setLong(1, tripId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return null;
                }
                long driverId = result.getLong("driver_user_id");
                Long assignedDriverId = result.wasNull() ? null : driverId;
                long vehicleId = result.getLong("vehicle_id");
                Long assignedVehicleId = result.wasNull() ? null : vehicleId;
                return new TripRow(
                        result.getString("status"),
                        assignedDriverId,
                        assignedVehicleId,
                        result.getString("vehicle_type"));
            }
        }
    }

    private static void requireActiveDriverProfile(Connection connection, long driverId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT u.status, dp.status AS profile_status "
                        + "FROM users u "
                        + "JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'driver' "
                        + "JOIN driver_profiles dp ON dp.user_id = u.id "
                        + "WHERE u.id = ?")) {
            statement.setLong(1, driverId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()
                        || !"active".equals(result.getString("status"))
                        || !"active".equals(result.getString("profile_status"))) {
                    throw driverNotEligible();
                }
            }
        }
    }

    private static void requireAccountRole(Connection connection, long userId, String role) throws SQLException {
        requireActiveAccount(connection, userId);
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT 1 FROM user_roles WHERE user_id = ? AND role = ?")) {
            statement.setLong(1, userId);
            statement.setString(2, role);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw error(Response.Status.FORBIDDEN, "This operation is not available", "role_required");
                }
            }
        }
    }

    private static void requireDriverAccount(Connection connection, long userId) throws SQLException {
        requireAccountRole(connection, userId, "driver");
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT status FROM driver_profiles WHERE user_id = ?")) {
            statement.setLong(1, userId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw error(Response.Status.NOT_FOUND, "Driver profile was not found",
                            "driver_profile_not_found");
                }
                if ("suspended".equals(result.getString("status"))) {
                    throw error(Response.Status.FORBIDDEN, "Driver access is not available",
                            "driver_access_denied");
                }
            }
        }
    }

    private static void requireActiveAccount(Connection connection, long userId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT status FROM users WHERE id = ?")) {
            statement.setLong(1, userId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next() || !"active".equals(result.getString(1))) {
                    throw error(Response.Status.FORBIDDEN, "This operation is not available", "account_inactive");
                }
            }
        }
    }

    private static void insertStatusHistory(
            Connection connection,
            long tripId,
            String previousStatus,
            String nextStatus,
            long actorId,
            String reason) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO trip_status_history "
                        + "(trip_id, previous_status, new_status, actor_user_id, reason) "
                        + "VALUES (?, ?, ?, ?, ?)")) {
            statement.setLong(1, tripId);
            statement.setString(2, previousStatus);
            statement.setString(3, nextStatus);
            statement.setLong(4, actorId);
            statement.setString(5, reason);
            statement.executeUpdate();
        }
    }

    private static void validateCoordinates(TripRequests.Create request) {
        if (request.pickupAddress().trim().isEmpty() || request.destinationAddress().trim().isEmpty()) {
            throw invalidTrip();
        }
    }

    private static BigDecimal estimateDistance(
            BigDecimal fromLatitude,
            BigDecimal fromLongitude,
            BigDecimal toLatitude,
            BigDecimal toLongitude) {
        double fromLat = Math.toRadians(fromLatitude.doubleValue());
        double toLat = Math.toRadians(toLatitude.doubleValue());
        double deltaLat = toLat - fromLat;
        double deltaLon = Math.toRadians(toLongitude.doubleValue() - fromLongitude.doubleValue());
        double a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
                + Math.cos(fromLat) * Math.cos(toLat)
                        * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
        double straightDistance = EARTH_RADIUS_KM.doubleValue()
                * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        double roadDistance = Math.max(MIN_DISTANCE_KM.doubleValue(), straightDistance * ROAD_FACTOR.doubleValue());
        return BigDecimal.valueOf(roadDistance).setScale(1, RoundingMode.HALF_UP);
    }

    private static BigDecimal calculateFare(BigDecimal distance, String vehicleType) {
        BigDecimal baseFare = "motorcycle".equals(vehicleType) ? MOTOR_BASE_FARE : CAR_BASE_FARE;
        BigDecimal ratePerKm = "motorcycle".equals(vehicleType) ? MOTOR_RATE_PER_KM : CAR_RATE_PER_KM;
        if (distance.compareTo(BASE_DISTANCE_KM) <= 0) {
            return baseFare.setScale(2);
        }
        BigDecimal rawFare = baseFare.add(distance.subtract(BASE_DISTANCE_KM).multiply(ratePerKm));
        return rawFare.divide(HALF_THOUSAND, 0, RoundingMode.CEILING)
                .multiply(HALF_THOUSAND)
                .setScale(2);
    }

    private static int estimateDuration(BigDecimal distance, String vehicleType) {
        int averageSpeed = "motorcycle".equals(vehicleType) ? 25 : 18;
        int bufferMinutes = "motorcycle".equals(vehicleType) ? 3 : 5;
        int minutes = (int) Math.round(distance.doubleValue() / averageSpeed * 60) + bufferMinutes;
        return Math.max(5, minutes);
    }

    private static String normalizeVehicleType(String vehicleType) {
        return switch (vehicleType.trim().toLowerCase(Locale.ROOT)) {
            case "motor", "motorcycle" -> "motorcycle";
            case "mobil", "car" -> "car";
            default -> throw invalidTrip();
        };
    }

    private static String frontendVehicleType(String vehicleType) {
        return "motorcycle".equals(vehicleType) ? "MOTOR" : "MOBIL";
    }

    private static String frontendStatus(String status) {
        return "requested".equals(status) ? "PENDING" : status.toUpperCase(Locale.ROOT);
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

    private static WebApplicationException tripNotFound() {
        return error(Response.Status.NOT_FOUND, "Trip was not found", "trip_not_found");
    }

    private static WebApplicationException invalidTransition() {
        return error(Response.Status.CONFLICT, "Trip status does not allow this operation", "invalid_trip_transition");
    }

    private static WebApplicationException driverNotEligible() {
        return error(Response.Status.FORBIDDEN, "Driver is not eligible for this order", "driver_not_eligible");
    }

    private static WebApplicationException invalidTrip() {
        return error(Response.Status.BAD_REQUEST, "Trip data is invalid", "invalid_trip");
    }

    private static WebApplicationException error(Response.Status status, String message, String code) {
        return new WebApplicationException(
                Response.status(status).entity(new TripResponses.Error(message, code)).build());
    }

    private static WebApplicationException databaseFailure(SQLException exception) {
        LOG.error("Trip persistence operation failed", exception);
        return new WebApplicationException(
                Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                        .entity(new TripResponses.Error("Trip operation could not be completed",
                                "trip_operation_failed"))
                        .build());
    }

    private record TripRow(String status, Long driverId, Long vehicleId, String vehicleType) {
    }
}

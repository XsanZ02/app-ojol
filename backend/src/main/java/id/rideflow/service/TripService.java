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
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

@ApplicationScoped
public class TripService {

    private static final Logger LOG = Logger.getLogger(TripService.class);
    @Inject
    DataSource dataSource;

    @Inject
    DriverEligibilityService driverEligibilityService;

    @Inject
    RouteService routeService;

    @Inject
    FareCalculationService fareCalculationService;

    @Transactional
    public TripResponses.Trip create(String subject, TripRequests.Create request) {
        long customerId = parseSubject(subject);
        String vehicleType = normalizeVehicleType(request.vehicleType());
        validateCoordinates(request);
        String tripNotes = request.tripNotes() == null || request.tripNotes().isBlank()
                ? null
                : request.tripNotes().trim();

        try (Connection connection = dataSource.getConnection()) {
            requireAccountRole(connection, customerId, "customer");
            LOG.infof("Creating trip for customerId=%d vehicleType=%s", customerId, vehicleType);
            RouteService.Route route = routeService.estimate(
                    request.pickupLatitude(), request.pickupLongitude(),
                    request.destinationLatitude(), request.destinationLongitude(), vehicleType);
            FareCalculationService.Fare fare = fareCalculationService.calculate(route.distanceMeters(), vehicleType);
            LOG.infof("Calculated trip estimate for customerId=%d vehicleType=%s routeDistanceMeters=%d fare=%s %s",
                    customerId, vehicleType, route.distanceMeters(), fare.amount().toPlainString(), fare.currency());
            long tripId;
            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO trips (rider_user_id, vehicle_type, pickup_address, pickup_latitude, "
                            + "pickup_longitude, dropoff_address, dropoff_latitude, dropoff_longitude, "
                            + "trip_notes, status, estimated_fare, currency_code, route_distance_meters, "
                            + "estimated_duration_seconds, route_geometry, routing_provider, fare_base_amount, "
                            + "fare_per_kilometer, fare_minimum_amount, fare_config_version) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                            + "RETURNING id")) {
                statement.setLong(1, customerId);
                statement.setString(2, vehicleType);
                statement.setString(3, request.pickupAddress().trim());
                statement.setBigDecimal(4, request.pickupLatitude());
                statement.setBigDecimal(5, request.pickupLongitude());
                statement.setString(6, request.destinationAddress().trim());
                statement.setBigDecimal(7, request.destinationLatitude());
                statement.setBigDecimal(8, request.destinationLongitude());
                statement.setString(9, tripNotes);
                statement.setBigDecimal(10, fare.amount());
                statement.setString(11, fare.currency());
                statement.setLong(12, route.distanceMeters());
                statement.setInt(13, route.durationSeconds());
                statement.setString(14, route.geometry());
                statement.setString(15, route.provider());
                statement.setBigDecimal(16, fare.baseFare());
                statement.setBigDecimal(17, fare.farePerKilometer());
                statement.setBigDecimal(18, fare.minimumFare());
                statement.setString(19, fare.configVersion());
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw new IllegalStateException("Trip insert did not return an id");
                    }
                    tripId = result.getLong(1);
                }
            }
            insertStatusHistory(connection, tripId, null, "requested", customerId, null);
            LOG.infof("Created trip id=%d customerId=%d vehicleType=%s fare=%s %s",
                    tripId, customerId, vehicleType, fare.amount().toPlainString(), fare.currency());
            return loadTrip(connection, tripId);
        } catch (SQLException exception) {
            if ("23514".equals(exception.getSQLState())) {
                LOG.warn("Trip creation rejected by a database check constraint (SQLSTATE=23514)", exception);
                throw invalidTrip();
            }
            throw databaseFailure("create", exception);
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
            List<String> eligibleVehicleTypes = findEligibleOrderVehicleTypes(connection, driverId);
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
            return loadTrips(connection, tripIds, false);
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public Set<String> availableOrderVehicleTypes(String subject) {
        long driverId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            return Set.copyOf(findEligibleOrderVehicleTypes(connection, driverId).stream()
                    .map(TripService::frontendVehicleType)
                    .toList());
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    private List<String> findEligibleOrderVehicleTypes(Connection connection, long driverId) throws SQLException {
        List<String> vehicleTypes = driverEligibilityService.findEligibleVehicleTypes(connection, driverId, true);
        if (vehicleTypes.isEmpty()) {
            throw driverNotEligible();
        }
        return vehicleTypes;
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
        return loadTrips(connection, tripIds, true);
    }

    private List<TripResponses.Trip> loadTrips(
            Connection connection,
            List<Long> tripIds,
            boolean includeCustomerDetails) throws SQLException {
        List<TripResponses.Trip> trips = new ArrayList<>();
        for (long id : tripIds) {
            trips.add(loadTrip(connection, id, includeCustomerDetails));
        }
        return List.copyOf(trips);
    }

    private TripResponses.Trip loadTrip(Connection connection, long tripId) throws SQLException {
        return loadTrip(connection, tripId, true);
    }

    private TripResponses.Trip loadTrip(
            Connection connection,
            long tripId,
            boolean includeCustomerDetails) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT t.id, t.vehicle_type, t.pickup_address, t.pickup_latitude, t.pickup_longitude, "
                        + "t.dropoff_address, t.dropoff_latitude, t.dropoff_longitude, t.status, t.estimated_fare, "
                        + "t.trip_notes, t.final_fare, t.currency_code, t.route_distance_meters, "
                        + "t.estimated_duration_seconds, t.route_geometry, t.routing_provider, "
                        + "t.fare_config_version, t.requested_at, t.accepted_at, t.started_at, "
                        + "t.completed_at, t.cancelled_at, t.created_at, t.updated_at, "
                        + "rider.id AS customer_id, rider.full_name AS customer_name, "
                        + "rider.phone_e164 AS customer_phone, "
                        + "u.full_name AS driver_name, u.phone_e164 AS driver_phone, "
                        + "v.model AS vehicle_model, v.plate_normalized AS vehicle_plate "
                        + "FROM trips t "
                        + "LEFT JOIN users rider ON rider.id = t.rider_user_id "
                        + "LEFT JOIN users u ON u.id = t.driver_user_id "
                        + "LEFT JOIN driver_vehicles v ON v.id = t.vehicle_id "
                        + "WHERE t.id = ?")) {
            statement.setLong(1, tripId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw tripNotFound();
                }
                Long distanceMeters = result.getObject("route_distance_meters", Long.class);
                Integer durationSeconds = result.getObject("estimated_duration_seconds", Integer.class);
                BigDecimal distanceKm = distanceMeters == null
                        ? null
                        : BigDecimal.valueOf(distanceMeters).divide(BigDecimal.valueOf(1000), 3,
                                java.math.RoundingMode.HALF_UP);
                Integer durationMinutes = durationSeconds == null
                        ? null
                        : (durationSeconds + 59) / 60;
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
                        result.getString("trip_notes"),
                        distanceKm,
                        distanceMeters,
                        durationMinutes,
                        durationSeconds,
                        result.getBigDecimal("estimated_fare"),
                        result.getString("routing_provider"),
                        result.getString("route_geometry"),
                        result.getString("fare_config_version"),
                        result.getBigDecimal("final_fare"),
                        result.getString("currency_code"),
                        loadHistory(connection, tripId),
                        instant(result, "created_at"),
                        instant(result, "updated_at"),
                        instant(result, "accepted_at"),
                        instant(result, "started_at"),
                        instant(result, "completed_at"),
                        instant(result, "cancelled_at"),
                        includeCustomerDetails ? Long.toString(result.getLong("customer_id")) : null,
                        includeCustomerDetails ? result.getString("customer_name") : null,
                        includeCustomerDetails ? result.getString("customer_phone") : null,
                        result.getString("driver_name"),
                        result.getString("driver_phone"),
                        result.getString("vehicle_model"),
                        result.getString("vehicle_plate"));
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
        return databaseFailure("persistence", exception);
    }

    private static WebApplicationException databaseFailure(String operation, SQLException exception) {
        LOG.errorf(exception, "Trip %s persistence failed (SQLSTATE=%s, vendorCode=%d)",
                operation, exception.getSQLState(), exception.getErrorCode());
        return new WebApplicationException(
                Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                        .entity(new TripResponses.Error("Trip operation could not be completed",
                                "trip_operation_failed"))
                        .build());
    }

    private record TripRow(String status, Long driverId, Long vehicleId, String vehicleType) {
    }
}

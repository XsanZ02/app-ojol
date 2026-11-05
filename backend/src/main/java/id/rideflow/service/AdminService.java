package id.rideflow.service;

import id.rideflow.dto.AdminResponses;
import id.rideflow.dto.TripResponses;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@ApplicationScoped
public class AdminService {

    private static final int MAX_PAGE_SIZE = 100;
    private static final List<String> PAYMENT_STATUSES = List.of("pending", "succeeded", "failed", "refunded");

    @Inject
    DataSource dataSource;

    @Transactional
    public AdminResponses.Dashboard dashboard() {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT "
                                + "(SELECT COUNT(*) FROM users) AS total_users, "
                                + "(SELECT COUNT(*) FROM driver_profiles) AS total_drivers, "
                                + "(SELECT COUNT(*) FROM driver_profiles dp JOIN users u ON u.id = dp.user_id "
                                + "WHERE dp.is_online AND dp.status = 'active' AND u.status = 'active') AS online_drivers, "
                                + "(SELECT COUNT(*) FROM trips) AS total_orders, "
                                + "(SELECT COUNT(*) FROM trips WHERE status IN "
                                + "('requested', 'accepted', 'picking_up', 'in_progress')) AS active_orders, "
                                + "(SELECT COUNT(*) FROM trips WHERE status = 'completed') AS completed_orders, "
                                + "(SELECT COALESCE(SUM(amount), 0) FROM payments "
                                + "WHERE status = 'succeeded' AND paid_at IS NOT NULL) AS revenue")) {
            long totalUsers;
            long totalDrivers;
            long onlineDrivers;
            long totalOrders;
            long activeOrders;
            long completedOrders;
            BigDecimal revenue;
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw new IllegalStateException("Dashboard statistics query returned no result");
                }
                totalUsers = result.getLong("total_users");
                totalDrivers = result.getLong("total_drivers");
                onlineDrivers = result.getLong("online_drivers");
                totalOrders = result.getLong("total_orders");
                activeOrders = result.getLong("active_orders");
                completedOrders = result.getLong("completed_orders");
                revenue = result.getBigDecimal("revenue");
            }
            return new AdminResponses.Dashboard(
                    totalUsers,
                    totalDrivers,
                    onlineDrivers,
                    totalOrders,
                    activeOrders,
                    completedOrders,
                    revenue,
                    recentOrders(connection, 8),
                    recentDriverActivity(connection, 6));
        } catch (SQLException exception) {
            throw new IllegalStateException("Admin dashboard query failed", exception);
        }
    }

    @Transactional
    public AdminResponses.UserPage listUsers(String search, int page, int size) {
        validatePagination(page, size);
        String normalizedSearch = normalizeSearch(search);
        long offset = offset(page, size);

        try (Connection connection = dataSource.getConnection()) {
            long total = countUsers(connection, normalizedSearch);
            List<AdminResponses.User> users = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT u.id, u.email, u.full_name, u.status, u.created_at, "
                            + "array_agg(upper(ur.role) ORDER BY ur.role) AS roles "
                            + "FROM users u "
                            + "JOIN user_roles ur ON ur.user_id = u.id "
                            + "WHERE (? IS NULL OR u.email ILIKE ? OR u.full_name ILIKE ?) "
                            + "GROUP BY u.id, u.email, u.full_name, u.status, u.created_at "
                            + "ORDER BY u.id DESC LIMIT ? OFFSET ?")) {
                bindSearch(statement, normalizedSearch);
                statement.setInt(4, size);
                statement.setLong(5, offset);
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) {
                        java.sql.Array rolesArray = result.getArray("roles");
                        try {
                            Object[] roleValues = (Object[]) rolesArray.getArray();
                            List<String> roles = Arrays.stream(roleValues)
                                    .map(String.class::cast)
                                    .toList();
                            users.add(new AdminResponses.User(
                                    Long.toString(result.getLong("id")),
                                    result.getString("email"),
                                    result.getString("full_name"),
                                    roles,
                                    result.getString("status"),
                                    instant(result, "created_at")));
                        } finally {
                            rolesArray.free();
                        }
                    }
                }
            }
            return new AdminResponses.UserPage(List.copyOf(users), total, page, size);
        } catch (SQLException exception) {
            throw new IllegalStateException("Admin user listing failed", exception);
        }
    }

    @Transactional
    public AdminResponses.User getUser(long userId) {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT u.id, u.email, u.full_name, u.status, u.created_at, "
                                + "array_agg(upper(ur.role) ORDER BY ur.role) AS roles "
                                + "FROM users u JOIN user_roles ur ON ur.user_id = u.id "
                                + "WHERE u.id = ? "
                                + "GROUP BY u.id, u.email, u.full_name, u.status, u.created_at")) {
            statement.setLong(1, userId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return null;
                }
                java.sql.Array rolesArray = result.getArray("roles");
                try {
                    List<String> roles = Arrays.stream((Object[]) rolesArray.getArray())
                            .map(String.class::cast)
                            .toList();
                    return new AdminResponses.User(
                            Long.toString(result.getLong("id")),
                            result.getString("email"),
                            result.getString("full_name"),
                            roles,
                            result.getString("status"),
                            instant(result, "created_at"));
                } finally {
                    rolesArray.free();
                }
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("Admin user detail query failed", exception);
        }
    }

    @Transactional
    public AdminResponses.DriverPage listDrivers(String search, String status, int page, int size) {
        validatePagination(page, size);
        String normalizedSearch = normalizeSearch(search);
        String normalizedStatus = normalizeDriverStatus(status);
        long offset = offset(page, size);
        try (Connection connection = dataSource.getConnection()) {
            long total;
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT COUNT(*) FROM driver_profiles dp JOIN users u ON u.id = dp.user_id "
                            + "WHERE (? IS NULL OR u.email ILIKE ? OR u.full_name ILIKE ?) "
                            + "AND (? IS NULL OR dp.status = ?)")) {
                bindSearch(statement, normalizedSearch);
                bindNullableString(statement, 4, normalizedStatus);
                bindNullableString(statement, 5, normalizedStatus);
                try (ResultSet result = statement.executeQuery()) {
                    result.next();
                    total = result.getLong(1);
                }
            }

            List<AdminResponses.Driver> drivers = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT u.id, u.full_name, u.email, u.status AS account_status, "
                            + "dp.status AS operational_status, dp.is_online, dp.created_at, dp.updated_at, "
                            + "(SELECT COUNT(*) FROM driver_vehicles v WHERE v.driver_user_id = u.id) AS vehicle_count, "
                            + "(SELECT COUNT(*) FROM trips t WHERE t.driver_user_id = u.id "
                            + "AND t.status = 'completed') AS completed_trips "
                            + "FROM driver_profiles dp JOIN users u ON u.id = dp.user_id "
                            + "WHERE (? IS NULL OR u.email ILIKE ? OR u.full_name ILIKE ?) "
                            + "AND (? IS NULL OR dp.status = ?) "
                            + "ORDER BY dp.updated_at DESC, u.id DESC LIMIT ? OFFSET ?")) {
                bindSearch(statement, normalizedSearch);
                bindNullableString(statement, 4, normalizedStatus);
                bindNullableString(statement, 5, normalizedStatus);
                statement.setInt(6, size);
                statement.setLong(7, offset);
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) {
                        drivers.add(mapDriver(result));
                    }
                }
            }
            return new AdminResponses.DriverPage(List.copyOf(drivers), total, page, size);
        } catch (SQLException exception) {
            throw new IllegalStateException("Admin driver listing failed", exception);
        }
    }

    @Transactional
    public AdminResponses.DriverDetail getDriver(long driverId) {
        try (Connection connection = dataSource.getConnection()) {
            AdminResponses.Driver driver;
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT u.id, u.full_name, u.email, u.status AS account_status, "
                            + "dp.status AS operational_status, dp.is_online, dp.created_at, dp.updated_at, "
                            + "(SELECT COUNT(*) FROM driver_vehicles v WHERE v.driver_user_id = u.id) AS vehicle_count, "
                            + "(SELECT COUNT(*) FROM trips t WHERE t.driver_user_id = u.id "
                            + "AND t.status = 'completed') AS completed_trips "
                            + "FROM driver_profiles dp JOIN users u ON u.id = dp.user_id WHERE u.id = ?")) {
                statement.setLong(1, driverId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        return null;
                    }
                    driver = mapDriver(result);
                }
            }

            List<AdminResponses.DriverVehicle> vehicles = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT id, vehicle_type, plate_normalized, make, model, color, "
                            + "verification_status, is_active FROM driver_vehicles "
                            + "WHERE driver_user_id = ? ORDER BY created_at DESC, id DESC")) {
                statement.setLong(1, driverId);
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) {
                        vehicles.add(new AdminResponses.DriverVehicle(
                                Long.toString(result.getLong("id")),
                                result.getString("vehicle_type"),
                                result.getString("plate_normalized"),
                                result.getString("make"),
                                result.getString("model"),
                                result.getString("color"),
                                result.getString("verification_status"),
                                result.getBoolean("is_active")));
                    }
                }
            }
            return new AdminResponses.DriverDetail(
                    driver, List.copyOf(vehicles), recentDriverOrders(connection, driverId, 10));
        } catch (SQLException exception) {
            throw new IllegalStateException("Admin driver detail query failed", exception);
        }
    }

    @Transactional
    public AdminResponses.OrderPage listOrders(String search, String status, int page, int size) {
        validatePagination(page, size);
        String normalizedSearch = normalizeSearch(search);
        String normalizedStatus = normalizeOrderStatus(status);
        long offset = offset(page, size);
        try (Connection connection = dataSource.getConnection()) {
            long total;
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT COUNT(*) FROM trips t "
                            + "JOIN users cu ON cu.id = t.rider_user_id "
                            + "LEFT JOIN users du ON du.id = t.driver_user_id "
                            + "WHERE (? IS NULL OR CAST(t.id AS TEXT) ILIKE ? "
                            + "OR cu.email ILIKE ? OR cu.full_name ILIKE ? "
                            + "OR du.email ILIKE ? OR du.full_name ILIKE ?) "
                            + "AND (? IS NULL OR t.status = ?)")) {
                bindOrderSearch(statement, normalizedSearch);
                bindNullableString(statement, 7, normalizedStatus);
                bindNullableString(statement, 8, normalizedStatus);
                try (ResultSet result = statement.executeQuery()) {
                    result.next();
                    total = result.getLong(1);
                }
            }

            List<AdminResponses.Order> orders = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    orderSelect()
                            + "WHERE (? IS NULL OR CAST(t.id AS TEXT) ILIKE ? "
                            + "OR cu.email ILIKE ? OR cu.full_name ILIKE ? "
                            + "OR du.email ILIKE ? OR du.full_name ILIKE ?) "
                            + "AND (? IS NULL OR t.status = ?) "
                            + "ORDER BY t.requested_at DESC, t.id DESC LIMIT ? OFFSET ?")) {
                bindOrderSearch(statement, normalizedSearch);
                bindNullableString(statement, 7, normalizedStatus);
                bindNullableString(statement, 8, normalizedStatus);
                statement.setInt(9, size);
                statement.setLong(10, offset);
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) {
                        orders.add(mapOrder(result));
                    }
                }
            }
            return new AdminResponses.OrderPage(List.copyOf(orders), total, page, size);
        } catch (SQLException exception) {
            throw new IllegalStateException("Admin order listing failed", exception);
        }
    }

    @Transactional
    public AdminResponses.OrderDetail getOrder(long tripId) {
        try (Connection connection = dataSource.getConnection()) {
            AdminResponses.Order order;
            try (PreparedStatement statement = connection.prepareStatement(
                    orderSelect() + "WHERE t.id = ?")) {
                statement.setLong(1, tripId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        return null;
                    }
                    order = mapOrder(result);
                }
            }
            List<TripResponses.StatusHistory> history = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT new_status, changed_at, reason FROM trip_status_history "
                            + "WHERE trip_id = ? ORDER BY changed_at, id")) {
                statement.setLong(1, tripId);
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) {
                        history.add(new TripResponses.StatusHistory(
                                result.getString("new_status"),
                                instant(result, "changed_at"),
                                result.getString("reason")));
                    }
                }
            }
            return new AdminResponses.OrderDetail(order, List.copyOf(history));
        } catch (SQLException exception) {
            throw new IllegalStateException("Admin order detail query failed", exception);
        }
    }

    @Transactional
    public AdminResponses.PaymentPage listPayments(String search, String status, int page, int size) {
        validatePagination(page, size);
        String normalizedSearch = normalizeSearch(search);
        String normalizedStatus = normalizePaymentStatus(status);
        long offset = offset(page, size);
        try (Connection connection = dataSource.getConnection()) {
            long total;
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT COUNT(*) " + paymentJoins()
                            + "WHERE (? IS NULL OR CAST(p.trip_id AS TEXT) ILIKE ? "
                            + "OR cu.full_name ILIKE ? OR cu.email ILIKE ? "
                            + "OR du.full_name ILIKE ? OR du.email ILIKE ?) "
                            + "AND (? IS NULL OR p.status = ?)")) {
                bindPaymentSearch(statement, normalizedSearch);
                bindNullableString(statement, 7, normalizedStatus);
                bindNullableString(statement, 8, normalizedStatus);
                try (ResultSet result = statement.executeQuery()) {
                    result.next();
                    total = result.getLong(1);
                }
            }

            List<AdminResponses.Payment> payments = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    paymentSelect()
                            + "WHERE (? IS NULL OR CAST(p.trip_id AS TEXT) ILIKE ? "
                            + "OR cu.full_name ILIKE ? OR cu.email ILIKE ? "
                            + "OR du.full_name ILIKE ? OR du.email ILIKE ?) "
                            + "AND (? IS NULL OR p.status = ?) "
                            + "ORDER BY p.created_at DESC, p.trip_id DESC LIMIT ? OFFSET ?")) {
                bindPaymentSearch(statement, normalizedSearch);
                bindNullableString(statement, 7, normalizedStatus);
                bindNullableString(statement, 8, normalizedStatus);
                statement.setInt(9, size);
                statement.setLong(10, offset);
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) {
                        payments.add(mapPayment(result));
                    }
                }
            }
            return new AdminResponses.PaymentPage(List.copyOf(payments), total, page, size);
        } catch (SQLException exception) {
            throw new IllegalStateException("Admin payment listing failed", exception);
        }
    }

    @Transactional
    public AdminResponses.PaymentReport paymentReport() {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(
                        "SELECT "
                                + "COUNT(*) FILTER (WHERE status = 'pending') AS pending_count, "
                                + "COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded_count, "
                                + "COUNT(*) FILTER (WHERE status = 'failed') AS failed_count, "
                                + "COUNT(*) FILTER (WHERE status = 'refunded') AS refunded_count, "
                                + "COALESCE(SUM(amount) FILTER "
                                + "(WHERE status = 'succeeded' AND paid_at IS NOT NULL), 0) AS succeeded_revenue, "
                                + "COALESCE(SUM(amount) FILTER "
                                + "(WHERE status = 'refunded' AND paid_at IS NOT NULL), 0) AS refunded_amount "
                                + "FROM payments")) {
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw new IllegalStateException("Payment report query returned no result");
                }
                return new AdminResponses.PaymentReport(
                        result.getLong("pending_count"),
                        result.getLong("succeeded_count"),
                        result.getLong("failed_count"),
                        result.getLong("refunded_count"),
                        result.getBigDecimal("succeeded_revenue"),
                        result.getBigDecimal("refunded_amount"));
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("Admin payment report query failed", exception);
        }
    }

    private static List<AdminResponses.RecentOrder> recentOrders(Connection connection, int limit)
            throws SQLException {
        List<AdminResponses.RecentOrder> orders = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT t.id, t.status, t.vehicle_type, cu.full_name AS customer_name, "
                        + "du.full_name AS driver_name, t.estimated_fare, t.final_fare, "
                        + "t.currency_code, t.requested_at "
                        + "FROM trips t JOIN users cu ON cu.id = t.rider_user_id "
                        + "LEFT JOIN users du ON du.id = t.driver_user_id "
                        + "ORDER BY t.requested_at DESC, t.id DESC LIMIT ?")) {
            statement.setInt(1, limit);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    orders.add(mapRecentOrder(result));
                }
            }
        }
        return List.copyOf(orders);
    }

    private static List<AdminResponses.RecentDriverActivity> recentDriverActivity(
            Connection connection, int limit) throws SQLException {
        List<AdminResponses.RecentDriverActivity> activity = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT u.id, u.full_name, u.email, dp.status AS operational_status, "
                        + "dp.is_online, dp.updated_at "
                        + "FROM driver_profiles dp JOIN users u ON u.id = dp.user_id "
                        + "ORDER BY dp.updated_at DESC, u.id DESC LIMIT ?")) {
            statement.setInt(1, limit);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    activity.add(new AdminResponses.RecentDriverActivity(
                            Long.toString(result.getLong("id")),
                            result.getString("full_name"),
                            result.getString("email"),
                            result.getString("operational_status"),
                            result.getBoolean("is_online"),
                            instant(result, "updated_at")));
                }
            }
        }
        return List.copyOf(activity);
    }

    private static List<AdminResponses.RecentOrder> recentDriverOrders(
            Connection connection, long driverId, int limit) throws SQLException {
        List<AdminResponses.RecentOrder> orders = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT t.id, t.status, t.vehicle_type, cu.full_name AS customer_name, "
                        + "du.full_name AS driver_name, t.estimated_fare, t.final_fare, "
                        + "t.currency_code, t.requested_at "
                        + "FROM trips t JOIN users cu ON cu.id = t.rider_user_id "
                        + "JOIN users du ON du.id = t.driver_user_id "
                        + "WHERE t.driver_user_id = ? ORDER BY t.requested_at DESC, t.id DESC LIMIT ?")) {
            statement.setLong(1, driverId);
            statement.setInt(2, limit);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    orders.add(mapRecentOrder(result));
                }
            }
        }
        return List.copyOf(orders);
    }

    private static AdminResponses.Driver mapDriver(ResultSet result) throws SQLException {
        return new AdminResponses.Driver(
                Long.toString(result.getLong("id")),
                result.getString("full_name"),
                result.getString("email"),
                result.getString("account_status"),
                result.getString("operational_status"),
                result.getBoolean("is_online"),
                result.getLong("vehicle_count"),
                result.getLong("completed_trips"),
                instant(result, "created_at"),
                instant(result, "updated_at"));
    }

    private static AdminResponses.Order mapOrder(ResultSet result) throws SQLException {
        return new AdminResponses.Order(
                Long.toString(result.getLong("id")),
                result.getString("status"),
                result.getString("vehicle_type"),
                Long.toString(result.getLong("customer_id")),
                result.getString("customer_name"),
                result.getString("customer_email"),
                nullableLongString(result, "driver_id"),
                result.getString("driver_name"),
                result.getString("driver_email"),
                result.getString("pickup_address"),
                result.getString("dropoff_address"),
                result.getBigDecimal("estimated_fare"),
                result.getBigDecimal("final_fare"),
                result.getString("currency_code"),
                instant(result, "requested_at"),
                instant(result, "accepted_at"),
                instant(result, "completed_at"));
    }

    private static AdminResponses.RecentOrder mapRecentOrder(ResultSet result) throws SQLException {
        return new AdminResponses.RecentOrder(
                Long.toString(result.getLong("id")),
                result.getString("status"),
                result.getString("vehicle_type"),
                result.getString("customer_name"),
                result.getString("driver_name"),
                result.getBigDecimal("estimated_fare"),
                result.getBigDecimal("final_fare"),
                result.getString("currency_code"),
                instant(result, "requested_at"));
    }

    private static AdminResponses.Payment mapPayment(ResultSet result) throws SQLException {
        return new AdminResponses.Payment(
                Long.toString(result.getLong("trip_id")),
                result.getString("method"),
                result.getString("status"),
                result.getBigDecimal("amount"),
                result.getString("currency_code"),
                result.getString("customer_name"),
                result.getString("driver_name"),
                instant(result, "paid_at"),
                instant(result, "created_at"));
    }

    private static String orderSelect() {
        return "SELECT t.id, t.status, t.vehicle_type, t.rider_user_id AS customer_id, "
                + "cu.full_name AS customer_name, cu.email AS customer_email, "
                + "t.driver_user_id AS driver_id, du.full_name AS driver_name, du.email AS driver_email, "
                + "t.pickup_address, t.dropoff_address, t.estimated_fare, t.final_fare, "
                + "t.currency_code, t.requested_at, t.accepted_at, t.completed_at "
                + "FROM trips t JOIN users cu ON cu.id = t.rider_user_id "
                + "LEFT JOIN users du ON du.id = t.driver_user_id ";
    }

    private static String paymentSelect() {
        return "SELECT p.trip_id, p.method, p.status, p.amount, p.currency_code, "
                + "cu.full_name AS customer_name, du.full_name AS driver_name, "
                + "p.paid_at, p.created_at "
                + paymentJoins();
    }

    private static String paymentJoins() {
        return "FROM payments p "
                + "JOIN trips t ON t.id = p.trip_id "
                + "JOIN users cu ON cu.id = t.rider_user_id "
                + "LEFT JOIN users du ON du.id = t.driver_user_id ";
    }

    private static void validatePagination(int page, int size) {
        if (page < 1 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException("Invalid admin pagination");
        }
    }

    private static long offset(int page, int size) {
        return Math.multiplyExact((long) page - 1, size);
    }

    private static String normalizeSearch(String search) {
        return search == null || search.isBlank() ? null : search.trim();
    }

    private static String normalizeDriverStatus(String status) {
        if (status == null || status.isBlank()) return null;
        String value = status.trim().toLowerCase();
        if (!List.of("pending", "active", "suspended").contains(value)) {
            throw new IllegalArgumentException("Invalid driver status filter");
        }
        return value;
    }

    private static String normalizeOrderStatus(String status) {
        if (status == null || status.isBlank()) return null;
        String value = status.trim().toLowerCase();
        if (!List.of("requested", "accepted", "picking_up", "in_progress", "completed", "cancelled")
                .contains(value)) {
            throw new IllegalArgumentException("Invalid order status filter");
        }
        return value;
    }

    private static String normalizePaymentStatus(String status) {
        if (status == null || status.isBlank()) return null;
        String value = status.trim().toLowerCase();
        if (!PAYMENT_STATUSES.contains(value)) {
            throw new IllegalArgumentException("Invalid payment status filter");
        }
        return value;
    }

    private static void bindSearch(PreparedStatement statement, String search) throws SQLException {
        bindNullableString(statement, 1, search);
        bindNullableString(statement, 2, search == null ? null : "%" + search + "%");
        bindNullableString(statement, 3, search == null ? null : "%" + search + "%");
    }

    private static void bindOrderSearch(PreparedStatement statement, String search) throws SQLException {
        bindNullableString(statement, 1, search);
        String pattern = search == null ? null : "%" + search + "%";
        for (int index = 2; index <= 6; index++) {
            bindNullableString(statement, index, pattern);
        }
    }

    private static void bindPaymentSearch(PreparedStatement statement, String search) throws SQLException {
        bindNullableString(statement, 1, search);
        String pattern = search == null ? null : "%" + search + "%";
        for (int index = 2; index <= 6; index++) {
            bindNullableString(statement, index, pattern);
        }
    }

    private static void bindNullableString(PreparedStatement statement, int index, String value)
            throws SQLException {
        if (value == null) {
            statement.setNull(index, Types.VARCHAR);
        } else {
            statement.setString(index, value);
        }
    }

    private static String nullableLongString(ResultSet result, String column) throws SQLException {
        long value = result.getLong(column);
        return result.wasNull() ? null : Long.toString(value);
    }

    private static String instant(ResultSet result, String column) throws SQLException {
        OffsetDateTime value = result.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant().toString();
    }

    private static long countUsers(Connection connection, String search) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT COUNT(DISTINCT u.id) FROM users u "
                        + "JOIN user_roles ur ON ur.user_id = u.id "
                        + "WHERE (? IS NULL OR u.email ILIKE ? OR u.full_name ILIKE ?)")) {
            bindSearch(statement, search);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw new IllegalStateException("User count query returned no result");
                }
                return result.getLong(1);
            }
        }
    }
}

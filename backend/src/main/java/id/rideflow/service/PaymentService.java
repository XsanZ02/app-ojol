package id.rideflow.service;

import id.rideflow.dto.PaymentRequests;
import id.rideflow.dto.PaymentResponses;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;

@ApplicationScoped
public class PaymentService {

    private static final Logger LOG = Logger.getLogger(PaymentService.class);

    @Inject
    DataSource dataSource;

    @Transactional
    public PaymentResponses.Payment get(String subject, long tripId) {
        long customerId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            requireActiveCustomer(connection, customerId);
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT p.trip_id, p.method, p.status, p.amount, p.currency_code, p.paid_at, "
                            + "p.created_at, p.updated_at "
                            + "FROM payments p JOIN trips t ON t.id = p.trip_id "
                            + "WHERE p.trip_id = ? AND t.rider_user_id = ?")) {
                statement.setLong(1, tripId);
                statement.setLong(2, customerId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw paymentNotFound();
                    }
                    return mapPayment(result);
                }
            }
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public CreateResult create(String subject, long tripId, PaymentRequests.Create request) {
        long customerId = parseSubject(subject);
        String method = request.method();
        try (Connection connection = dataSource.getConnection()) {
            requireActiveCustomer(connection, customerId);
            TripPaymentSource trip = lockCompletedCustomerTrip(connection, tripId, customerId);
            if (trip == null) {
                throw paymentNotFound();
            }

            PaymentResponses.Payment existing = findPayment(connection, tripId);
            if (existing != null) {
                if (!existing.method().equals(method)) {
                    throw paymentConflict();
                }
                return new CreateResult(existing, false);
            }

            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO payments (trip_id, method, status, amount, currency_code) "
                            + "VALUES (?, ?, 'pending', ?, ?) RETURNING trip_id")) {
                statement.setLong(1, tripId);
                statement.setString(2, method);
                statement.setBigDecimal(3, trip.finalFare());
                statement.setString(4, trip.currencyCode());
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw new IllegalStateException("Payment insert did not return a row");
                    }
                }
            }
            PaymentResponses.Payment payment = findPayment(connection, tripId);
            if (payment == null) {
                throw new IllegalStateException("Payment insert did not persist");
            }
            return new CreateResult(payment, true);
        } catch (SQLException exception) {
            if ("23505".equals(exception.getSQLState())) {
                throw paymentConflict();
            }
            if ("23514".equals(exception.getSQLState())) {
                throw invalidPayment();
            }
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public PaymentResponses.Payment confirmCash(String subject, long tripId) {
        long driverId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            requireActiveDriver(connection, driverId);
            TripPaymentSource trip = lockAssignedCompletedTrip(connection, tripId, driverId);
            if (trip == null) {
                throw paymentNotFound();
            }
            PaymentResponses.Payment payment = findPayment(connection, tripId);
            if (payment == null || !"cash".equals(payment.method())) {
                throw paymentNotFound();
            }
            if ("succeeded".equals(payment.status())) {
                return payment;
            }
            if (!"pending".equals(payment.status())) {
                throw paymentConflict();
            }

            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE payments SET status = 'succeeded', paid_at = statement_timestamp() "
                            + "WHERE trip_id = ? AND method = 'cash' AND status = 'pending'")) {
                statement.setLong(1, tripId);
                if (statement.executeUpdate() != 1) {
                    throw paymentConflict();
                }
            }
            return findPayment(connection, tripId);
        } catch (SQLException exception) {
            if ("23514".equals(exception.getSQLState())) {
                throw paymentConflict();
            }
            throw databaseFailure(exception);
        }
    }

    private static TripPaymentSource lockCompletedCustomerTrip(
            Connection connection, long tripId, long customerId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT final_fare, currency_code FROM trips "
                        + "WHERE id = ? AND rider_user_id = ? AND status = 'completed' FOR UPDATE")) {
            statement.setLong(1, tripId);
            statement.setLong(2, customerId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return null;
                }
                return new TripPaymentSource(result.getBigDecimal("final_fare"),
                        result.getString("currency_code"));
            }
        }
    }

    private static TripPaymentSource lockAssignedCompletedTrip(
            Connection connection, long tripId, long driverId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT final_fare, currency_code FROM trips "
                        + "WHERE id = ? AND driver_user_id = ? AND status = 'completed' FOR UPDATE")) {
            statement.setLong(1, tripId);
            statement.setLong(2, driverId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return null;
                }
                return new TripPaymentSource(result.getBigDecimal("final_fare"),
                        result.getString("currency_code"));
            }
        }
    }

    private static PaymentResponses.Payment findPayment(Connection connection, long tripId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT trip_id, method, status, amount, currency_code, paid_at, created_at, updated_at "
                        + "FROM payments WHERE trip_id = ?")) {
            statement.setLong(1, tripId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? mapPayment(result) : null;
            }
        }
    }

    private static PaymentResponses.Payment mapPayment(ResultSet result) throws SQLException {
        return new PaymentResponses.Payment(
                Long.toString(result.getLong("trip_id")),
                result.getString("method"),
                result.getString("status"),
                result.getBigDecimal("amount"),
                result.getString("currency_code"),
                instant(result, "paid_at"),
                instant(result, "created_at"),
                instant(result, "updated_at"));
    }

    private static String instant(ResultSet result, String column) throws SQLException {
        OffsetDateTime timestamp = result.getObject(column, OffsetDateTime.class);
        return timestamp == null ? null : timestamp.toInstant().toString();
    }

    private static void requireActiveCustomer(Connection connection, long userId) throws SQLException {
        requireActiveRole(connection, userId, "customer");
    }

    private static void requireActiveDriver(Connection connection, long userId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT u.status, dp.status AS profile_status "
                        + "FROM users u "
                        + "JOIN user_roles r ON r.user_id = u.id AND r.role = 'driver' "
                        + "JOIN driver_profiles dp ON dp.user_id = u.id WHERE u.id = ?")) {
            statement.setLong(1, userId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()
                        || !"active".equals(result.getString("status"))
                        || !"active".equals(result.getString("profile_status"))) {
                    throw paymentForbidden();
                }
            }
        }
    }

    private static void requireActiveRole(Connection connection, long userId, String role) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT u.status FROM users u "
                        + "JOIN user_roles r ON r.user_id = u.id AND r.role = ? WHERE u.id = ?")) {
            statement.setString(1, role);
            statement.setLong(2, userId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next() || !"active".equals(result.getString("status"))) {
                    throw paymentForbidden();
                }
            }
        }
    }

    private static long parseSubject(String subject) {
        try {
            long userId = Long.parseLong(subject);
            if (userId <= 0) {
                throw new NumberFormatException("Subject must be positive");
            }
            return userId;
        } catch (NumberFormatException exception) {
            throw new WebApplicationException(
                    Response.status(Response.Status.UNAUTHORIZED)
                            .entity(new PaymentResponses.Error("Authentication is required", "unauthorized"))
                            .build());
        }
    }

    private static WebApplicationException paymentNotFound() {
        return error(Response.Status.NOT_FOUND, "Payment was not found", "payment_not_found");
    }

    private static WebApplicationException paymentForbidden() {
        return error(Response.Status.FORBIDDEN, "Payment operation is not available", "payment_forbidden");
    }

    private static WebApplicationException paymentConflict() {
        return error(Response.Status.CONFLICT, "Payment operation conflicts with current state", "payment_conflict");
    }

    private static WebApplicationException invalidPayment() {
        return error(Response.Status.BAD_REQUEST, "Payment method is invalid", "invalid_payment");
    }

    private static WebApplicationException error(Response.Status status, String message, String code) {
        return new WebApplicationException(
                Response.status(status).entity(new PaymentResponses.Error(message, code)).build());
    }

    private static WebApplicationException databaseFailure(SQLException exception) {
        LOG.error("Payment persistence operation failed", exception);
        return new WebApplicationException(
                Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                        .entity(new PaymentResponses.Error("Payment operation could not be completed",
                                "payment_operation_failed"))
                        .build());
    }

    private record TripPaymentSource(java.math.BigDecimal finalFare, String currencyCode) {
    }

    public record CreateResult(PaymentResponses.Payment payment, boolean created) {
    }
}

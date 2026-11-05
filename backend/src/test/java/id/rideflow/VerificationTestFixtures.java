package id.rideflow;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

final class VerificationTestFixtures {

    private VerificationTestFixtures() {
    }

    static void approveProfile(Connection connection, long driverId, boolean online) throws SQLException {
        connection.setAutoCommit(false);
        try {
            addAdminRole(connection, driverId);

            int version;
            java.time.OffsetDateTime reviewedAt;
            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE driver_profiles SET status = 'active', verification_status = 'approved', "
                            + "reviewer_admin_id = ?, reviewer_role = 'admin', "
                            + "reviewed_at = statement_timestamp(), rejection_reason = NULL, "
                            + "review_metadata_legacy = FALSE, is_online = ? "
                            + "WHERE user_id = ? RETURNING submission_version, reviewed_at")) {
                statement.setLong(1, driverId);
                statement.setBoolean(2, online);
                statement.setLong(3, driverId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw new SQLException("Test driver profile was not found");
                    }
                    version = result.getInt("submission_version");
                    reviewedAt = result.getObject("reviewed_at", java.time.OffsetDateTime.class);
                }
            }

            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO driver_profile_verification_events "
                            + "(driver_user_id, submission_version, decision, reviewer_admin_id, "
                            + "reviewer_role, reviewed_at) VALUES (?, ?, 'approved', ?, 'admin', ?)")) {
                statement.setLong(1, driverId);
                statement.setInt(2, version);
                statement.setLong(3, driverId);
                statement.setObject(4, reviewedAt);
                statement.executeUpdate();
            }
            connection.commit();
        } catch (SQLException exception) {
            connection.rollback();
            throw exception;
        }
    }

    static void approveVehicle(Connection connection, long vehicleId, long driverId, boolean active)
            throws SQLException {
        connection.setAutoCommit(false);
        try {
            addAdminRole(connection, driverId);

            int version;
            java.time.OffsetDateTime reviewedAt;
            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE driver_vehicles SET verification_status = 'verified', "
                            + "reviewer_admin_id = ?, reviewer_role = 'admin', "
                            + "reviewed_at = statement_timestamp(), rejection_reason = NULL, "
                            + "review_metadata_legacy = FALSE, is_active = ? "
                            + "WHERE id = ? AND driver_user_id = ? "
                            + "RETURNING verification_version, reviewed_at")) {
                statement.setLong(1, driverId);
                statement.setBoolean(2, active);
                statement.setLong(3, vehicleId);
                statement.setLong(4, driverId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw new SQLException("Test driver vehicle was not found");
                    }
                    version = result.getInt("verification_version");
                    reviewedAt = result.getObject("reviewed_at", java.time.OffsetDateTime.class);
                }
            }

            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO driver_vehicle_verification_events "
                            + "(vehicle_id, verification_version, decision, reviewer_admin_id, "
                            + "reviewer_role, reviewed_at) VALUES (?, ?, 'verified', ?, 'admin', ?)")) {
                statement.setLong(1, vehicleId);
                statement.setInt(2, version);
                statement.setLong(3, driverId);
                statement.setObject(4, reviewedAt);
                statement.executeUpdate();
            }
            connection.commit();
        } catch (SQLException exception) {
            connection.rollback();
            throw exception;
        }
    }

    private static void addAdminRole(Connection connection, long userId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO user_roles (user_id, role) VALUES (?, 'admin') ON CONFLICT DO NOTHING")) {
            statement.setLong(1, userId);
            statement.executeUpdate();
        }
    }
}

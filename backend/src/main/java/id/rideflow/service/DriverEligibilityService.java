package id.rideflow.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalLong;

@ApplicationScoped
public class DriverEligibilityService {

    private static final String V3_QUERY = """
            SELECT u.status AS account_status,
                   EXISTS (
                       SELECT 1 FROM user_roles ur
                       WHERE ur.user_id = u.id AND ur.role = 'driver'
                   ) AS has_driver_role,
                   dp.status AS profile_status,
                   dp.is_online,
                   v.id AS vehicle_id,
                   v.vehicle_type,
                   v.is_active AS vehicle_active,
                   v.verification_status AS vehicle_status
            FROM users u
            JOIN driver_profiles dp ON dp.user_id = u.id
            JOIN driver_vehicles v ON v.driver_user_id = u.id
            WHERE u.id = ?
              AND (CAST(? AS VARCHAR) IS NULL OR v.vehicle_type = ?)
              AND u.status = 'active'
              AND EXISTS (
                  SELECT 1 FROM user_roles ur
                  WHERE ur.user_id = u.id AND ur.role = 'driver'
              )
              AND dp.status = 'active'
              AND (NOT ? OR dp.is_online)
              AND v.is_active
              AND v.verification_status = 'verified'
            ORDER BY v.id
            """;

    private static final String V4_QUERY = """
            SELECT u.status AS account_status,
                   EXISTS (
                       SELECT 1 FROM user_roles ur
                       WHERE ur.user_id = u.id AND ur.role = 'driver'
                   ) AS has_driver_role,
                   dp.status AS profile_status,
                   dp.is_online,
                   dp.verification_status AS profile_verification_status,
                   EXISTS (
                       SELECT 1
                       FROM driver_profile_verification_events e
                       WHERE e.driver_user_id = u.id
                         AND e.submission_version = dp.submission_version
                         AND e.decision = 'approved'
                   ) AS profile_approval_recorded,
                   NOT EXISTS (
                       SELECT 1
                       FROM driver_order_acceptance_holds h
                       WHERE h.driver_user_id = u.id
                         AND h.status = 'draining'
                   ) AS no_draining_hold,
                   NOT EXISTS (
                       SELECT 1
                       FROM driver_order_acceptance_holds h
                       WHERE h.driver_user_id = u.id
                         AND h.status = 'held'
                   ) AS no_held_hold,
                   (
                       SELECT COUNT(*) = 0
                       FROM (VALUES ('ktp'), ('sim')) AS req(document_type)
                       WHERE NOT EXISTS (
                           SELECT 1
                           FROM driver_documents d
                           WHERE d.driver_user_id = u.id
                             AND d.document_type = req.document_type
                             AND d.vehicle_id IS NULL
                             AND d.document_version = (
                                 SELECT MAX(latest.document_version)
                                 FROM driver_documents latest
                                 WHERE latest.driver_user_id = d.driver_user_id
                                   AND latest.document_type = d.document_type
                                   AND latest.vehicle_id IS NULL
                             )
                             AND d.verification_status = 'verified'
                             AND EXISTS (
                                 SELECT 1
                                 FROM driver_document_verification_events e
                                 WHERE e.document_id = d.id
                                   AND e.decision = 'verified'
                             )
                       )
                   ) AS profile_documents_verified,
                   v.id AS vehicle_id,
                   v.vehicle_type,
                   v.is_active AS vehicle_active,
                   v.verification_status AS vehicle_status,
                   EXISTS (
                       SELECT 1
                       FROM driver_vehicle_verification_events e
                       WHERE e.vehicle_id = v.id
                         AND e.verification_version = v.verification_version
                         AND e.decision = 'verified'
                   ) AS vehicle_approval_recorded,
                   (
                       SELECT COUNT(*) = 0
                       FROM (VALUES ('stnk'), ('vehicle_photo')) AS req(document_type)
                       WHERE NOT EXISTS (
                           SELECT 1
                           FROM driver_documents d
                           WHERE d.driver_user_id = u.id
                             AND d.vehicle_id = v.id
                             AND d.document_type = req.document_type
                             AND d.document_version = (
                                 SELECT MAX(latest.document_version)
                                 FROM driver_documents latest
                                 WHERE latest.vehicle_id = d.vehicle_id
                                   AND latest.document_type = d.document_type
                             )
                             AND d.verification_status = 'verified'
                             AND EXISTS (
                                 SELECT 1
                                 FROM driver_document_verification_events e
                                 WHERE e.document_id = d.id
                                   AND e.decision = 'verified'
                             )
                       )
                   ) AS vehicle_documents_verified
            FROM users u
            JOIN driver_profiles dp ON dp.user_id = u.id
            JOIN driver_vehicles v ON v.driver_user_id = u.id
            WHERE u.id = ?
              AND (CAST(? AS VARCHAR) IS NULL OR v.vehicle_type = ?)
              AND u.status = 'active'
              AND EXISTS (
                  SELECT 1 FROM user_roles ur
                  WHERE ur.user_id = u.id AND ur.role = 'driver'
              )
              AND dp.status = 'active'
              AND (NOT ? OR dp.is_online)
              AND v.is_active
              AND v.verification_status = 'verified'
              AND dp.verification_status = 'approved'
              AND EXISTS (
                  SELECT 1
                  FROM driver_profile_verification_events e
                  WHERE e.driver_user_id = u.id
                    AND e.submission_version = dp.submission_version
                    AND e.decision = 'approved'
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM driver_order_acceptance_holds h
                  WHERE h.driver_user_id = u.id
                    AND h.status IN ('draining', 'held')
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM (VALUES ('ktp'), ('sim')) AS req(document_type)
                  WHERE NOT EXISTS (
                      SELECT 1
                      FROM driver_documents d
                      WHERE d.driver_user_id = u.id
                        AND d.document_type = req.document_type
                        AND d.vehicle_id IS NULL
                        AND d.document_version = (
                            SELECT MAX(latest.document_version)
                            FROM driver_documents latest
                            WHERE latest.driver_user_id = d.driver_user_id
                              AND latest.document_type = d.document_type
                              AND latest.vehicle_id IS NULL
                        )
                        AND d.verification_status = 'verified'
                        AND EXISTS (
                            SELECT 1
                            FROM driver_document_verification_events e
                            WHERE e.document_id = d.id
                              AND e.decision = 'verified'
                        )
                  )
              )
              AND EXISTS (
                  SELECT 1
                  FROM driver_vehicle_verification_events e
                  WHERE e.vehicle_id = v.id
                    AND e.verification_version = v.verification_version
                    AND e.decision = 'verified'
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM (VALUES ('stnk'), ('vehicle_photo')) AS req(document_type)
                  WHERE NOT EXISTS (
                      SELECT 1
                      FROM driver_documents d
                      WHERE d.driver_user_id = u.id
                        AND d.vehicle_id = v.id
                        AND d.document_type = req.document_type
                        AND d.document_version = (
                            SELECT MAX(latest.document_version)
                            FROM driver_documents latest
                            WHERE latest.vehicle_id = d.vehicle_id
                              AND latest.document_type = d.document_type
                        )
                        AND d.verification_status = 'verified'
                        AND EXISTS (
                            SELECT 1
                            FROM driver_document_verification_events e
                            WHERE e.document_id = d.id
                              AND e.decision = 'verified'
                        )
                  )
              )
            ORDER BY v.id
            """;

    // V4 tables exist only after migration validation; keep the rollout flag off until then.
    private final boolean v4Enabled;

    @Inject
    public DriverEligibilityService(
            @ConfigProperty(name = "rideflow.driver-verification.v4-enabled", defaultValue = "false")
            boolean v4Enabled) {
        this.v4Enabled = v4Enabled;
    }

    public OptionalLong findEligibleVehicle(
            Connection connection,
            long driverId,
            String vehicleType,
            boolean requireOnline,
            boolean lockVehicle) throws SQLException {
        List<EligibleVehicle> vehicles =
                queryEligibleVehicles(connection, driverId, vehicleType, requireOnline, lockVehicle);
        return vehicles.isEmpty() ? OptionalLong.empty() : OptionalLong.of(vehicles.get(0).id());
    }

    public boolean isEligibleVehicle(
            Connection connection,
            long driverId,
            long vehicleId,
            String vehicleType,
            boolean requireOnline) throws SQLException {
        return queryEligibleVehicles(connection, driverId, vehicleType, requireOnline, false)
                .stream()
                .anyMatch(vehicle -> vehicle.id() == vehicleId);
    }

    public boolean lockDriverProfile(Connection connection, long driverId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT user_id FROM driver_profiles WHERE user_id = ? FOR UPDATE")) {
            statement.setLong(1, driverId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next();
            }
        }
    }

    public boolean lockVehicle(Connection connection, long driverId, long vehicleId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT id FROM driver_vehicles WHERE driver_user_id = ? AND id = ? FOR UPDATE")) {
            statement.setLong(1, driverId);
            statement.setLong(2, vehicleId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next();
            }
        }
    }

    public List<String> findEligibleVehicleTypes(
            Connection connection,
            long driverId,
            boolean requireOnline) throws SQLException {
        return queryEligibleVehicles(connection, driverId, null, requireOnline, false)
                .stream()
                .map(EligibleVehicle::type)
                .distinct()
                .toList();
    }

    public boolean isAssignedTripDraining(
            Connection connection,
            long driverId,
            long tripId) throws SQLException {
        if (!v4Enabled) {
            return false;
        }

        // Acceptance and hold creation serialize on driver_profiles; draining therefore means
        // this active assignment existed before the hold was inserted.
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT EXISTS ("
                        + "SELECT 1 FROM driver_order_acceptance_holds h "
                        + "WHERE h.driver_user_id = ? AND h.status = 'draining') AS has_draining_hold, "
                        + "t.driver_user_id AS assigned_driver_id, t.status AS trip_status, "
                        + "COALESCE(t.accepted_at IS NOT NULL, FALSE) AS acceptance_recorded, "
                        + "EXISTS (SELECT 1 FROM users u "
                        + "JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'driver' "
                        + "JOIN driver_profiles dp ON dp.user_id = u.id "
                        + "WHERE u.id = ? AND u.status = 'active' AND dp.status = 'active') AS driver_active "
                        + "FROM (VALUES (1)) AS anchor(dummy) "
                        + "LEFT JOIN trips t ON t.id = ?")) {
            statement.setLong(1, driverId);
            statement.setLong(2, driverId);
            statement.setLong(3, tripId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return false;
                }
                long assignedDriverIdValue = result.getLong("assigned_driver_id");
                Long assignedDriverId = result.wasNull() ? null : assignedDriverIdValue;
                return allowsDrainingTripProgress(
                        v4Enabled,
                        result.getBoolean("has_draining_hold"),
                        assignedDriverId,
                        driverId,
                        result.getString("trip_status"),
                        result.getBoolean("acceptance_recorded"),
                        result.getBoolean("driver_active"));
            }
        }
    }

    private List<EligibleVehicle> queryEligibleVehicles(
            Connection connection,
            long driverId,
            String vehicleType,
            boolean requireOnline,
            boolean lockVehicle) throws SQLException {
        String query = queryFor(v4Enabled);
        if (lockVehicle) {
            query += " LIMIT 1 FOR UPDATE OF v";
        }

        List<EligibleVehicle> eligibleVehicles = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(query)) {
            statement.setLong(1, driverId);
            statement.setString(2, vehicleType);
            statement.setString(3, vehicleType);
            statement.setBoolean(4, requireOnline);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    EligibilitySnapshot snapshot = new EligibilitySnapshot(
                            result.getString("account_status"),
                            result.getBoolean("has_driver_role"),
                            result.getString("profile_status"),
                            result.getBoolean("is_online"),
                            v4Enabled ? result.getString("profile_verification_status") : null,
                            !v4Enabled || result.getBoolean("profile_approval_recorded"),
                            !v4Enabled || result.getBoolean("profile_documents_verified"),
                            !v4Enabled || result.getBoolean("no_draining_hold"),
                            !v4Enabled || result.getBoolean("no_held_hold"),
                            result.getString("vehicle_status"),
                            result.getBoolean("vehicle_active"),
                            !v4Enabled || result.getBoolean("vehicle_approval_recorded"),
                            !v4Enabled || result.getBoolean("vehicle_documents_verified"));
                    if (isEligible(snapshot, v4Enabled, requireOnline)) {
                        eligibleVehicles.add(new EligibleVehicle(
                                result.getLong("vehicle_id"),
                                result.getString("vehicle_type")));
                        if (lockVehicle) {
                            break;
                        }
                    }
                }
            }
        }
        return List.copyOf(eligibleVehicles);
    }

    static String queryFor(boolean v4Enabled) {
        return v4Enabled ? V4_QUERY : V3_QUERY;
    }

    static boolean isEligible(
            EligibilitySnapshot snapshot,
            boolean v4Enabled,
            boolean requireOnline) {
        if (!"active".equals(snapshot.accountStatus())
                || !snapshot.hasDriverRole()
                || !"active".equals(snapshot.profileStatus())
                || (requireOnline && !snapshot.online())
                || !snapshot.vehicleActive()
                || !"verified".equals(snapshot.vehicleStatus())) {
            return false;
        }

        return !v4Enabled
                || ("approved".equals(snapshot.profileVerificationStatus())
                        && snapshot.profileApprovalRecorded()
                        && snapshot.profileDocumentsVerified()
                        && snapshot.noDrainingHold()
                        && snapshot.noHeldHold()
                        && snapshot.vehicleApprovalRecorded()
                        && snapshot.vehicleDocumentsVerified());
    }

    static boolean allowsDrainingTripProgress(
            boolean v4Enabled,
            boolean hasDrainingHold,
            Long assignedDriverId,
            long driverId,
            String tripStatus,
            boolean acceptanceRecorded,
            boolean driverActive) {
        return v4Enabled
                && hasDrainingHold
                && assignedDriverId != null
                && assignedDriverId == driverId
                && acceptanceRecorded
                && ("accepted".equals(tripStatus)
                        || "picking_up".equals(tripStatus)
                        || "in_progress".equals(tripStatus))
                && driverActive;
    }

    static boolean allowsAssignedTripProgress(boolean eligible, boolean drainingTrip) {
        return eligible || drainingTrip;
    }

    record EligibleVehicle(long id, String type) {
    }

    record EligibilitySnapshot(
            String accountStatus,
            boolean hasDriverRole,
            String profileStatus,
            boolean online,
            String profileVerificationStatus,
            boolean profileApprovalRecorded,
            boolean profileDocumentsVerified,
            boolean noDrainingHold,
            boolean noHeldHold,
            String vehicleStatus,
            boolean vehicleActive,
            boolean vehicleApprovalRecorded,
            boolean vehicleDocumentsVerified) {
    }
}

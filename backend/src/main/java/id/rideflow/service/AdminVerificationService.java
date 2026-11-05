package id.rideflow.service;

import id.rideflow.dto.VerificationRequests;
import id.rideflow.dto.VerificationResponses;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@ApplicationScoped
public class AdminVerificationService {

    private static final Logger LOG = Logger.getLogger(AdminVerificationService.class);

    @Inject
    DataSource dataSource;

    @Transactional
    public VerificationResponses.Queue queue() {
        try (Connection connection = dataSource.getConnection()) {
            return new VerificationResponses.Queue(
                    pendingProfiles(connection),
                    pendingVehicles(connection),
                    pendingDocuments(connection));
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public VerificationResponses.DriverDetail driverDetail(long driverId) {
        try (Connection connection = dataSource.getConnection()) {
            VerificationResponses.Profile profile = findProfile(connection, driverId);
            if (profile == null) {
                return null;
            }
            return new VerificationResponses.DriverDetail(
                    profile,
                    findVehicles(connection, driverId),
                    findDocuments(connection, driverId),
                    findHistory(connection, driverId));
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public VerificationResponses.Profile decideProfile(
            String reviewerSubject, long driverId, VerificationRequests.Decision request) {
            long reviewerId = parseSubject(reviewerSubject);
            Decision decision = decision(request);
            try (Connection connection = dataSource.getConnection()) {
            int version;
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT submission_version FROM driver_profiles "
                            + "WHERE user_id = ? AND verification_status = 'pending' FOR UPDATE")) {
                statement.setLong(1, driverId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw decisionConflict();
                    }
                    version = result.getInt("submission_version");
                }
            }
            if ("approved".equals(decision.value()) && !profileDocumentsVerified(connection, driverId)) {
                throw requirementsIncomplete("KTP dan SIM terbaru harus disetujui sebelum profil driver.");
            }

            OffsetDateTime reviewedAt;
            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE driver_profiles SET verification_status = ?, "
                            + "status = CASE WHEN ? = 'approved' AND status = 'pending' "
                            + "THEN 'active' ELSE status END, reviewer_admin_id = ?, "
                            + "reviewer_role = 'admin', reviewed_at = statement_timestamp(), "
                            + "rejection_reason = ?, review_metadata_legacy = FALSE "
                            + "WHERE user_id = ? AND verification_status = 'pending' "
                            + "RETURNING reviewed_at")) {
                statement.setString(1, decision.value());
                statement.setString(2, decision.value());
                statement.setLong(3, reviewerId);
                statement.setString(4, decision.reason());
                statement.setLong(5, driverId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw decisionConflict();
                    }
                    reviewedAt = result.getObject("reviewed_at", OffsetDateTime.class);
                }
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO driver_profile_verification_events "
                            + "(driver_user_id, submission_version, decision, reviewer_admin_id, "
                            + "reviewer_role, reviewed_at, rejection_reason) VALUES (?, ?, ?, ?, 'admin', ?, ?)")) {
                statement.setLong(1, driverId);
                statement.setInt(2, version);
                statement.setString(3, decision.value());
                statement.setLong(4, reviewerId);
                statement.setObject(5, reviewedAt);
                statement.setString(6, decision.reason());
                statement.executeUpdate();
            }
            return findProfile(connection, driverId);
        } catch (SQLException exception) {
            throw mapDecisionFailure(exception);
        }
    }

    @Transactional
    public VerificationResponses.Vehicle decideVehicle(
            String reviewerSubject, long vehicleId, VerificationRequests.Decision request) {
        long reviewerId = parseSubject(reviewerSubject);
        Decision decision = decision(request);
            String databaseDecision = "approved".equals(decision.value()) ? "verified" : "rejected";
        try (Connection connection = dataSource.getConnection()) {
            long driverId;
            int version;
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT driver_user_id, verification_version FROM driver_vehicles "
                            + "WHERE id = ? AND verification_status = 'pending' FOR UPDATE")) {
                statement.setLong(1, vehicleId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw decisionConflict();
                    }
                    driverId = result.getLong("driver_user_id");
                    version = result.getInt("verification_version");
                }
            }
            if ("verified".equals(databaseDecision) && !vehicleDocumentsVerified(connection, driverId, vehicleId)) {
                throw requirementsIncomplete("STNK dan foto kendaraan terbaru harus disetujui terlebih dahulu.");
            }

            OffsetDateTime reviewedAt;
            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE driver_vehicles SET verification_status = ?, reviewer_admin_id = ?, "
                            + "reviewer_role = 'admin', reviewed_at = statement_timestamp(), "
                            + "rejection_reason = ?, review_metadata_legacy = FALSE "
                            + "WHERE id = ? AND verification_status = 'pending' RETURNING reviewed_at")) {
                statement.setString(1, databaseDecision);
                statement.setLong(2, reviewerId);
                statement.setString(3, decision.reason());
                statement.setLong(4, vehicleId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw decisionConflict();
                    }
                    reviewedAt = result.getObject("reviewed_at", OffsetDateTime.class);
                }
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO driver_vehicle_verification_events "
                            + "(vehicle_id, verification_version, decision, reviewer_admin_id, "
                            + "reviewer_role, reviewed_at, rejection_reason) VALUES (?, ?, ?, ?, 'admin', ?, ?)")) {
                statement.setLong(1, vehicleId);
                statement.setInt(2, version);
                statement.setString(3, databaseDecision);
                statement.setLong(4, reviewerId);
                statement.setObject(5, reviewedAt);
                statement.setString(6, decision.reason());
                statement.executeUpdate();
            }
            return findVehicle(connection, vehicleId);
        } catch (SQLException exception) {
            throw mapDecisionFailure(exception);
        }
    }

    @Transactional
    public VerificationResponses.Document decideDocument(
            String reviewerSubject, long documentId, VerificationRequests.Decision request) {
        long reviewerId = parseSubject(reviewerSubject);
        Decision decision = decision(request);
        String databaseDecision = "approved".equals(decision.value()) ? "verified" : "rejected";
        try (Connection connection = dataSource.getConnection()) {
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT id FROM driver_documents WHERE id = ? AND verification_status = 'pending' FOR UPDATE")) {
                statement.setLong(1, documentId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw decisionConflict();
                    }
                }
            }
            OffsetDateTime reviewedAt;
            try (PreparedStatement statement = connection.prepareStatement(
                    "UPDATE driver_documents SET verification_status = ?, reviewer_admin_id = ?, "
                            + "reviewer_role = 'admin', reviewed_at = statement_timestamp(), rejection_reason = ? "
                            + "WHERE id = ? AND verification_status = 'pending' RETURNING reviewed_at")) {
                statement.setString(1, databaseDecision);
                statement.setLong(2, reviewerId);
                statement.setString(3, decision.reason());
                statement.setLong(4, documentId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw decisionConflict();
                    }
                    reviewedAt = result.getObject("reviewed_at", OffsetDateTime.class);
                }
            }
            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO driver_document_verification_events "
                            + "(document_id, decision, reviewer_admin_id, reviewer_role, reviewed_at, rejection_reason) "
                            + "VALUES (?, ?, ?, 'admin', ?, ?)")) {
                statement.setLong(1, documentId);
                statement.setString(2, databaseDecision);
                statement.setLong(3, reviewerId);
                statement.setObject(4, reviewedAt);
                statement.setString(5, decision.reason());
                statement.executeUpdate();
            }
            return findDocument(connection, documentId);
        } catch (SQLException exception) {
            throw mapDecisionFailure(exception);
        }
    }

    private static List<VerificationResponses.Profile> pendingProfiles(Connection connection) throws SQLException {
        List<VerificationResponses.Profile> items = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT p.user_id, u.full_name, u.email, p.status, p.verification_status, "
                        + "p.submission_version, p.rejection_reason, p.reviewed_at "
                        + "FROM driver_profiles p JOIN users u ON u.id = p.user_id "
                        + "WHERE p.verification_status = 'pending' ORDER BY p.created_at, p.user_id");
                ResultSet result = statement.executeQuery()) {
            while (result.next()) {
                items.add(mapProfile(result));
            }
        }
        return List.copyOf(items);
    }

    private static List<VerificationResponses.Vehicle> pendingVehicles(Connection connection) throws SQLException {
        List<VerificationResponses.Vehicle> items = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT id, driver_user_id, vehicle_type, plate_normalized, make, model, color, "
                        + "verification_status, verification_version, is_active, rejection_reason, reviewed_at "
                        + "FROM driver_vehicles WHERE verification_status = 'pending' "
                        + "ORDER BY created_at, id");
                ResultSet result = statement.executeQuery()) {
            while (result.next()) {
                items.add(mapVehicle(result));
            }
        }
        return List.copyOf(items);
    }

    private static List<VerificationResponses.Document> pendingDocuments(Connection connection) throws SQLException {
        List<VerificationResponses.Document> items = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(
                DriverDocumentService.documentSelect()
                        + "WHERE d.verification_status = 'pending' AND NOT EXISTS ("
                        + "SELECT 1 FROM driver_documents newer WHERE newer.driver_user_id = d.driver_user_id "
                        + "AND newer.document_type = d.document_type "
                        + "AND newer.vehicle_id IS NOT DISTINCT FROM d.vehicle_id "
                        + "AND newer.document_version > d.document_version) "
                        + "ORDER BY d.uploaded_at, d.id");
                ResultSet result = statement.executeQuery()) {
            while (result.next()) {
                items.add(DriverDocumentService.mapDocument(result));
            }
        }
        return List.copyOf(items);
    }

    private static VerificationResponses.Profile findProfile(Connection connection, long driverId)
            throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT p.user_id, u.full_name, u.email, p.status, p.verification_status, "
                        + "p.submission_version, p.rejection_reason, p.reviewed_at "
                        + "FROM driver_profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ?")) {
            statement.setLong(1, driverId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? mapProfile(result) : null;
            }
        }
    }

    private static List<VerificationResponses.Vehicle> findVehicles(Connection connection, long driverId)
            throws SQLException {
        List<VerificationResponses.Vehicle> items = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT id, driver_user_id, vehicle_type, plate_normalized, make, model, color, "
                        + "verification_status, verification_version, is_active, rejection_reason, reviewed_at "
                        + "FROM driver_vehicles WHERE driver_user_id = ? ORDER BY created_at, id")) {
            statement.setLong(1, driverId);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    items.add(mapVehicle(result));
                }
            }
        }
        return List.copyOf(items);
    }

    private static List<VerificationResponses.Document> findDocuments(Connection connection, long driverId)
            throws SQLException {
        List<VerificationResponses.Document> items = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(
                DriverDocumentService.documentSelect()
                        + "WHERE d.driver_user_id = ? ORDER BY d.document_type, d.document_version DESC")) {
            statement.setLong(1, driverId);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    items.add(DriverDocumentService.mapDocument(result));
                }
            }
        }
        return List.copyOf(items);
    }

    private static List<VerificationResponses.DecisionEvent> findHistory(Connection connection, long driverId)
            throws SQLException {
        List<VerificationResponses.DecisionEvent> events = new ArrayList<>();
        String sql = "SELECT subject_type, subject_id, decision, reviewer_admin_id, reviewed_at, rejection_reason "
                + "FROM ("
                + "SELECT 'profile' AS subject_type, driver_user_id AS subject_id, decision, reviewer_admin_id, "
                + "reviewed_at, rejection_reason FROM driver_profile_verification_events WHERE driver_user_id = ? "
                + "UNION ALL SELECT 'vehicle', vehicle_id, decision, reviewer_admin_id, reviewed_at, rejection_reason "
                + "FROM driver_vehicle_verification_events WHERE vehicle_id IN "
                + "(SELECT id FROM driver_vehicles WHERE driver_user_id = ?) "
                + "UNION ALL SELECT 'document', d.id, e.decision, e.reviewer_admin_id, e.reviewed_at, e.rejection_reason "
                + "FROM driver_document_verification_events e JOIN driver_documents d ON d.id = e.document_id "
                + "WHERE d.driver_user_id = ?) history ORDER BY reviewed_at DESC";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, driverId);
            statement.setLong(2, driverId);
            statement.setLong(3, driverId);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    events.add(new VerificationResponses.DecisionEvent(
                            result.getString("subject_type"),
                            Long.toString(result.getLong("subject_id")),
                            result.getString("decision"),
                            Long.toString(result.getLong("reviewer_admin_id")),
                            instant(result, "reviewed_at"),
                            result.getString("rejection_reason")));
                }
            }
        }
        return List.copyOf(events);
    }

    private static VerificationResponses.Vehicle findVehicle(Connection connection, long vehicleId)
            throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT id, driver_user_id, vehicle_type, plate_normalized, make, model, color, "
                        + "verification_status, verification_version, is_active, rejection_reason, reviewed_at "
                        + "FROM driver_vehicles WHERE id = ?")) {
            statement.setLong(1, vehicleId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? mapVehicle(result) : null;
            }
        }
    }

    private static VerificationResponses.Document findDocument(Connection connection, long documentId)
            throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                DriverDocumentService.documentSelect() + "WHERE d.id = ?")) {
            statement.setLong(1, documentId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? DriverDocumentService.mapDocument(result) : null;
            }
        }
    }

    private static boolean profileDocumentsVerified(Connection connection, long driverId) throws SQLException {
        return verifiedDocuments(connection, driverId, null, List.of("ktp", "sim"));
    }

    private static boolean vehicleDocumentsVerified(Connection connection, long driverId, long vehicleId)
            throws SQLException {
        return verifiedDocuments(connection, driverId, vehicleId, List.of("stnk", "vehicle_photo"));
    }

    private static boolean verifiedDocuments(
            Connection connection, long driverId, Long vehicleId, List<String> types) throws SQLException {
        String scope = vehicleId == null ? "d.vehicle_id IS NULL" : "d.vehicle_id = ?";
        String sql = "SELECT COUNT(DISTINCT d.document_type) = ? FROM driver_documents d "
                + "WHERE d.driver_user_id = ? AND d.document_type IN (?, ?) AND " + scope
                + " AND d.verification_status = 'verified' AND d.document_version = ("
                + "SELECT MAX(latest.document_version) FROM driver_documents latest "
                + "WHERE latest.driver_user_id = d.driver_user_id "
                + "AND latest.document_type = d.document_type "
                + "AND latest.vehicle_id IS NOT DISTINCT FROM d.vehicle_id) "
                + "AND EXISTS (SELECT 1 FROM driver_document_verification_events e "
                + "WHERE e.document_id = d.id AND e.decision = 'verified')";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, types.size());
            statement.setLong(2, driverId);
            statement.setString(3, types.get(0));
            statement.setString(4, types.get(1));
            if (vehicleId != null) {
                statement.setLong(5, vehicleId);
            }
            try (ResultSet result = statement.executeQuery()) {
                return result.next() && result.getBoolean(1);
            }
        }
    }

    private static VerificationResponses.Profile mapProfile(ResultSet result) throws SQLException {
        return new VerificationResponses.Profile(
                Long.toString(result.getLong("user_id")),
                result.getString("full_name"),
                result.getString("email"),
                result.getString("status"),
                result.getString("verification_status"),
                result.getInt("submission_version"),
                result.getString("rejection_reason"),
                instant(result, "reviewed_at"));
    }

    private static VerificationResponses.Vehicle mapVehicle(ResultSet result) throws SQLException {
        return new VerificationResponses.Vehicle(
                Long.toString(result.getLong("id")),
                Long.toString(result.getLong("driver_user_id")),
                result.getString("vehicle_type"),
                result.getString("plate_normalized"),
                result.getString("make"),
                result.getString("model"),
                result.getString("color"),
                result.getString("verification_status"),
                result.getInt("verification_version"),
                result.getBoolean("is_active"),
                result.getString("rejection_reason"),
                instant(result, "reviewed_at"));
    }

    private static Decision decision(VerificationRequests.Decision request) {
        String value = request.decision().trim().toLowerCase(Locale.ROOT);
        if ("approved".equals(value)) {
            if (request.reason() != null && !request.reason().isBlank()) {
                throw error(Response.Status.BAD_REQUEST,
                        "Alasan hanya diisi untuk penolakan.", "invalid_decision");
            }
            return new Decision(value, null);
        }
        if (!"rejected".equals(value) || request.reason() == null || request.reason().isBlank()) {
            throw error(Response.Status.BAD_REQUEST,
                    "Alasan wajib diisi saat menolak.", "rejection_reason_required");
        }
        String reason = request.reason().trim();
        if (reason.length() > 1000) {
            throw error(Response.Status.BAD_REQUEST, "Alasan penolakan terlalu panjang.", "invalid_decision");
        }
        return new Decision(value, reason);
    }

    private static String instant(ResultSet result, String column) throws SQLException {
        OffsetDateTime value = result.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant().toString();
    }

    private static long parseSubject(String subject) {
        try {
            long value = Long.parseLong(subject);
            if (value <= 0) {
                throw new NumberFormatException("Subject must be positive");
            }
            return value;
        } catch (NumberFormatException exception) {
            throw error(Response.Status.UNAUTHORIZED, "Autentikasi diperlukan.", "unauthorized");
        }
    }

    private static WebApplicationException decisionConflict() {
        return error(Response.Status.CONFLICT,
                "Data sudah diproses atau tidak lagi menunggu review.", "verification_already_decided");
    }

    private static WebApplicationException requirementsIncomplete(String message) {
        return error(Response.Status.CONFLICT, message, "verification_requirements_incomplete");
    }

    private static WebApplicationException mapDecisionFailure(SQLException exception) {
        if ("23514".equals(exception.getSQLState()) || "23503".equals(exception.getSQLState())) {
            return error(Response.Status.CONFLICT,
                    "Keputusan verifikasi tidak memenuhi aturan database.", "verification_decision_conflict");
        }
        if ("23505".equals(exception.getSQLState())) {
            return decisionConflict();
        }
        return databaseFailure(exception);
    }

    private static WebApplicationException error(Response.Status status, String message, String code) {
        return new WebApplicationException(
                Response.status(status).entity(new VerificationResponses.Error(message, code)).build());
    }

    private static WebApplicationException databaseFailure(SQLException exception) {
        LOG.error("Admin verification operation failed", exception);
        return error(Response.Status.INTERNAL_SERVER_ERROR,
                "Operasi verifikasi tidak dapat diselesaikan.", "verification_operation_failed");
    }

    private record Decision(String value, String reason) {
    }
}

package id.rideflow.service;

import id.rideflow.dto.DriverRequests;
import id.rideflow.dto.DriverResponses;
import id.rideflow.dto.VerificationResponses;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.security.SecureRandom;

@ApplicationScoped
public class DriverDocumentService {

    private static final Logger LOG = Logger.getLogger(DriverDocumentService.class);
    private static final long MAX_FILE_SIZE = 10_000_000;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    @Inject
    DataSource dataSource;

    @ConfigProperty(name = "rideflow.documents.storage-path", defaultValue = "./data/driver-documents")
    String storagePath;

    @Transactional
    public List<VerificationResponses.Document> list(String subject) {
        long driverId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            requireDriver(connection, driverId);
            List<VerificationResponses.Document> documents = new ArrayList<>();
            try (PreparedStatement statement = connection.prepareStatement(
                    documentSelect() + "WHERE d.driver_user_id = ? "
                            + "ORDER BY d.document_type, d.document_version DESC, d.id DESC")) {
                statement.setLong(1, driverId);
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) {
                        documents.add(mapDocument(result));
                    }
                }
            }
            return List.copyOf(documents);
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public VerificationResponses.Document upload(String subject, DriverRequests.DocumentUpload request) {
        long driverId = parseSubject(subject);
        String type = normalizeType(request.documentType());
        String mimeType = request.mimeType().trim().toLowerCase(Locale.ROOT);
        String filename = sanitizeFilename(request.filename());
        byte[] content = decodeContent(request.contentBase64());
        validateFile(type, filename, mimeType, content);
        Long vehicleId = parseVehicleId(request.vehicleId(), type);
        byte[] randomKey = new byte[32];
        SECURE_RANDOM.nextBytes(randomKey);
        String storageKey = HexFormat.of().formatHex(randomKey);
        Path savedFile = storageDirectory().resolve(storageKey);

        try (Connection connection = dataSource.getConnection()) {
            requireDriver(connection, driverId);
            String vehicleType = null;
            if (vehicleId != null) {
                try (PreparedStatement statement = connection.prepareStatement(
                        "SELECT vehicle_type FROM driver_vehicles "
                                + "WHERE id = ? AND driver_user_id = ? FOR UPDATE")) {
                    statement.setLong(1, vehicleId);
                    statement.setLong(2, driverId);
                    try (ResultSet result = statement.executeQuery()) {
                        if (!result.next()) {
                            throw error(Response.Status.NOT_FOUND,
                                    "Kendaraan tidak ditemukan.", "vehicle_not_found");
                        }
                        vehicleType = result.getString("vehicle_type");
                    }
                }
            }

            Files.createDirectories(savedFile.getParent());
            Files.write(savedFile, content, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);

            try (PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO driver_documents "
                            + "(driver_user_id, document_type, vehicle_id, vehicle_type, storage_key, "
                            + "original_filename, mime_type, file_size, uploaded_by) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, document_version, "
                            + "verification_status, rejection_reason, reviewer_admin_id, reviewed_at, uploaded_at")) {
                statement.setLong(1, driverId);
                statement.setString(2, type);
                if (vehicleId == null) {
                    statement.setNull(3, java.sql.Types.BIGINT);
                    statement.setNull(4, java.sql.Types.VARCHAR);
                } else {
                    statement.setLong(3, vehicleId);
                    statement.setString(4, vehicleType);
                }
                statement.setString(5, storageKey);
                statement.setString(6, filename);
                statement.setString(7, mimeType);
                statement.setLong(8, content.length);
                statement.setLong(9, driverId);
                try (ResultSet result = statement.executeQuery()) {
                    if (!result.next()) {
                        throw new IllegalStateException("Driver document insert returned no row");
                    }
                    return new VerificationResponses.Document(
                            Long.toString(result.getLong("id")),
                            Long.toString(driverId),
                            type,
                            result.getInt("document_version"),
                            vehicleId == null ? null : Long.toString(vehicleId),
                            filename,
                            mimeType,
                            content.length,
                            result.getString("verification_status"),
                            result.getString("rejection_reason"),
                            nullableId(result, "reviewer_admin_id"),
                            instant(result, "reviewed_at"),
                            instant(result, "uploaded_at"));
                }
            }
        } catch (SQLException exception) {
            deleteQuietly(savedFile);
            if ("23514".equals(exception.getSQLState()) || "23503".equals(exception.getSQLState())) {
                throw error(Response.Status.BAD_REQUEST,
                        "Dokumen tidak sesuai dengan kendaraan atau format yang diizinkan.", "invalid_document");
            }
            if ("23505".equals(exception.getSQLState())) {
                throw error(Response.Status.CONFLICT, "Dokumen tidak dapat disimpan.", "document_conflict");
            }
            throw databaseFailure(exception);
        } catch (IOException exception) {
            deleteQuietly(savedFile);
            LOG.error("Driver document file could not be stored", exception);
            throw error(Response.Status.INTERNAL_SERVER_ERROR,
                    "Dokumen tidak dapat disimpan.", "document_storage_failed");
        }
    }

    @Transactional
    public StoredFile getForDriver(String subject, long documentId) {
        long driverId = parseSubject(subject);
        try (Connection connection = dataSource.getConnection()) {
            requireDriver(connection, driverId);
            return loadFile(connection, documentId, driverId);
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    @Transactional
    public StoredFile getForAdmin(long documentId) {
        try (Connection connection = dataSource.getConnection()) {
            return loadFile(connection, documentId, null);
        } catch (SQLException exception) {
            throw databaseFailure(exception);
        }
    }

    private StoredFile loadFile(Connection connection, long documentId, Long ownerId) throws SQLException {
        String sql = "SELECT storage_key, original_filename, mime_type FROM driver_documents "
                + "WHERE id = ?" + (ownerId == null ? "" : " AND driver_user_id = ?");
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, documentId);
            if (ownerId != null) {
                statement.setLong(2, ownerId);
            }
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw error(Response.Status.NOT_FOUND, "Dokumen tidak ditemukan.", "document_not_found");
                }
                Path file = storageDirectory().resolve(result.getString("storage_key")).normalize();
                if (!file.getParent().equals(storageDirectory())) {
                    throw new IllegalStateException("Document storage key escaped the private storage directory");
                }
                try {
                    return new StoredFile(
                            Files.readAllBytes(file),
                            result.getString("mime_type"),
                            result.getString("original_filename"));
                } catch (IOException exception) {
                    LOG.error("Stored driver document could not be read", exception);
                    throw error(Response.Status.INTERNAL_SERVER_ERROR,
                            "Berkas dokumen tidak tersedia.", "document_storage_failed");
                }
            }
        }
    }

    static String documentSelect() {
        return "SELECT d.id, d.driver_user_id, d.document_type, d.document_version, d.vehicle_id, "
                + "d.original_filename, d.mime_type, d.file_size, d.verification_status, "
                + "d.rejection_reason, d.reviewer_admin_id, d.reviewed_at, d.uploaded_at "
                + "FROM driver_documents d ";
    }

    public static VerificationResponses.Document mapDocument(ResultSet result) throws SQLException {
        return new VerificationResponses.Document(
                Long.toString(result.getLong("id")),
                Long.toString(result.getLong("driver_user_id")),
                result.getString("document_type"),
                result.getInt("document_version"),
                nullableId(result, "vehicle_id"),
                result.getString("original_filename"),
                result.getString("mime_type"),
                result.getLong("file_size"),
                result.getString("verification_status"),
                result.getString("rejection_reason"),
                nullableId(result, "reviewer_admin_id"),
                instant(result, "reviewed_at"),
                instant(result, "uploaded_at"));
    }

    private static void requireDriver(Connection connection, long driverId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT u.status, dp.status AS profile_status "
                        + "FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'driver' "
                        + "JOIN driver_profiles dp ON dp.user_id = u.id WHERE u.id = ? "
                        + "FOR UPDATE OF dp")) {
            statement.setLong(1, driverId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()
                        || !"active".equals(result.getString("status"))
                        || "suspended".equals(result.getString("profile_status"))) {
                    throw error(Response.Status.FORBIDDEN,
                            "Akses driver tidak tersedia.", "driver_access_denied");
                }
            }
        }
    }

    private static String normalizeType(String value) {
        String type = value.trim().toLowerCase(Locale.ROOT);
        if (!List.of("ktp", "sim", "stnk", "vehicle_photo").contains(type)) {
            throw invalidDocument();
        }
        return type;
    }

    private static Long parseVehicleId(String value, String type) {
        boolean vehicleDocument = "stnk".equals(type) || "vehicle_photo".equals(type);
        if (vehicleDocument != (value != null && !value.isBlank())) {
            throw invalidDocument();
        }
        if (!vehicleDocument) {
            return null;
        }
        try {
            long id = Long.parseLong(value);
            if (id <= 0) {
                throw new NumberFormatException("Vehicle id must be positive");
            }
            return id;
        } catch (NumberFormatException exception) {
            throw invalidDocument();
        }
    }

    private static byte[] decodeContent(String value) {
        try {
            byte[] content = Base64.getDecoder().decode(value);
            if (content.length == 0 || content.length > MAX_FILE_SIZE) {
                throw invalidDocument();
            }
            return content;
        } catch (IllegalArgumentException exception) {
            throw invalidDocument();
        }
    }

    private static String sanitizeFilename(String value) {
        String filename = value.trim().replace('\\', '/');
        filename = filename.substring(filename.lastIndexOf('/') + 1)
                .replaceAll("[^A-Za-z0-9._ -]", "_")
                .trim();
        if (filename.isEmpty()) {
            throw invalidDocument();
        }
        return filename;
    }

    private static void validateFile(String type, String filename, String mimeType, byte[] content) {
        String lowerName = filename.toLowerCase(Locale.ROOT);
        boolean jpeg = "image/jpeg".equals(mimeType)
                && (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg"))
                && content.length >= 3
                && (content[0] & 0xff) == 0xff
                && (content[1] & 0xff) == 0xd8
                && (content[2] & 0xff) == 0xff;
        boolean png = "image/png".equals(mimeType)
                && lowerName.endsWith(".png")
                && content.length >= 8
                && (content[0] & 0xff) == 0x89
                && content[1] == 'P' && content[2] == 'N' && content[3] == 'G';
        boolean pdf = "application/pdf".equals(mimeType)
                && lowerName.endsWith(".pdf")
                && content.length >= 5
                && content[0] == '%' && content[1] == 'P'
                && content[2] == 'D' && content[3] == 'F' && content[4] == '-';
        if (!(jpeg || png || pdf) || ("vehicle_photo".equals(type) && pdf)) {
            throw invalidDocument();
        }
    }

    private Path storageDirectory() {
        return Path.of(storagePath).toAbsolutePath().normalize();
    }

    private static String nullableId(ResultSet result, String column) throws SQLException {
        long value = result.getLong(column);
        return result.wasNull() ? null : Long.toString(value);
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
            throw error(Response.Status.UNAUTHORIZED,
                    "Autentikasi diperlukan.", "unauthorized");
        }
    }

    private static void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException exception) {
            LOG.error("Orphaned driver document could not be removed", exception);
        }
    }

    private static WebApplicationException invalidDocument() {
        return error(Response.Status.BAD_REQUEST,
                "Format dokumen atau data unggahan tidak valid.", "invalid_document");
    }

    private static WebApplicationException error(Response.Status status, String message, String code) {
        return new WebApplicationException(
                Response.status(status).entity(new DriverResponses.Error(message, code)).build());
    }

    private static WebApplicationException databaseFailure(SQLException exception) {
        LOG.error("Driver document persistence operation failed", exception);
        return error(Response.Status.INTERNAL_SERVER_ERROR,
                "Operasi dokumen tidak dapat diselesaikan.", "document_operation_failed");
    }

    public record StoredFile(byte[] content, String mimeType, String filename) {
    }
}

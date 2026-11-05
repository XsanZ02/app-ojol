package id.rideflow.dto;

import java.util.List;

public final class VerificationResponses {

    private VerificationResponses() {
    }

    public record Document(
            String id,
            String driverId,
            String type,
            int version,
            String vehicleId,
            String filename,
            String mimeType,
            long fileSize,
            String status,
            String rejectionReason,
            String reviewerId,
            String reviewedAt,
            String uploadedAt) {
    }

    public record Profile(
            String driverId,
            String name,
            String email,
            String operationalStatus,
            String verificationStatus,
            int submissionVersion,
            String rejectionReason,
            String reviewedAt) {
    }

    public record Vehicle(
            String id,
            String driverId,
            String type,
            String plate,
            String make,
            String model,
            String color,
            String verificationStatus,
            int verificationVersion,
            boolean active,
            String rejectionReason,
            String reviewedAt) {
    }

    public record DecisionEvent(
            String subjectType,
            String subjectId,
            String decision,
            String reviewerId,
            String reviewedAt,
            String rejectionReason) {
    }

    public record Queue(
            List<Profile> profiles,
            List<Vehicle> vehicles,
            List<Document> documents) {
    }

    public record DriverDetail(
            Profile profile,
            List<Vehicle> vehicles,
            List<Document> documents,
            List<DecisionEvent> history) {
    }

    public record Error(String message, String code) {
    }
}

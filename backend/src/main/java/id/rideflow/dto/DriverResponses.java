package id.rideflow.dto;

import java.math.BigDecimal;
import java.util.List;

public final class DriverResponses {

    private DriverResponses() {
    }

    public record Profile(
            String userId,
            String status,
            String verificationStatus,
            String rejectionReason,
            String reviewedAt,
            int submissionVersion,
            String createdAt,
            String updatedAt) {
    }

    public record PersonalProfile(String name, String phone) {
    }

    public record Vehicle(
            String id,
            String vehicleType,
            String vehiclePlate,
            String make,
            String model,
            String color,
            String verificationStatus,
            String rejectionReason,
            boolean isActive,
            String createdAt,
            String updatedAt) {
    }

    public record VehicleList(List<Vehicle> vehicles) {
    }

    public record OnlineStatus(boolean isOnline) {
    }

    public record Statistics(
            BigDecimal todayEarnings,
            long todayTrips,
            long completedTrips,
            BigDecimal rating,
            long totalRatingsCount) {
    }

    public record Error(String message, String code) {
    }
}

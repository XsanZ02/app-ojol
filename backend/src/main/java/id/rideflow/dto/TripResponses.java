package id.rideflow.dto;

import java.math.BigDecimal;
import java.util.List;

public final class TripResponses {

    private TripResponses() {
    }

    public record Location(String address, String name, BigDecimal lat, BigDecimal lng) {
    }

    public record StatusHistory(String status, String timestamp, String note) {
    }

    public record Trip(
            String id,
            String status,
            String vehicleType,
            Location pickup,
            Location destination,
            String tripNotes,
            BigDecimal estimatedDistanceKm,
            Long routeDistanceMeters,
            Integer estimatedDurationMin,
            Integer estimatedDurationSeconds,
            BigDecimal estimatedFare,
            String routingProvider,
            String routeGeometry,
            String fareConfigVersion,
            BigDecimal finalFare,
            String currencyCode,
            List<StatusHistory> statusHistory,
            String createdAt,
            String updatedAt,
            String acceptedAt,
            String startedAt,
            String completedAt,
            String cancelledAt,
            String customerId,
            String customerName,
            String customerPhone,
            String driverName,
            String driverPhone,
            String vehicleModel,
            String vehiclePlate) {
    }

    public record Error(String message, String code) {
    }
}

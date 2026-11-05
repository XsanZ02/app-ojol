package id.rideflow.dto;

import java.math.BigDecimal;
import java.util.List;

public final class AdminResponses {

    private AdminResponses() {
    }

    public record User(
            String id,
            String email,
            String name,
            List<String> roles,
            String status,
            String createdAt) {
    }

    public record UserPage(
            List<User> users,
            long total,
            int page,
            int size) {
    }

    public record Dashboard(
            long totalUsers,
            long totalDrivers,
            long onlineDrivers,
            long totalOrders,
            long activeOrders,
            long completedOrders,
            BigDecimal revenue,
            List<RecentOrder> recentOrders,
            List<RecentDriverActivity> recentDriverActivity) {
    }

    public record RecentOrder(
            String id,
            String status,
            String vehicleType,
            String customerName,
            String driverName,
            BigDecimal estimatedFare,
            BigDecimal finalFare,
            String currencyCode,
            String requestedAt) {
    }

    public record RecentDriverActivity(
            String id,
            String name,
            String email,
            String operationalStatus,
            boolean online,
            String updatedAt) {
    }

    public record Driver(
            String id,
            String name,
            String email,
            String accountStatus,
            String operationalStatus,
            boolean online,
            long vehicleCount,
            long completedTrips,
            String createdAt,
            String updatedAt) {
    }

    public record DriverPage(List<Driver> drivers, long total, int page, int size) {
    }

    public record DriverDetail(
            Driver driver,
            List<DriverVehicle> vehicles,
            List<RecentOrder> recentOrders) {
    }

    public record DriverVehicle(
            String id,
            String vehicleType,
            String plate,
            String make,
            String model,
            String color,
            String verificationStatus,
            boolean active) {
    }

    public record Order(
            String id,
            String status,
            String vehicleType,
            String customerId,
            String customerName,
            String customerEmail,
            String driverId,
            String driverName,
            String driverEmail,
            String pickupAddress,
            String dropoffAddress,
            BigDecimal estimatedFare,
            BigDecimal finalFare,
            String currencyCode,
            String requestedAt,
            String acceptedAt,
            String completedAt) {
    }

    public record OrderPage(List<Order> orders, long total, int page, int size) {
    }

    public record OrderDetail(Order order, List<TripResponses.StatusHistory> history) {
    }

    public record Payment(
            String tripId,
            String method,
            String status,
            BigDecimal amount,
            String currencyCode,
            String customerName,
            String driverName,
            String paidAt,
            String createdAt) {
    }

    public record PaymentPage(List<Payment> payments, long total, int page, int size) {
    }

    public record PaymentReport(
            long pendingCount,
            long succeededCount,
            long failedCount,
            long refundedCount,
            BigDecimal succeededRevenue,
            BigDecimal refundedAmount) {
    }
}

package id.rideflow.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class DriverRequests {

    private DriverRequests() {
    }

    public record ProfileUpdate(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Size(max = 32) String phone) {
    }

    public record VehicleRegistration(
            @NotBlank @Size(max = 16) String vehicleType,
            @NotBlank @Size(max = 32) String vehiclePlate,
            @NotBlank @Size(max = 80) String make,
            @NotBlank @Size(max = 100) String model,
            @NotBlank @Size(max = 40) String color) {
    }

    public record VehicleActivation(@NotNull Boolean isActive) {
    }

    public record OnlineStatus(@NotNull Boolean isOnline) {
    }

    public record DocumentUpload(
            @NotBlank @Size(max = 32) String documentType,
            @Size(max = 20) String vehicleId,
            @NotBlank @Size(max = 255) String filename,
            @NotBlank @Size(max = 100) String mimeType,
            @NotBlank @Size(max = 14000000) String contentBase64) {
    }
}

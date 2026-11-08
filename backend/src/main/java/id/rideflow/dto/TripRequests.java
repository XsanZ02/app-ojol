package id.rideflow.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public final class TripRequests {

    private TripRequests() {
    }

    public record Create(
            @NotBlank @Size(max = 500) String pickupAddress,
            @NotNull @DecimalMin("-90.0") @DecimalMax("90.0") BigDecimal pickupLatitude,
            @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") BigDecimal pickupLongitude,
            @NotBlank @Size(max = 500) String destinationAddress,
            @NotNull @DecimalMin("-90.0") @DecimalMax("90.0") BigDecimal destinationLatitude,
            @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") BigDecimal destinationLongitude,
            @NotBlank @Size(max = 16) String vehicleType,
            @Pattern(regexp = "IDR") String currencyCode,
            @Size(max = 500) String tripNotes) {
    }

    public record Cancel(@Size(max = 500) String reason) {
    }
}

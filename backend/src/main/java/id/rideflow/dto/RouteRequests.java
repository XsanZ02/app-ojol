package id.rideflow.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;

public final class RouteRequests {

    private RouteRequests() {
    }

    public record Estimate(
            @NotNull @DecimalMin("-90.0") @DecimalMax("90.0") BigDecimal pickupLatitude,
            @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") BigDecimal pickupLongitude,
            @NotNull @DecimalMin("-90.0") @DecimalMax("90.0") BigDecimal destinationLatitude,
            @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") BigDecimal destinationLongitude,
            @NotNull @Pattern(regexp = "(?i)MOTOR|MOTORCYCLE|MOBIL|CAR") String vehicleType) {
    }
}

package id.rideflow.service;

import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Locale;

@ApplicationScoped
public class FareCalculationService {

    @ConfigProperty(name = "rideflow.fare.motor.base-fare", defaultValue = "5000")
    long motorBaseFare;

    @ConfigProperty(name = "rideflow.fare.motor.per-kilometer", defaultValue = "2000")
    long motorFarePerKilometer;

    @ConfigProperty(name = "rideflow.fare.motor.minimum-fare", defaultValue = "8000")
    long motorMinimumFare;

    @ConfigProperty(name = "rideflow.fare.car.base-fare", defaultValue = "8000")
    long carBaseFare;

    @ConfigProperty(name = "rideflow.fare.car.per-kilometer", defaultValue = "3500")
    long carFarePerKilometer;

    @ConfigProperty(name = "rideflow.fare.car.minimum-fare", defaultValue = "12000")
    long carMinimumFare;

    @ConfigProperty(name = "rideflow.fare.currency", defaultValue = "IDR")
    String currency;

    @ConfigProperty(name = "rideflow.fare.config-version", defaultValue = "demo-v2-vehicle")
    String configVersion;

    public Fare calculate(long distanceMeters, String vehicleType) {
        return switch (normalizeVehicleType(vehicleType)) {
            case "motorcycle" -> calculate(
                    distanceMeters, "motorcycle", motorBaseFare, motorFarePerKilometer,
                    motorMinimumFare, currency, configVersion);
            case "car" -> calculate(
                    distanceMeters, "car", carBaseFare, carFarePerKilometer,
                    carMinimumFare, currency, configVersion);
            default -> throw new IllegalArgumentException("Unsupported vehicle type");
        };
    }

    public static Fare calculate(
            long distanceMeters,
            String vehicleType,
            long baseFare,
            long farePerKilometer,
            long minimumFare,
            String currency,
            String configVersion) {
        if (distanceMeters <= 0) {
            throw new IllegalArgumentException("Distance must be positive");
        }
        normalizeVehicleType(vehicleType);
        if (baseFare < 0 || farePerKilometer < 0 || minimumFare < 0
                || !"IDR".equals(currency) || configVersion == null || configVersion.isBlank()) {
            throw new IllegalStateException("Fare configuration is invalid");
        }
        BigDecimal base = BigDecimal.valueOf(baseFare).setScale(2);
        BigDecimal rate = BigDecimal.valueOf(farePerKilometer).setScale(2);
        BigDecimal minimum = BigDecimal.valueOf(minimumFare).setScale(2);
        BigDecimal distanceKm = BigDecimal.valueOf(distanceMeters).movePointLeft(3);
        BigDecimal calculated = base.add(rate.multiply(distanceKm));
        BigDecimal amount = calculated.max(minimum)
                .setScale(0, RoundingMode.HALF_UP)
                .setScale(2);
        return new Fare(amount, base, rate, minimum, currency, configVersion);
    }

    private static String normalizeVehicleType(String vehicleType) {
        if (vehicleType == null) {
            throw new IllegalArgumentException("Vehicle type is required");
        }
        return switch (vehicleType.trim().toLowerCase(Locale.ROOT)) {
            case "motor", "motorcycle" -> "motorcycle";
            case "mobil", "car" -> "car";
            default -> throw new IllegalArgumentException("Unsupported vehicle type");
        };
    }

    public record Fare(
            BigDecimal amount,
            BigDecimal baseFare,
            BigDecimal farePerKilometer,
            BigDecimal minimumFare,
            String currency,
            String configVersion) {
    }
}

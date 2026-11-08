package id.rideflow.dto;

import java.math.BigDecimal;

public final class RouteResponses {

    private RouteResponses() {
    }

    public record Estimate(
            long distanceMeters,
            BigDecimal distanceKm,
            int durationSeconds,
            BigDecimal estimatedFare,
            String currency,
            String fareConfigVersion,
            String routingProvider,
            String routeGeometry) {
    }
}

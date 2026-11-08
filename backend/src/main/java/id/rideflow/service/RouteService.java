package id.rideflow.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

@ApplicationScoped
public class RouteService {

    private static final Logger LOG = Logger.getLogger(RouteService.class);

    @ConfigProperty(name = "rideflow.routing.valhalla-url")
    String valhallaUrl;

    @ConfigProperty(name = "rideflow.routing.timeout-seconds", defaultValue = "8")
    long timeoutSeconds;

    @Inject
    ObjectMapper objectMapper;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public Route estimate(
            BigDecimal pickupLatitude,
            BigDecimal pickupLongitude,
            BigDecimal destinationLatitude,
            BigDecimal destinationLongitude,
            String vehicleType) {
        validateCoordinates(pickupLatitude, pickupLongitude, destinationLatitude, destinationLongitude);
        if (pickupLatitude.compareTo(destinationLatitude) == 0
                && pickupLongitude.compareTo(destinationLongitude) == 0) {
            throw error(422, "A route could not be found", "route_not_found");
        }

        String costing = "MOTOR".equalsIgnoreCase(vehicleType)
                || "motorcycle".equalsIgnoreCase(vehicleType)
                ? "motor_scooter"
                : "auto";
        try {
            ObjectNode requestBody = objectMapper.createObjectNode();
            var locations = requestBody.putArray("locations");
            locations.addObject()
                    .put("lat", pickupLatitude)
                    .put("lon", pickupLongitude);
            locations.addObject()
                    .put("lat", destinationLatitude)
                    .put("lon", destinationLongitude);
            requestBody.put("costing", costing);
            requestBody.put("units", "kilometers");
            requestBody.putObject("directions_options").put("units", "kilometers");

            HttpRequest request = HttpRequest.newBuilder(URI.create(valhallaUrl))
                    .timeout(Duration.ofSeconds(timeoutSeconds))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody)))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                LOG.warnf("Valhalla returned HTTP status %d", response.statusCode());
                if (response.statusCode() == 400 || response.statusCode() == 404
                        || response.statusCode() == 422) {
                    throw error(422, "A route could not be found", "route_not_found");
                }
                throw routingUnavailable();
            }

            JsonNode root = objectMapper.readTree(response.body());
            JsonNode summary = root.path("trip").path("summary");
            JsonNode legs = root.path("trip").path("legs");
            double distanceKm = summary.path("length").asDouble(-1);
            double durationSeconds = summary.path("time").asDouble(-1);
            String geometry = legs.isArray() && !legs.isEmpty()
                    ? legs.get(0).path("shape").asText(null)
                    : null;
            if (!Double.isFinite(distanceKm) || distanceKm <= 0
                    || !Double.isFinite(durationSeconds) || durationSeconds <= 0
                    || geometry == null || geometry.isBlank()) {
                throw error(422, "A route could not be found", "route_not_found");
            }

            long distanceMeters = Math.round(distanceKm * 1000);
            long duration = (long) Math.ceil(durationSeconds);
            return new Route(distanceMeters, Math.toIntExact(duration), geometry, "valhalla:" + costing);
        } catch (WebApplicationException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            LOG.warn("Valhalla request was interrupted");
            throw routingUnavailable();
        } catch (IOException | RuntimeException exception) {
            LOG.warn("Valhalla request failed", exception);
            throw routingUnavailable();
        }
    }

    private static void validateCoordinates(
            BigDecimal pickupLatitude,
            BigDecimal pickupLongitude,
            BigDecimal destinationLatitude,
            BigDecimal destinationLongitude) {
        if (pickupLatitude == null || pickupLongitude == null
                || destinationLatitude == null || destinationLongitude == null
                || pickupLatitude.compareTo(BigDecimal.valueOf(-90)) < 0
                || pickupLatitude.compareTo(BigDecimal.valueOf(90)) > 0
                || destinationLatitude.compareTo(BigDecimal.valueOf(-90)) < 0
                || destinationLatitude.compareTo(BigDecimal.valueOf(90)) > 0
                || pickupLongitude.compareTo(BigDecimal.valueOf(-180)) < 0
                || pickupLongitude.compareTo(BigDecimal.valueOf(180)) > 0
                || destinationLongitude.compareTo(BigDecimal.valueOf(-180)) < 0
                || destinationLongitude.compareTo(BigDecimal.valueOf(180)) > 0) {
            throw error(
                    Response.Status.BAD_REQUEST.getStatusCode(),
                    "Coordinates are invalid",
                    "invalid_coordinates");
        }
    }

    private static WebApplicationException routingUnavailable() {
        return error(
                Response.Status.SERVICE_UNAVAILABLE.getStatusCode(),
                "Route estimation is temporarily unavailable",
                "routing_unavailable");
    }

    private static WebApplicationException error(int status, String message, String code) {
        return new WebApplicationException(
                Response.status(status)
                        .entity(new id.rideflow.dto.TripResponses.Error(message, code))
                        .build());
    }

    public record Route(long distanceMeters, int durationSeconds, String geometry, String provider) {
    }
}

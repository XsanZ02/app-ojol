package id.rideflow.resource;

import id.rideflow.dto.RouteRequests;
import id.rideflow.dto.RouteResponses;
import id.rideflow.service.FareCalculationService;
import id.rideflow.service.RouteService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.core.MediaType;

import java.math.BigDecimal;
import java.math.RoundingMode;

@Path("/routes")
@Authenticated
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class RouteResource {

    @Inject
    RouteService routeService;

    @Inject
    FareCalculationService fareCalculationService;

    @POST
    @Path("/estimate")
    public RouteResponses.Estimate estimate(@Valid RouteRequests.Estimate request) {
        String vehicleType = request.vehicleType() == null ? "MOTOR" : request.vehicleType();
        RouteService.Route route = routeService.estimate(
                request.pickupLatitude(),
                request.pickupLongitude(),
                request.destinationLatitude(),
                request.destinationLongitude(),
                vehicleType);
        FareCalculationService.Fare fare = fareCalculationService.calculate(route.distanceMeters(), vehicleType);
        return new RouteResponses.Estimate(
                route.distanceMeters(),
                BigDecimal.valueOf(route.distanceMeters()).divide(BigDecimal.valueOf(1000), 3, RoundingMode.HALF_UP),
                route.durationSeconds(),
                fare.amount(),
                fare.currency(),
                fare.configVersion(),
                route.provider(),
                route.geometry());
    }
}

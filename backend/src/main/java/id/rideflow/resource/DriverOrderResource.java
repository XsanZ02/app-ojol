package id.rideflow.resource;

import id.rideflow.dto.TripResponses;
import id.rideflow.service.TripEventService;
import id.rideflow.service.TripService;
import io.quarkus.security.Authenticated;
import io.smallrye.mutiny.Multi;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.jboss.resteasy.reactive.RestStreamElementType;
import org.eclipse.microprofile.jwt.JsonWebToken;

import java.util.List;

@Path("/drivers/me/orders")
@Authenticated
@Produces(MediaType.APPLICATION_JSON)
public class DriverOrderResource {

    @Inject
    TripService tripService;

    @Inject
    TripEventService tripEventService;

    @Inject
    JsonWebToken jwt;

    @GET
    public List<TripResponses.Trip> availableOrders() {
        return tripService.availableOrders(jwt.getSubject());
    }

    @GET
    @Path("/events")
    @Produces(MediaType.SERVER_SENT_EVENTS)
    @RestStreamElementType(MediaType.APPLICATION_JSON)
    public Multi<TripEventService.AvailableOrderEvent> orderEvents() {
        return tripEventService.subscribeToAvailableOrders(
                tripService.availableOrderVehicleTypes(jwt.getSubject()));
    }
}

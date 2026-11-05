package id.rideflow.resource;

import id.rideflow.dto.TripResponses;
import id.rideflow.service.TripService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.jwt.JsonWebToken;

import java.util.List;

@Path("/drivers/me/orders")
@Authenticated
@Produces(MediaType.APPLICATION_JSON)
public class DriverOrderResource {

    @Inject
    TripService tripService;

    @Inject
    JsonWebToken jwt;

    @GET
    public List<TripResponses.Trip> availableOrders() {
        return tripService.availableOrders(jwt.getSubject());
    }
}

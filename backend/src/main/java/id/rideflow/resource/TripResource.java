package id.rideflow.resource;

import id.rideflow.dto.TripRequests;
import id.rideflow.dto.TripResponses;
import id.rideflow.service.TripService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.jwt.JsonWebToken;

import java.util.List;

@Path("/trips")
@Authenticated
@Produces(MediaType.APPLICATION_JSON)
public class TripResource {

    @Inject
    TripService tripService;

    @Inject
    JsonWebToken jwt;

    @POST
    public Response create(@Valid TripRequests.Create request) {
        return Response.status(Response.Status.CREATED)
                .entity(tripService.create(jwt.getSubject(), request))
                .build();
    }

    @GET
    @Path("/me")
    public List<TripResponses.Trip> myTrips() {
        return tripService.myTrips(jwt.getSubject());
    }

    @GET
    @Path("/{tripId}")
    public TripResponses.Trip getTrip(@PathParam("tripId") long tripId) {
        return tripService.getTrip(jwt.getSubject(), tripId);
    }

    @POST
    @Path("/{tripId}/cancel")
    @jakarta.ws.rs.Consumes(MediaType.APPLICATION_JSON)
    public TripResponses.Trip cancel(
            @PathParam("tripId") long tripId,
            @Valid TripRequests.Cancel request) {
        return tripService.cancel(jwt.getSubject(), tripId, request);
    }

    @POST
    @Path("/{tripId}/accept")
    public TripResponses.Trip accept(@PathParam("tripId") long tripId) {
        return tripService.accept(jwt.getSubject(), tripId);
    }

    @POST
    @Path("/{tripId}/picking-up")
    public TripResponses.Trip pickingUp(@PathParam("tripId") long tripId) {
        return tripService.progress(jwt.getSubject(), tripId, "picking_up");
    }

    @POST
    @Path("/{tripId}/start")
    public TripResponses.Trip start(@PathParam("tripId") long tripId) {
        return tripService.progress(jwt.getSubject(), tripId, "in_progress");
    }

    @POST
    @Path("/{tripId}/complete")
    public TripResponses.Trip complete(@PathParam("tripId") long tripId) {
        return tripService.progress(jwt.getSubject(), tripId, "completed");
    }
}

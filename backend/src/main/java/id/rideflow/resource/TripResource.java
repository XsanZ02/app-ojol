package id.rideflow.resource;

import id.rideflow.dto.TripRequests;
import id.rideflow.dto.TripResponses;
import id.rideflow.service.TripEventService;
import id.rideflow.service.TripService;
import io.quarkus.security.Authenticated;
import io.smallrye.mutiny.Multi;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.resteasy.reactive.RestStreamElementType;
import org.eclipse.microprofile.jwt.JsonWebToken;

import java.util.List;

@Path("/trips")
@Authenticated
@Produces(MediaType.APPLICATION_JSON)
public class TripResource {

    @Inject
    TripService tripService;

    @Inject
    TripEventService tripEventService;

    @Inject
    JsonWebToken jwt;

    @POST
    public Response create(@Valid TripRequests.Create request) {
        TripResponses.Trip trip = tripService.create(jwt.getSubject(), request);
        tripEventService.publish(trip);
        return Response.status(Response.Status.CREATED)
                .entity(trip)
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

    @GET
    @Path("/{tripId}/events")
    @Produces(MediaType.SERVER_SENT_EVENTS)
    @RestStreamElementType(MediaType.APPLICATION_JSON)
    public Multi<TripEventService.TripEvent> tripEvents(@PathParam("tripId") long tripId) {
        tripService.getTrip(jwt.getSubject(), tripId);
        return tripEventService.subscribeToTrip(Long.toString(tripId));
    }

    @POST
    @Path("/{tripId}/cancel")
    @jakarta.ws.rs.Consumes(MediaType.APPLICATION_JSON)
    public TripResponses.Trip cancel(
            @PathParam("tripId") long tripId,
            @Valid TripRequests.Cancel request) {
        TripResponses.Trip trip = tripService.cancel(jwt.getSubject(), tripId, request);
        tripEventService.publish(trip);
        return trip;
    }

    @POST
    @Path("/{tripId}/accept")
    public TripResponses.Trip accept(@PathParam("tripId") long tripId) {
        TripResponses.Trip trip = tripService.accept(jwt.getSubject(), tripId);
        tripEventService.publish(trip);
        return trip;
    }

    @POST
    @Path("/{tripId}/picking-up")
    public TripResponses.Trip pickingUp(@PathParam("tripId") long tripId) {
        TripResponses.Trip trip = tripService.progress(jwt.getSubject(), tripId, "picking_up");
        tripEventService.publish(trip);
        return trip;
    }

    @POST
    @Path("/{tripId}/start")
    public TripResponses.Trip start(@PathParam("tripId") long tripId) {
        TripResponses.Trip trip = tripService.progress(jwt.getSubject(), tripId, "in_progress");
        tripEventService.publish(trip);
        return trip;
    }

    @POST
    @Path("/{tripId}/complete")
    public TripResponses.Trip complete(@PathParam("tripId") long tripId) {
        TripResponses.Trip trip = tripService.progress(jwt.getSubject(), tripId, "completed");
        tripEventService.publish(trip);
        return trip;
    }
}

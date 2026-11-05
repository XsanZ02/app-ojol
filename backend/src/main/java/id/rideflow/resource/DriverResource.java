package id.rideflow.resource;

import id.rideflow.dto.DriverRequests;
import id.rideflow.dto.DriverResponses;
import id.rideflow.dto.TripResponses;
import id.rideflow.service.DriverDocumentService;
import id.rideflow.service.DriverService;
import id.rideflow.service.TripService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.jwt.JsonWebToken;

import java.util.List;

@Path("/drivers/me")
@Authenticated
@Produces(MediaType.APPLICATION_JSON)
public class DriverResource {

    @Inject
    DriverService driverService;

    @Inject
    DriverDocumentService driverDocumentService;

    @Inject
    TripService tripService;

    @Inject
    JsonWebToken jwt;

    @GET
    @Path("/profile")
    public DriverResponses.Profile getProfile() {
        return driverService.getProfile(jwt.getSubject());
    }

    @GET
    @Path("/status")
    public DriverResponses.OnlineStatus getOnlineStatus() {
        return driverService.getOnlineStatus(jwt.getSubject());
    }

    @PUT
    @Path("/status")
    @Consumes(MediaType.APPLICATION_JSON)
    public DriverResponses.OnlineStatus setOnlineStatus(@Valid DriverRequests.OnlineStatus request) {
        return driverService.setOnlineStatus(jwt.getSubject(), request);
    }

    @GET
    @Path("/statistics")
    public DriverResponses.Statistics getStatistics() {
        return driverService.getStatistics(jwt.getSubject());
    }

    @GET
    @Path("/trips")
    public List<TripResponses.Trip> listTrips() {
        return tripService.driverTrips(jwt.getSubject());
    }

    @GET
    @Path("/trips/active")
    public Response getActiveTrip() {
        TripResponses.Trip trip = tripService.activeDriverTrip(jwt.getSubject());
        return trip == null ? Response.noContent().build() : Response.ok(trip).build();
    }

    @POST
    @Path("/profile")
    public Response createProfile() {
        DriverService.ProfileResult result = driverService.getOrCreateProfile(jwt.getSubject());
        return Response.status(result.created() ? Response.Status.CREATED : Response.Status.OK)
                .entity(result.profile())
                .build();
    }

    @PUT
    @Path("/profile")
    @Consumes(MediaType.APPLICATION_JSON)
    public DriverResponses.PersonalProfile updateProfile(@Valid DriverRequests.ProfileUpdate request) {
        return driverService.updatePersonalProfile(jwt.getSubject(), request);
    }

    @GET
    @Path("/vehicles")
    public DriverResponses.VehicleList listVehicles() {
        return driverService.listVehicles(jwt.getSubject());
    }

    @POST
    @Path("/vehicles")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response registerVehicle(@Valid DriverRequests.VehicleRegistration request) {
        DriverResponses.Vehicle vehicle = driverService.registerVehicle(jwt.getSubject(), request);
        return Response.status(Response.Status.CREATED).entity(vehicle).build();
    }

    @PUT
    @Path("/vehicles/{vehicleId}")
    @Consumes(MediaType.APPLICATION_JSON)
    public DriverResponses.Vehicle updateVehicle(
            @PathParam("vehicleId") long vehicleId,
            @Valid DriverRequests.VehicleRegistration request) {
        return driverService.updatePendingVehicle(jwt.getSubject(), vehicleId, request);
    }

    @PATCH
    @Path("/vehicles/{vehicleId}/active")
    @Consumes(MediaType.APPLICATION_JSON)
    public DriverResponses.Vehicle setVehicleActive(
            @PathParam("vehicleId") long vehicleId,
            @Valid DriverRequests.VehicleActivation request) {
        return driverService.setVehicleActive(jwt.getSubject(), vehicleId, request);
    }

    @GET
    @Path("/documents")
    public List<id.rideflow.dto.VerificationResponses.Document> listDocuments() {
        return driverDocumentService.list(jwt.getSubject());
    }

    @POST
    @Path("/documents")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response uploadDocument(@Valid DriverRequests.DocumentUpload request) {
        return Response.status(Response.Status.CREATED)
                .entity(driverDocumentService.upload(jwt.getSubject(), request))
                .build();
    }

    @GET
    @Path("/documents/{documentId}/file")
    public Response getDocumentFile(@PathParam("documentId") long documentId) {
        DriverDocumentService.StoredFile file = driverDocumentService.getForDriver(jwt.getSubject(), documentId);
        return Response.ok(file.content(), file.mimeType())
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + file.filename() + "\"")
                .build();
    }
}

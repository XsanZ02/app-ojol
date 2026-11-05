package id.rideflow.resource;

import id.rideflow.dto.AdminResponses;
import id.rideflow.dto.VerificationRequests;
import id.rideflow.dto.VerificationResponses;
import id.rideflow.service.AdminVerificationService;
import id.rideflow.service.DriverDocumentService;
import id.rideflow.service.AdminService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.eclipse.microprofile.jwt.JsonWebToken;

@Path("/admin")
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed("admin")
public class AdminResource {

    @Inject
    JsonWebToken jwt;

    @Inject
    AdminService adminService;

    @Inject
    AdminVerificationService adminVerificationService;

    @Inject
    DriverDocumentService driverDocumentService;

    @GET
    @Path("/access")
    public AccessStatus accessStatus() {
        return new AccessStatus(true, jwt.getSubject());
    }

    @GET
    @Path("/dashboard")
    public AdminResponses.Dashboard dashboard() {
        return adminService.dashboard();
    }

    @GET
    @Path("/users")
    public AdminResponses.UserPage listUsers(
            @QueryParam("search") @Size(max = 320) String search,
            @QueryParam("page") @Min(1) Integer page,
            @QueryParam("size") @Min(1) @Max(100) Integer size) {
        return adminService.listUsers(
                search,
                page == null ? 1 : page,
                size == null ? 20 : size);
    }

    @GET
    @Path("/users/{userId}")
    public Response getUser(@PathParam("userId") @Min(1) long userId) {
        AdminResponses.User user = adminService.getUser(userId);
        return user == null ? Response.status(Response.Status.NOT_FOUND).build() : Response.ok(user).build();
    }

    @GET
    @Path("/drivers")
    public AdminResponses.DriverPage listDrivers(
            @QueryParam("search") @Size(max = 320) String search,
            @QueryParam("status") @Size(max = 16) String status,
            @QueryParam("page") @Min(1) Integer page,
            @QueryParam("size") @Min(1) @Max(100) Integer size) {
        return adminService.listDrivers(
                search, status, page == null ? 1 : page, size == null ? 20 : size);
    }

    @GET
    @Path("/drivers/{driverId}")
    public Response getDriver(@PathParam("driverId") @Min(1) long driverId) {
        AdminResponses.DriverDetail driver = adminService.getDriver(driverId);
        return driver == null
                ? Response.status(Response.Status.NOT_FOUND).build()
                : Response.ok(driver).build();
    }

    @GET
    @Path("/verifications")
    public VerificationResponses.Queue verificationQueue() {
        return adminVerificationService.queue();
    }

    @GET
    @Path("/verifications/drivers/{driverId}")
    public Response verificationDriver(@PathParam("driverId") @Min(1) long driverId) {
        VerificationResponses.DriverDetail driver = adminVerificationService.driverDetail(driverId);
        return driver == null
                ? Response.status(Response.Status.NOT_FOUND).build()
                : Response.ok(driver).build();
    }

    @POST
    @Path("/verifications/profiles/{driverId}/decision")
    @Consumes(MediaType.APPLICATION_JSON)
    public VerificationResponses.Profile decideProfile(
            @PathParam("driverId") @Min(1) long driverId,
            @jakarta.validation.Valid VerificationRequests.Decision request) {
        return adminVerificationService.decideProfile(jwt.getSubject(), driverId, request);
    }

    @POST
    @Path("/verifications/vehicles/{vehicleId}/decision")
    @Consumes(MediaType.APPLICATION_JSON)
    public VerificationResponses.Vehicle decideVehicle(
            @PathParam("vehicleId") @Min(1) long vehicleId,
            @jakarta.validation.Valid VerificationRequests.Decision request) {
        return adminVerificationService.decideVehicle(jwt.getSubject(), vehicleId, request);
    }

    @POST
    @Path("/verifications/documents/{documentId}/decision")
    @Consumes(MediaType.APPLICATION_JSON)
    public VerificationResponses.Document decideDocument(
            @PathParam("documentId") @Min(1) long documentId,
            @jakarta.validation.Valid VerificationRequests.Decision request) {
        return adminVerificationService.decideDocument(jwt.getSubject(), documentId, request);
    }

    @GET
    @Path("/verifications/documents/{documentId}/file")
    public Response verificationDocumentFile(@PathParam("documentId") @Min(1) long documentId) {
        DriverDocumentService.StoredFile file = driverDocumentService.getForAdmin(documentId);
        return Response.ok(file.content(), file.mimeType())
                .header("Content-Disposition", "inline; filename=\"" + file.filename() + "\"")
                .build();
    }

    @GET
    @Path("/orders")
    public AdminResponses.OrderPage listOrders(
            @QueryParam("search") @Size(max = 320) String search,
            @QueryParam("status") @Size(max = 16) String status,
            @QueryParam("page") @Min(1) Integer page,
            @QueryParam("size") @Min(1) @Max(100) Integer size) {
        return adminService.listOrders(
                search, status, page == null ? 1 : page, size == null ? 20 : size);
    }

    @GET
    @Path("/orders/{tripId}")
    public Response getOrder(@PathParam("tripId") @Min(1) long tripId) {
        AdminResponses.OrderDetail order = adminService.getOrder(tripId);
        return order == null
                ? Response.status(Response.Status.NOT_FOUND).build()
                : Response.ok(order).build();
    }

    @GET
    @Path("/payments")
    public AdminResponses.PaymentPage listPayments(
            @QueryParam("search") @Size(max = 320) String search,
            @QueryParam("status") @Size(max = 16) String status,
            @QueryParam("page") @Min(1) Integer page,
            @QueryParam("size") @Min(1) @Max(100) Integer size) {
        return adminService.listPayments(
                search, status, page == null ? 1 : page, size == null ? 20 : size);
    }

    @GET
    @Path("/payments/report")
    public AdminResponses.PaymentReport paymentReport() {
        return adminService.paymentReport();
    }

    public record AccessStatus(boolean authorized, String subject) {
    }
}

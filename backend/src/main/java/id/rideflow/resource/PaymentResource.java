package id.rideflow.resource;

import id.rideflow.dto.PaymentRequests;
import id.rideflow.dto.PaymentResponses;
import id.rideflow.service.PaymentService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.jwt.JsonWebToken;

@Path("/trips/{tripId}/payment")
@Authenticated
@Produces(MediaType.APPLICATION_JSON)
public class PaymentResource {

    @Inject
    PaymentService paymentService;

    @Inject
    JsonWebToken jwt;

    @GET
    public PaymentResponses.Payment get(@PathParam("tripId") long tripId) {
        return paymentService.get(jwt.getSubject(), tripId);
    }

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    public Response create(
            @PathParam("tripId") long tripId,
            @Valid PaymentRequests.Create request) {
        PaymentService.CreateResult result = paymentService.create(jwt.getSubject(), tripId, request);
        return Response.status(result.created() ? Response.Status.CREATED : Response.Status.OK)
                .entity(result.payment())
                .build();
    }

    @POST
    @Path("/cash/confirm")
    public PaymentResponses.Payment confirmCash(@PathParam("tripId") long tripId) {
        return paymentService.confirmCash(jwt.getSubject(), tripId);
    }
}

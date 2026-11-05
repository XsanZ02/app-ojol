package id.rideflow.resource;

import id.rideflow.dto.AuthRequests;
import id.rideflow.dto.AuthResponses;
import id.rideflow.service.AuthService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.jwt.JsonWebToken;

@Path("/auth")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class AuthResource {

    @Inject
    AuthService authService;

    @Inject
    JsonWebToken jwt;

    @POST
    @Path("/register")
    public Response register(@Valid AuthRequests.Register request) {
        AuthResponses.Session session = authService.register(request);
        return Response.status(Response.Status.CREATED).entity(session).build();
    }

    @POST
    @Path("/login")
    public AuthResponses.Session login(@Valid AuthRequests.Login request) {
        return authService.login(request);
    }

    @GET
    @Path("/me")
    @Authenticated
    public AuthResponses.Session currentSession() {
        return authService.currentSession(jwt.getSubject(), jwt.getRawToken(), jwt.getGroups());
    }
}

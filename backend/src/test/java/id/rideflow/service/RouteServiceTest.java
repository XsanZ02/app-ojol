package id.rideflow.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import jakarta.ws.rs.WebApplicationException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertNull;

class RouteServiceTest {

    private HttpServer server;
    private volatile int responseStatus;
    private final AtomicReference<String> requestBody = new AtomicReference<>();
    private RouteService routeService;

    @BeforeEach
    void startProvider() throws Exception {
        responseStatus = 200;
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/route", exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            String body = responseStatus == 200
                    ? """
                            {"trip":{"summary":{"length":4.8,"time":900},
                              "legs":[{"shape":"encoded-polyline6"}]}}
                            """
                    : "{\"error\":\"provider unavailable\"}";
            byte[] content = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(responseStatus, content.length);
            try (var output = exchange.getResponseBody()) {
                output.write(content);
            }
        });
        server.start();

        routeService = new RouteService();
        setField("valhallaUrl", "http://127.0.0.1:" + server.getAddress().getPort() + "/route");
        setField("timeoutSeconds", 2L);
        setField("objectMapper", new ObjectMapper());
    }

    @AfterEach
    void stopProvider() {
        if (server != null) server.stop(0);
    }

    @Test
    void requestsMotorcycleRoadRoutingAndReturnsProviderDistanceAndGeometry() {
        var route = routeService.estimate(
                new BigDecimal("-8.6834"),
                new BigDecimal("115.2289"),
                new BigDecimal("-8.6755"),
                new BigDecimal("115.2635"),
                "motorcycle");

        assertEquals(4800L, route.distanceMeters());
        assertEquals(900, route.durationSeconds());
        assertEquals("encoded-polyline6", route.geometry());
        assertEquals("valhalla:motor_scooter", route.provider());
        assertTrue(requestBody.get().contains("\"costing\":\"motor_scooter\""));
    }

    @Test
    void reportsProviderFailureWithoutInventingAnEstimate() {
        responseStatus = 503;

        WebApplicationException exception = assertThrows(
                WebApplicationException.class,
                () -> routeService.estimate(
                        new BigDecimal("-8.6834"),
                        new BigDecimal("115.2289"),
                        new BigDecimal("-8.6755"),
                        new BigDecimal("115.2635"),
                        "MOTOR"));

        assertEquals(503, exception.getResponse().getStatus());
    }

    @Test
    void reportsUnroutableLocationsSeparatelyFromProviderOutages() {
        responseStatus = 400;

        WebApplicationException exception = assertThrows(
                WebApplicationException.class,
                () -> routeService.estimate(
                        new BigDecimal("-8.6834"),
                        new BigDecimal("115.2289"),
                        new BigDecimal("-8.6755"),
                        new BigDecimal("115.2635"),
                        "MOTOR"));

        assertEquals(422, exception.getResponse().getStatus());
    }

    @Test
    void rejectsInvalidCoordinatesBeforeCallingProvider() {
        WebApplicationException exception = assertThrows(
                WebApplicationException.class,
                () -> routeService.estimate(
                        new BigDecimal("91"),
                        new BigDecimal("115.2289"),
                        new BigDecimal("-8.6755"),
                        new BigDecimal("115.2635"),
                        "MOTOR"));

        assertEquals(400, exception.getResponse().getStatus());
        assertNull(requestBody.get());
    }

    private void setField(String name, Object value) throws Exception {
        var field = RouteService.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(routeService, value);
    }
}

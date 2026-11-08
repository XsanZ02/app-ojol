package id.rideflow.service;

import id.rideflow.dto.TripResponses;
import io.smallrye.mutiny.subscription.Cancellable;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TripEventServiceTest {

    @Test
    void publishesOnlyToTheTripSubscriberAndAvailableOrderSubscribers() {
        TripEventService eventService = new TripEventService();
        List<TripEventService.TripEvent> matchingTripEvents = new ArrayList<>();
        List<TripEventService.TripEvent> otherTripEvents = new ArrayList<>();
        List<TripEventService.AvailableOrderEvent> driverEvents = new ArrayList<>();
        List<TripEventService.AvailableOrderEvent> mismatchedDriverEvents = new ArrayList<>();
        Cancellable matchingTripSubscription = eventService.subscribeToTrip("42")
                .subscribe().with(matchingTripEvents::add);
        Cancellable otherTripSubscription = eventService.subscribeToTrip("43")
                .subscribe().with(otherTripEvents::add);
        Cancellable driverSubscription = eventService.subscribeToAvailableOrders(Set.of("MOTOR"))
                .subscribe().with(driverEvents::add);
        Cancellable mismatchedDriverSubscription = eventService.subscribeToAvailableOrders(Set.of("MOBIL"))
                .subscribe().with(mismatchedDriverEvents::add);

        eventService.publish(acceptedTrip());

        TripEventService.TripEvent expected =
                new TripEventService.TripEvent("42", "ACCEPTED", "2026-11-09T00:00:00Z");
        assertEquals(List.of(expected), matchingTripEvents);
        assertEquals(List.of(new TripEventService.AvailableOrderEvent("MOTOR")), driverEvents);
        assertEquals(List.of(), otherTripEvents);
        assertEquals(List.of(), mismatchedDriverEvents);

        matchingTripSubscription.cancel();
        otherTripSubscription.cancel();
        driverSubscription.cancel();
        mismatchedDriverSubscription.cancel();
    }

    private static TripResponses.Trip acceptedTrip() {
        return new TripResponses.Trip(
                "42",
                "ACCEPTED",
                "MOTOR",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                "IDR",
                List.of(),
                "2026-11-09T00:00:00Z",
                "2026-11-09T00:00:00Z",
                "2026-11-09T00:00:00Z",
                null,
                null,
                null,
                null,
                null,
                null,
                "Driver",
                null,
                "Motor",
                "DK1234AA");
    }
}

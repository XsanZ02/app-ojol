package id.rideflow.service;

import id.rideflow.dto.TripResponses;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.subscription.BackPressureStrategy;
import io.smallrye.mutiny.subscription.MultiEmitter;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.CopyOnWriteArraySet;

@ApplicationScoped
public class TripEventService {

    private final ConcurrentMap<String, CopyOnWriteArraySet<MultiEmitter<? super TripEvent>>> tripSubscribers =
            new ConcurrentHashMap<>();
    private final CopyOnWriteArraySet<DriverSubscription> driverSubscribers =
            new CopyOnWriteArraySet<>();

    public Multi<TripEvent> subscribeToTrip(String tripId) {
        return Multi.createFrom().emitter(emitter -> {
            CopyOnWriteArraySet<MultiEmitter<? super TripEvent>> subscribers =
                    tripSubscribers.computeIfAbsent(tripId, ignored -> new CopyOnWriteArraySet<>());
            subscribers.add(emitter);
            emitter.onTermination(() -> removeTripSubscriber(tripId, subscribers, emitter));
        }, BackPressureStrategy.LATEST);
    }

    public Multi<AvailableOrderEvent> subscribeToAvailableOrders(Set<String> eligibleVehicleTypes) {
        return Multi.createFrom().emitter(emitter -> {
            DriverSubscription subscription =
                    new DriverSubscription(Set.copyOf(eligibleVehicleTypes), emitter);
            driverSubscribers.add(subscription);
            emitter.onTermination(() -> driverSubscribers.remove(subscription));
        }, BackPressureStrategy.LATEST);
    }

    public void publish(TripResponses.Trip trip) {
        TripEvent event = new TripEvent(trip.id(), trip.status(), trip.updatedAt());
        CopyOnWriteArraySet<MultiEmitter<? super TripEvent>> tripListeners = tripSubscribers.get(trip.id());
        if (tripListeners != null) {
            emitTo(tripListeners, event);
        }
        AvailableOrderEvent orderEvent = new AvailableOrderEvent(trip.vehicleType());
        for (DriverSubscription subscriber : driverSubscribers) {
            if (subscriber.vehicleTypes().contains(trip.vehicleType())) {
                subscriber.emitter().emit(orderEvent);
            }
        }
    }

    private void removeTripSubscriber(
            String tripId,
            CopyOnWriteArraySet<MultiEmitter<? super TripEvent>> subscribers,
            MultiEmitter<? super TripEvent> emitter) {
        subscribers.remove(emitter);
        if (subscribers.isEmpty()) {
            tripSubscribers.remove(tripId, subscribers);
        }
    }

    private static void emitTo(
            CopyOnWriteArraySet<MultiEmitter<? super TripEvent>> subscribers,
            TripEvent event) {
        for (MultiEmitter<? super TripEvent> subscriber : subscribers) {
            subscriber.emit(event);
        }
    }

    public record TripEvent(String tripId, String status, String updatedAt) {
    }

    public record AvailableOrderEvent(String vehicleType) {
    }

    private record DriverSubscription(
            Set<String> vehicleTypes,
            MultiEmitter<? super AvailableOrderEvent> emitter) {
    }
}

package id.rideflow.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class FareCalculationServiceTest {

    @Test
    void calculatesMotorFareFromFractionalRoadDistance() {
        var fare = FareCalculationService.calculate(
                2500, "MOTOR", 5000, 2000, 8000, "IDR", "demo-v2-vehicle");

        assertEquals(10000, fare.amount().intValueExact());
        assertEquals("IDR", fare.currency());
        assertEquals("demo-v2-vehicle", fare.configVersion());
    }

    @Test
    void calculatesDifferentCarFareFromTheSameRoadDistance() {
        var fare = FareCalculationService.calculate(
                2500, "MOBIL", 8000, 3500, 12000, "IDR", "demo-v2-vehicle");

        assertEquals(16750, fare.amount().intValueExact());
        assertEquals(8000, fare.baseFare().intValueExact());
        assertEquals(3500, fare.farePerKilometer().intValueExact());
        assertEquals(12000, fare.minimumFare().intValueExact());
    }

    @Test
    void appliesMinimumAndRoundsToTheNearestRupiahHalfUp() {
        assertEquals(8000, FareCalculationService.calculate(
                1000, "MOTOR", 5000, 2000, 8000, "IDR", "demo-v2-vehicle")
                .amount().intValueExact());
        assertEquals(1, FareCalculationService.calculate(
                500, "MOTOR", 0, 1, 0, "IDR", "demo-v2-vehicle")
                .amount().intValueExact());
    }

    @Test
    void rejectsInvalidDistanceVehicleAndCurrencyConfiguration() {
        assertThrows(
                IllegalArgumentException.class,
                () -> FareCalculationService.calculate(
                        0, "MOTOR", 5000, 2000, 8000, "IDR", "demo-v2-vehicle"));
        assertThrows(
                IllegalArgumentException.class,
                () -> FareCalculationService.calculate(
                        1000, "TRUCK", 5000, 2000, 8000, "IDR", "demo-v2-vehicle"));
        assertThrows(
                IllegalStateException.class,
                () -> FareCalculationService.calculate(
                        1000, "MOTOR", 5000, 2000, 8000, "USD", "demo-v2-vehicle"));
    }
}

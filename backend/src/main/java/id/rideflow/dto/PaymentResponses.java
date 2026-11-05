package id.rideflow.dto;

import java.math.BigDecimal;

public final class PaymentResponses {

    private PaymentResponses() {
    }

    public record Payment(
            String tripId,
            String method,
            String status,
            BigDecimal amount,
            String currencyCode,
            String paidAt,
            String createdAt,
            String updatedAt) {
    }

    public record Error(String message, String code) {
    }
}

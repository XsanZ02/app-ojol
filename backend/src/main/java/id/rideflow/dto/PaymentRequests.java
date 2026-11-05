package id.rideflow.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public final class PaymentRequests {

    private PaymentRequests() {
    }

    public record Create(
            @NotBlank @Pattern(regexp = "cash|digital") String method) {
    }
}

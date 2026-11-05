package id.rideflow.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class VerificationRequests {

    private VerificationRequests() {
    }

    public record Decision(
            @NotBlank @Size(max = 16) String decision,
            @Size(max = 1000) String reason) {
    }
}

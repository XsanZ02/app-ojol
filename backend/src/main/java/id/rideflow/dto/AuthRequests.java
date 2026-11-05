package id.rideflow.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public final class AuthRequests {

    private AuthRequests() {
    }

    public record Login(
            @NotBlank @Email @Size(max = 320) String email,
            @NotBlank String password,
            Boolean rememberMe) {
    }

    public record Register(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Email @Size(max = 320) String email,
            @NotBlank @Size(min = 12, max = 72) String password,
            String role,
            List<String> roles,
            String phone,
            String vehicleType,
            String vehiclePlate,
            String vehicleModel) {
    }
}

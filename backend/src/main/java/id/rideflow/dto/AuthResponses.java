package id.rideflow.dto;

import java.util.List;

public final class AuthResponses {

    private AuthResponses() {
    }

    public record User(
            String id,
            String name,
            String email,
            String role,
            List<String> roles,
            String phone,
            String createdAt) {
    }

    public record Session(User user, String token) {
    }

    public record Error(String message, String code) {
    }
}

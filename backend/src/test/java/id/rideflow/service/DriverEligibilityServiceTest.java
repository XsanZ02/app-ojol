package id.rideflow.service;

import org.junit.jupiter.api.Test;

import static id.rideflow.service.DriverEligibilityService.EligibilitySnapshot;
import static id.rideflow.service.DriverEligibilityService.allowsAssignedTripProgress;
import static id.rideflow.service.DriverEligibilityService.allowsDrainingTripProgress;
import static id.rideflow.service.DriverEligibilityService.isEligible;
import static id.rideflow.service.DriverEligibilityService.queryFor;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DriverEligibilityServiceTest {

    @Test
    void v4RequiresApprovedProfile() {
        assertFalse(isEligible(snapshot("pending", true, true, true, true), true, true));
    }

    @Test
    void v4RequiresLatestProfileDocuments() {
        assertFalse(isEligible(snapshot("approved", false, true, true, true), true, true));
    }

    @Test
    void v4RequiresCurrentProfileApprovalEvent() {
        EligibilitySnapshot withoutEvent = new EligibilitySnapshot(
                "active", true, "active", true, "approved",
                false, true, true, true, "verified", true, true, true);
        assertFalse(isEligible(withoutEvent, true, true));
    }

    @Test
    void v4RequiresLatestVehicleDocuments() {
        assertFalse(isEligible(snapshot("approved", true, true, true, false), true, true));
    }

    @Test
    void drainingHoldBlocksNewOrderEligibility() {
        assertFalse(isEligible(snapshot("approved", true, false, true, true), true, true));
    }

    @Test
    void acceptanceIsRejectedWhenHoldAlreadyExists() {
        assertFalse(isEligible(snapshot("approved", true, false, true, true), true, true));
        assertFalse(isEligible(snapshot("approved", true, true, false, true), true, true));
    }

    @Test
    void heldHoldBlocksNewOrderEligibility() {
        assertFalse(isEligible(snapshot("approved", true, true, false, true), true, true));
    }

    @Test
    void onlyV4DrainingHoldAllowsAssignedTripProgressOverride() {
        assertTrue(allowsDrainingTripProgress(true, true, 41L, 41L, "accepted", true, true));
        assertFalse(allowsDrainingTripProgress(true, false, 41L, 41L, "accepted", true, true));
        assertFalse(allowsDrainingTripProgress(false, true, 41L, 41L, "accepted", true, true));
    }

    @Test
    void preexistingAssignedActiveTripCanUseDrainingOverride() {
        assertTrue(allowsDrainingTripProgress(true, true, 41L, 41L, "accepted", true, true));
    }

    @Test
    void normalProgressRequiresCurrentEligibilityUnlessTripIsDraining() {
        assertTrue(allowsAssignedTripProgress(true, false));
        assertTrue(allowsAssignedTripProgress(false, true));
        assertFalse(allowsAssignedTripProgress(false, false));
    }

    @Test
    void acceptanceAfterHoldIsRejectedAndCannotCreateTripForDrainingOverride() {
        assertFalse(isEligible(snapshot("approved", true, false, true, true), true, true));
        assertFalse(allowsDrainingTripProgress(true, true, null, 41L, null, false, true));
    }

    @Test
    void anotherDriversTripCannotUseDrainingOverride() {
        assertFalse(allowsDrainingTripProgress(true, true, 99L, 41L, "accepted", true, true));
    }

    @Test
    void terminalTripCannotUseDrainingOverride() {
        assertFalse(allowsDrainingTripProgress(true, true, 41L, 41L, "completed", true, true));
    }

    @Test
    void suspendedDriverCannotUseDrainingOverride() {
        assertFalse(allowsDrainingTripProgress(true, true, 41L, 41L, "in_progress", true, false));
    }

    @Test
    void tripWithoutAcceptanceTimestampCannotUseDrainingOverride() {
        assertFalse(allowsDrainingTripProgress(true, true, 41L, 41L, "accepted", false, true));
    }

    @Test
    void vehicleMustBeActiveAndVerified() {
        EligibilitySnapshot unverifiedVehicle = new EligibilitySnapshot(
                "active", true, "active", true, "approved",
                true, true, true, true, "pending", false, true, true);
        assertFalse(isEligible(unverifiedVehicle, true, true));
    }

    @Test
    void suspendedDriverIsNeverEligible() {
        EligibilitySnapshot suspendedProfile = new EligibilitySnapshot(
                "active", true, "suspended", true, "approved",
                true, true, true, true, "verified", true, true, true);
        assertFalse(isEligible(suspendedProfile, false, true));
    }

    @Test
    void featureFlagOffPreservesV3EligibilityWithoutV4Data() {
        assertTrue(isEligible(snapshot("pending", false, false, false, false), false, true));
        assertFalse(queryFor(false).contains("driver_documents"));
        assertFalse(queryFor(false).contains("driver_order_acceptance_holds"));
        assertTrue(queryFor(true).contains("driver_documents"));
    }

    @Test
    void onlineRequirementRemainsEnforced() {
        EligibilitySnapshot offline = new EligibilitySnapshot(
                "active", true, "active", false, "approved",
                true, true, true, true, "verified", true, true, true);
        assertFalse(isEligible(offline, true, true));
        assertTrue(isEligible(offline, true, false));
    }

    private static EligibilitySnapshot snapshot(
            String profileVerificationStatus,
            boolean profileDocumentsVerified,
            boolean noDrainingHold,
            boolean noHeldHold,
            boolean vehicleDocumentsVerified) {
        return new EligibilitySnapshot(
                "active",
                true,
                "active",
                true,
                profileVerificationStatus,
                true,
                profileDocumentsVerified,
                noDrainingHold,
                noHeldHold,
                "verified",
                true,
                true,
                vehicleDocumentsVerified);
    }
}

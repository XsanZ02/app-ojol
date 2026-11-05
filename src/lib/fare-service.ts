import { FareEstimate, LocationPoint, VehicleType } from "@/types/booking";

export interface FareConfig {
  baseFare: number;
  baseDistanceKm: number;
  ratePerKm: number;
  minFare: number;
}

const FARE_CONFIG: Record<VehicleType, FareConfig> = {
  MOTOR: {
    baseFare: 9000,
    baseDistanceKm: 2,
    ratePerKm: 2500,
    minFare: 9000,
  },
  MOBIL: {
    baseFare: 18000,
    baseDistanceKm: 2,
    ratePerKm: 5000,
    minFare: 18000,
  },
};

/**
 * Calculates straight line distance in km between two lat/lng coordinates (Haversine formula)
 * and applies a realistic road circuity factor (~1.3x)
 */
export function calculateDistanceKm(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((destination.lat - origin.lat) * Math.PI) / 180;
  const dLon = ((destination.lng - origin.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((origin.lat * Math.PI) / 180) *
      Math.cos((destination.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightDistance = R * c;

  // Road factor in urban Bali (approx 1.35x due to road layouts)
  const estimatedRoadKm = Math.max(1.2, straightDistance * 1.35);
  return Math.round(estimatedRoadKm * 10) / 10;
}

/**
 * Calculates estimated travel duration in minutes
 */
export function calculateDurationMin(distanceKm: number, vehicleType: VehicleType): number {
  // Motor average speed in Denpasar: 25 km/h + 3 min buffer
  // Mobil average speed in Denpasar: 18 km/h + 5 min buffer
  const avgSpeed = vehicleType === "MOTOR" ? 25 : 18;
  const buffer = vehicleType === "MOTOR" ? 3 : 5;
  const minutes = Math.round((distanceKm / avgSpeed) * 60) + buffer;
  return Math.max(5, minutes);
}

/**
 * Centralized fare calculation service.
 * In production, this can be swapped to call POST /api/v1/fares/estimate on the Quarkus backend.
 */
export class FareService {
  static calculateFare(distanceKm: number, vehicleType: VehicleType): number {
    const config = FARE_CONFIG[vehicleType];
    if (distanceKm <= config.baseDistanceKm) {
      return config.baseFare;
    }
    const extraKm = distanceKm - config.baseDistanceKm;
    const rawFare = config.baseFare + extraKm * config.ratePerKm;
    // Round to nearest 500 for Indonesian cash/wallet convenience
    return Math.max(config.minFare, Math.ceil(rawFare / 500) * 500);
  }

  static getEstimate(
    pickup: LocationPoint,
    destination: LocationPoint,
    vehicleType: VehicleType
  ): FareEstimate {
    const distanceKm = calculateDistanceKm(pickup, destination);
    const durationMin = calculateDurationMin(distanceKm, vehicleType);
    const config = FARE_CONFIG[vehicleType];
    const estimatedFare = this.calculateFare(distanceKm, vehicleType);

    const isMotor = vehicleType === "MOTOR";
    return {
      vehicleType,
      vehicleLabel: isMotor ? "RideFlow Ride (Motor)" : "RideFlow Car (Mobil)",
      vehicleDescription: isMotor
        ? "Cepat & gesit menembus lalu lintas kota"
        : "Nyaman ber-AC untuk hingga 4 penumpang",
      estimatedFare,
      distanceKm,
      durationMin,
      baseFare: config.baseFare,
      ratePerKm: config.ratePerKm,
    };
  }

  static getAllEstimates(
    pickup: LocationPoint,
    destination: LocationPoint
  ): FareEstimate[] {
    return [
      this.getEstimate(pickup, destination, "MOTOR"),
      this.getEstimate(pickup, destination, "MOBIL"),
    ];
  }
}


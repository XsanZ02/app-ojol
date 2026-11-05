export type { VehicleType } from './driver';
import type { VehicleType } from './driver';

export type BookingStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PICKING_UP'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface LocationPoint {
  address: string;
  name: string;
  district?: string; // e.g. Panjer, Renon, Sanur
  lat: number;
  lng: number;
  notes?: string;
}

export interface StatusHistoryItem {
  status: BookingStatus;
  timestamp: string;
  note?: string;
}

export interface Booking {
  id: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  driverRating?: number;
  vehicleType: VehicleType;
  vehicleModel?: string;
  vehiclePlate?: string;
  pickup: LocationPoint;
  destination: LocationPoint;
  tripNotes?: string;
  estimatedDistanceKm: number;
  estimatedDurationMin: number;
  estimatedFare: number;
  finalFare?: number;
  currencyCode?: string;
  status: BookingStatus;
  statusHistory: StatusHistoryItem[];
  createdAt: string;
  updatedAt: string;
  cancellationReason?: string;
}

export interface BookingRequest {
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupName?: string;
  destinationAddress: string;
  destinationLatitude: number;
  destinationLongitude: number;
  destinationName?: string;
  vehicleType: VehicleType;
  tripNotes?: string;
}

export interface FareEstimate {
  vehicleType: VehicleType;
  vehicleLabel: string;
  vehicleDescription: string;
  estimatedFare: number;
  distanceKm: number;
  durationMin: number;
  baseFare: number;
  ratePerKm: number;
}

export type VehicleType = 'MOTOR' | 'MOBIL';

export interface DriverProfile {
  userId: string;
  phone: string;
  vehicleType: VehicleType;
  vehiclePlate: string;
  vehicleModel: string;
  rating: number;
  totalRatingsCount: number;
  isOnline: boolean;
  totalTrips: number;
  completedTrips: number;
  todayTrips: number;
  todayEarnings: number;
  joinedDate: string;
}


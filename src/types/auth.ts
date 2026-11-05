import { User, UserRole } from './user';
import { DriverProfile, VehicleType } from './driver';

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  role: Exclude<UserRole, 'ADMIN'>;
  phone?: string;
  vehicleType?: VehicleType;
  vehiclePlate?: string;
  vehicleModel?: string;
}

export interface AuthSession {
  user: User;
  driverProfile?: DriverProfile;
  token: string;
}

export interface ApiError {
  message: string;
  code?: string;
  fieldErrors?: Record<string, string>;
}

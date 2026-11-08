import {
  Booking,
  BookingRequest,
  BookingStatus,
  RouteEstimate,
  StatusHistoryItem,
} from "@/types/booking";
import type { VehicleType } from "@/types/driver";
import { User } from "@/types/user";
import { MockStorage } from "./mock-storage";
import {
  AuthApiError,
  authenticatedRequest,
  subscribeToAuthenticatedEvents,
  type EventStreamConnectionState,
} from "./auth-api";

/**
 * Artificial delay to simulate network latency in prototype mode
 */
const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

interface ApiTrip {
  id: string;
  status: string;
  vehicleType: string;
  pickup: { address: string; name: string; lat: number; lng: number };
  destination: { address: string; name: string; lat: number; lng: number };
  tripNotes: string | null;
  estimatedDistanceKm: number | null;
  routeDistanceMeters: number | null;
  estimatedDurationMin: number | null;
  estimatedDurationSeconds: number | null;
  estimatedFare: number;
  routingProvider: string | null;
  routeGeometry: string | null;
  fareConfigVersion: string | null;
  finalFare: number | null;
  currencyCode: string;
  statusHistory: { status: string; timestamp: string; note: string | null }[];
  createdAt: string;
  updatedAt: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  vehicleModel?: string | null;
  vehiclePlate?: string | null;
}

export interface DriverApiProfile {
  userId: string;
  status: string;
  verificationStatus: string;
  rejectionReason: string | null;
  reviewedAt: string | null;
  submissionVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface DriverDocument {
  id: string;
  driverId: string;
  type: "ktp" | "sim" | "stnk" | "vehicle_photo";
  version: number;
  vehicleId: string | null;
  filename: string;
  mimeType: string;
  fileSize: number;
  status: string;
  rejectionReason: string | null;
  reviewerId: string | null;
  reviewedAt: string | null;
  uploadedAt: string;
}

export interface DriverVehicle {
  id: string;
  vehicleType: VehicleType;
  vehiclePlate: string;
  make: string;
  model: string;
  color: string;
  verificationStatus: string;
  rejectionReason: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DriverStatistics {
  todayEarnings: number;
  todayTrips: number;
  completedTrips: number;
  rating: number | null;
  totalRatingsCount: number;
}

const allowedStatuses: BookingStatus[] = [
    "PENDING",
    "ACCEPTED",
    "PICKING_UP",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
];

function mapStatus(value: string): BookingStatus {
  const normalized = value === "requested" ? "PENDING" : value.toUpperCase();
  const status = allowedStatuses.find(
    (allowedStatus) => allowedStatus === normalized
  );
  if (!status) {
    throw new Error("Server mengirim status perjalanan yang tidak valid.");
  }
  return status;
}

function mapTrip(value: ApiTrip): Booking {
  const status = mapStatus(value.status);
  if (value.vehicleType !== "MOTOR" && value.vehicleType !== "MOBIL") {
    throw new Error("Server mengirim jenis kendaraan yang tidak valid.");
  }

  const history: StatusHistoryItem[] = value.statusHistory.map((item) => ({
    status: mapStatus(item.status),
    timestamp: item.timestamp,
    ...(item.note ? { note: item.note } : {}),
  }));
  return {
    id: value.id,
    vehicleType: value.vehicleType,
    pickup: {
      address: value.pickup.address,
      name: value.pickup.name,
      lat: value.pickup.lat,
      lng: value.pickup.lng,
    },
    destination: {
      address: value.destination.address,
      name: value.destination.name,
      lat: value.destination.lat,
      lng: value.destination.lng,
    },
    ...(value.tripNotes ? { tripNotes: value.tripNotes } : {}),
    ...(value.customerId ? { customerId: value.customerId } : {}),
    ...(value.customerName ? { customerName: value.customerName } : {}),
    ...(value.customerPhone ? { customerPhone: value.customerPhone } : {}),
    estimatedDistanceKm: value.estimatedDistanceKm ?? null,
    routeDistanceMeters: value.routeDistanceMeters,
    estimatedDurationMin: value.estimatedDurationMin,
    estimatedDurationSeconds: value.estimatedDurationSeconds,
    estimatedFare: value.estimatedFare,
    routingProvider: value.routingProvider,
    routeGeometry: value.routeGeometry,
    fareConfigVersion: value.fareConfigVersion,
    ...(value.finalFare !== null ? { finalFare: value.finalFare } : {}),
    currencyCode: value.currencyCode,
    ...(value.driverName ? { driverName: value.driverName } : {}),
    ...(value.driverPhone ? { driverPhone: value.driverPhone } : {}),
    ...(value.vehicleModel ? { vehicleModel: value.vehicleModel } : {}),
    ...(value.vehiclePlate ? { vehiclePlate: value.vehiclePlate } : {}),
    status,
    statusHistory: history,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function mapTrips(value: ApiTrip[]): Booking[] {
  if (!Array.isArray(value)) {
    throw new Error("Server mengirim daftar perjalanan yang tidak valid.");
  }
  return value.map(mapTrip);
}
 
/**
 * Profile editing: Driver updates are persisted to backend Quarkus endpoints,
 * while customer profile falls back to session/storage.
 */
export const profileApi = {
  async updateProfile(
    userId: string,
    updates: Partial<User> & {
      vehicleType?: string;
      vehiclePlate?: string;
      vehicleModel?: string;
      make?: string;
      color?: string;
    }
  ): Promise<User> {
    const session = MockStorage.getSession();
    if (!session) throw new Error("Sesi login telah berakhir");

    if (session?.user.role === "DRIVER") {
      if (session.user.id !== userId) {
        throw new Error("Profil tidak sesuai dengan sesi login");
      }

      const hasVehicleUpdates = Boolean(
        updates.vehicleType ||
          updates.vehiclePlate ||
          updates.vehicleModel ||
          updates.make ||
          updates.color
      );

      if (hasVehicleUpdates) {
        if (
          !updates.vehicleType ||
          !updates.vehiclePlate ||
          !updates.make ||
          !updates.vehicleModel ||
          !updates.color
        ) {
          throw new Error("Lengkapi jenis, plat, merek, model, dan warna kendaraan.");
        }

        const vehicles = await driverApi.getVehicles();
        const payload = {
          vehicleType: updates.vehicleType,
          vehiclePlate: updates.vehiclePlate,
          make: updates.make,
          model: updates.vehicleModel,
          color: updates.color,
        };

        if (vehicles.length > 0) {
          const vehicle = vehicles[0];
          if (vehicle.verificationStatus !== "pending") {
            throw new Error("Kendaraan yang telah diproses tidak dapat diubah dari profil.");
          }
          await driverApi.updateVehicle(vehicle.id, payload);
        } else {
          await driverApi.registerVehicle(payload);
        }
      }

      const hasIdentityUpdates =
        updates.name !== undefined || updates.phone !== undefined;
      const updatedProfile = hasIdentityUpdates
        ? await driverApi.updateProfile({
            name: updates.name ?? session.user.name,
            phone: updates.phone ?? session.user.phone ?? "",
          })
        : null;
      const updatedUser: User = {
        ...session.user,
        ...(updatedProfile ? updatedProfile : {}),
      };

      session.user = updatedUser;
      MockStorage.setSession(session);
      return updatedUser;
    }

    const updatedUser: User = {
      ...session.user,
      ...updates,
    };
    MockStorage.saveCustomer(updatedUser);
    session.user = updatedUser;
    MockStorage.setSession(session);
    return updatedUser;
  },
};

/**
 * Customer trips and driver orders backed by the Quarkus trips API.
 */
export const bookingsApi = {
  async create(req: BookingRequest): Promise<Booking> {
    const trip = await authenticatedRequest<ApiTrip>("/trips", {
      method: "POST",
      body: {
        pickupAddress: req.pickupAddress,
        pickupLatitude: req.pickupLatitude,
        pickupLongitude: req.pickupLongitude,
        destinationAddress: req.destinationAddress,
        destinationLatitude: req.destinationLatitude,
        destinationLongitude: req.destinationLongitude,
        vehicleType: req.vehicleType,
        tripNotes: req.tripNotes?.trim() || null,
        currencyCode: "IDR",
      },
    });
    return mapTrip(trip);
  },

  async getMyBookings(): Promise<Booking[]> {
    const trips = await authenticatedRequest<ApiTrip[]>("/trips/me", {
      method: "GET",
    });
    return mapTrips(trips);
  },

  async getAvailableBookings(): Promise<Booking[]> {
    return driverApi.getAvailableOrders();
  },

  async getById(id: string): Promise<Booking | null> {
    try {
      const trip = await authenticatedRequest<ApiTrip>(
        `/trips/${encodeURIComponent(id)}`,
        { method: "GET" }
      );
      return mapTrip(trip);
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  },

  async accept(bookingId: string): Promise<Booking> {
    const trip = await authenticatedRequest<ApiTrip>(
      `/trips/${encodeURIComponent(bookingId)}/accept`,
      { method: "POST" }
    );
    return mapTrip(trip);
  },

  async updateStatus(
    bookingId: string,
    nextStatus: BookingStatus
  ): Promise<Booking> {
    const actions: Partial<Record<BookingStatus, string>> = {
      PICKING_UP: "picking-up",
      IN_PROGRESS: "start",
      COMPLETED: "complete",
    };
    const action = actions[nextStatus];
    if (!action) {
      throw new Error("Status perjalanan tidak dapat diperbarui melalui API ini.");
    }
    const trip = await authenticatedRequest<ApiTrip>(
      `/trips/${encodeURIComponent(bookingId)}/${action}`,
      { method: "POST" }
    );
    return mapTrip(trip);
  },

  async cancel(bookingId: string, reason?: string): Promise<Booking> {
    const trip = await authenticatedRequest<ApiTrip>(
      `/trips/${encodeURIComponent(bookingId)}/cancel`,
      { method: "POST", body: { reason } }
    );
    return mapTrip(trip);
  },

  subscribeToTripUpdates(
    bookingId: string,
    onUpdate: () => void,
    onConnectionState: (state: EventStreamConnectionState) => void,
    onError?: (error: Error) => void
  ): () => void {
    return subscribeToAuthenticatedEvents(
      `/trips/${encodeURIComponent(bookingId)}/events`,
      onUpdate,
      onConnectionState,
      onError
    );
  },
};

export const routesApi = {
  async estimate(input: {
    pickupLatitude: number;
    pickupLongitude: number;
    destinationLatitude: number;
    destinationLongitude: number;
    vehicleType: VehicleType;
  }): Promise<RouteEstimate> {
    const response = await authenticatedRequest<Omit<RouteEstimate, "vehicleType">>(
      "/routes/estimate",
      { method: "POST", body: input }
    );
    return { ...response, vehicleType: input.vehicleType };
  },
};

/**
 * Driver Service
 * Communicates with Quarkus /drivers/...
 */
export const driverApi = {
  subscribeToAvailableOrderUpdates(
    onUpdate: () => void,
    onConnectionState: (state: EventStreamConnectionState) => void,
    onError?: (error: Error) => void
  ): () => void {
    return subscribeToAuthenticatedEvents(
      "/drivers/me/orders/events",
      onUpdate,
      onConnectionState,
      onError
    );
  },

  async getProfile(): Promise<DriverApiProfile> {
    return authenticatedRequest("/drivers/me/profile", { method: "GET" });
  },

  async updateProfile(updates: {
    name: string;
    phone: string;
  }): Promise<{ name: string; phone: string }> {
    return authenticatedRequest("/drivers/me/profile", {
      method: "PUT",
      body: updates,
    });
  },

  async getVehicles(): Promise<DriverVehicle[]> {
    const response = await authenticatedRequest<{ vehicles: DriverVehicle[] }>(
      "/drivers/me/vehicles",
      { method: "GET" }
    );
    return response.vehicles;
  },

  async getDocuments(): Promise<DriverDocument[]> {
    return authenticatedRequest("/drivers/me/documents", { method: "GET" });
  },

  async uploadDocument(
    documentType: DriverDocument["type"],
    file: File,
    vehicleId?: string
  ): Promise<DriverDocument> {
    const contentBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = reader.result;
        if (typeof value !== "string") {
          reject(new Error("File tidak dapat dibaca."));
          return;
        }
        resolve(value.slice(value.indexOf(",") + 1));
      };
      reader.onerror = () => reject(new Error("File tidak dapat dibaca."));
      reader.readAsDataURL(file);
    });
    return authenticatedRequest("/drivers/me/documents", {
      method: "POST",
      body: {
        documentType,
        ...(vehicleId ? { vehicleId } : {}),
        filename: file.name,
        mimeType: file.type,
        contentBase64,
      },
    });
  },

  async setVehicleActive(vehicleId: string, isActive: boolean): Promise<DriverVehicle> {
    return authenticatedRequest(
      `/drivers/me/vehicles/${encodeURIComponent(vehicleId)}/active`,
      { method: "PATCH", body: { isActive } }
    );
  },

  async registerVehicle(vehicle: {
    vehicleType: string;
    vehiclePlate: string;
    make: string;
    model: string;
    color: string;
  }): Promise<DriverVehicle> {
    return authenticatedRequest("/drivers/me/vehicles", {
      method: "POST",
      body: vehicle,
    });
  },

  async updateVehicle(
    vehicleId: string,
    vehicle: {
      vehicleType: string;
      vehiclePlate: string;
      make: string;
      model: string;
      color: string;
    }
  ): Promise<DriverVehicle> {
    return authenticatedRequest(`/drivers/me/vehicles/${encodeURIComponent(vehicleId)}`, {
      method: "PUT",
      body: vehicle,
    });
  },

  async getOnlineStatus(): Promise<boolean> {
    const response = await authenticatedRequest<{ isOnline: boolean }>(
      "/drivers/me/status",
      { method: "GET" }
    );
    return response.isOnline;
  },

  async setOnlineStatus(isOnline: boolean): Promise<boolean> {
    const response = await authenticatedRequest<{ isOnline: boolean }>(
      "/drivers/me/status",
      { method: "PUT", body: { isOnline } }
    );
    return response.isOnline;
  },

  async getStatistics(): Promise<DriverStatistics> {
    return authenticatedRequest("/drivers/me/statistics", { method: "GET" });
  },

  async getAvailableOrders(): Promise<Booking[]> {
    const trips = await authenticatedRequest<ApiTrip[]>(
      "/drivers/me/orders",
      { method: "GET" }
    );
    return mapTrips(trips);
  },

  async getAvailableOrderById(id: string): Promise<Booking | null> {
    const orders = await this.getAvailableOrders();
    return orders.find((booking) => booking.id === id) || null;
  },

  async getMyBookings(): Promise<Booking[]> {
    const trips = await authenticatedRequest<ApiTrip[]>(
      "/drivers/me/trips",
      { method: "GET" }
    );
    return mapTrips(trips);
  },

  async getActiveTrip(): Promise<Booking | null> {
    const trip = await authenticatedRequest<ApiTrip | null>(
      "/drivers/me/trips/active",
      { method: "GET" }
    );
    return trip ? mapTrip(trip) : null;
  },

  async toggleAvailability(): Promise<boolean> {
    return this.setOnlineStatus(!(await this.getOnlineStatus()));
  },
};

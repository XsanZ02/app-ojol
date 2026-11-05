import { Booking, BookingRequest, BookingStatus } from "@/types/booking";
import { DriverProfile } from "@/types/driver";
import { User } from "@/types/user";
import {
  INITIAL_BOOKINGS,
  INITIAL_CUSTOMERS,
  INITIAL_DRIVERS,
  MOCK_LOCATIONS,
} from "./mock-data";
import { FareService } from "./fare-service";
import { generateBookingId } from "./utils";

const STORAGE_KEYS = {
  BOOKINGS: "rideflow_bookings",
  CUSTOMERS: "rideflow_customers",
  DRIVERS: "rideflow_drivers",
  INITIALIZED: "rideflow_initialized_v1",
};

const STORAGE_EVENT_NAME = "rideflow:state-changed";

type MockSession = {
  user: User;
  driverProfile?: DriverProfile;
};

// Safe localStorage access for SSR
const isBrowser = typeof window !== "undefined";
let mockSession: MockSession | null = null;

function emitChange() {
  if (isBrowser) {
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT_NAME));
  }
}

export class MockStorage {
  /**
   * Initializes demo data in localStorage if not already present
   */
  static initDemoData(force = false): void {
    if (!isBrowser) return;

    if (!force && localStorage.getItem(STORAGE_KEYS.INITIALIZED)) {
      return;
    }

    localStorage.setItem(
      STORAGE_KEYS.CUSTOMERS,
      JSON.stringify(INITIAL_CUSTOMERS)
    );

    const driversMap: Record<string, { user: User; profile: DriverProfile }> = {};
    INITIAL_DRIVERS.forEach((d) => {
      driversMap[d.user.id] = d;
    });
    localStorage.setItem(STORAGE_KEYS.DRIVERS, JSON.stringify(driversMap));

    localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify(INITIAL_BOOKINGS));

    localStorage.setItem(STORAGE_KEYS.INITIALIZED, "true");
    emitChange();
  }

  /**
   * Reset everything back to the clean initial demo state
   */
  static resetDemoData(): void {
    if (!isBrowser) return;
    localStorage.removeItem(STORAGE_KEYS.INITIALIZED);
    this.initDemoData(true);
    emitChange();
  }

  /**
   * Non-authoritative identity projection for mock booking features.
   */
  static getSession(): MockSession | null {
    if (!isBrowser) return null;
    this.ensureInitialized();
    return mockSession;
  }

  static setSession(session: MockSession | null): void {
    if (!isBrowser) return;
    mockSession = session;
    if (!session) {
      localStorage.removeItem("rideflow_session");
    }
    emitChange();
  }

  /**
   * Customers
   */
  static getCustomers(): User[] {
    if (!isBrowser) return INITIAL_CUSTOMERS;
    this.ensureInitialized();
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    if (!raw) return INITIAL_CUSTOMERS;
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_CUSTOMERS;
    }
  }

  static saveCustomer(user: User): void {
    if (!isBrowser) return;
    const customers = this.getCustomers();
    const idx = customers.findIndex((c) => c.id === user.id);
    if (idx >= 0) {
      customers[idx] = user;
    } else {
      customers.push(user);
    }
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    emitChange();
  }

  /**
   * Drivers
   */
  static getDriversMap(): Record<string, { user: User; profile: DriverProfile }> {
    if (!isBrowser) {
      const map: Record<string, { user: User; profile: DriverProfile }> = {};
      INITIAL_DRIVERS.forEach((d) => (map[d.user.id] = d));
      return map;
    }
    this.ensureInitialized();
    const raw = localStorage.getItem(STORAGE_KEYS.DRIVERS);
    if (!raw) {
      const map: Record<string, { user: User; profile: DriverProfile }> = {};
      INITIAL_DRIVERS.forEach((d) => (map[d.user.id] = d));
      return map;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  static getDriverProfile(userId: string): DriverProfile | null {
    const map = this.getDriversMap();
    return map[userId]?.profile || null;
  }

  static updateDriverProfile(
    userId: string,
    updates: Partial<DriverProfile>
  ): DriverProfile | null {
    if (!isBrowser) return null;
    const map = this.getDriversMap();
    if (!map[userId]) return null;

    map[userId].profile = {
      ...map[userId].profile,
      ...updates,
    };
    localStorage.setItem(STORAGE_KEYS.DRIVERS, JSON.stringify(map));

    // Update active session if currently logged in as this driver
    const currentSession = this.getSession();
    if (currentSession?.user.id === userId) {
      currentSession.driverProfile = map[userId].profile;
      this.setSession(currentSession);
    }

    emitChange();
    return map[userId].profile;
  }

  static toggleDriverAvailability(userId: string): boolean {
    const profile = this.getDriverProfile(userId);
    if (!profile) return false;
    const newStatus = !profile.isOnline;
    this.updateDriverProfile(userId, { isOnline: newStatus });
    return newStatus;
  }

  /**
   * Bookings Management
   */
  static getBookings(): Booking[] {
    if (!isBrowser) return INITIAL_BOOKINGS;
    this.ensureInitialized();
    const raw = localStorage.getItem(STORAGE_KEYS.BOOKINGS);
    if (!raw) return INITIAL_BOOKINGS;
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_BOOKINGS;
    }
  }

  static saveBookings(bookings: Booking[]): void {
    if (!isBrowser) return;
    localStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify(bookings));
    emitChange();
  }

  static getBookingById(id: string): Booking | null {
    const bookings = this.getBookings();
    return bookings.find((b) => b.id === id) || null;
  }

  /**
   * Customer creates a new ride booking
   */
  static createBooking(
    req: BookingRequest,
    customer: User
  ): Booking {
    // Resolve coordinates from mock locations or pick reasonable defaults
    const pickupLoc =
      MOCK_LOCATIONS.find(
        (l) => l.name.toLowerCase() === req.pickupAddress.toLowerCase()
      ) || {
        name: req.pickupName || req.pickupAddress,
        address: req.pickupAddress,
        district: "Denpasar",
        lat: -8.6738,
        lng: 115.2392,
      };

    const destLoc =
      MOCK_LOCATIONS.find(
        (l) => l.name.toLowerCase() === req.destinationAddress.toLowerCase()
      ) || {
        name: req.destinationName || req.destinationAddress,
        address: req.destinationAddress,
        district: "Sanur",
        lat: -8.6755,
        lng: 115.2635,
      };

    const estimate = FareService.getEstimate(pickupLoc, destLoc, req.vehicleType);
    const now = new Date().toISOString();

    const newBooking: Booking = {
      id: generateBookingId(),
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone || "0812-3456-7890",
      vehicleType: req.vehicleType,
      pickup: pickupLoc,
      destination: destLoc,
      tripNotes: req.tripNotes?.trim() || undefined,
      estimatedDistanceKm: estimate.distanceKm,
      estimatedDurationMin: estimate.durationMin,
      estimatedFare: estimate.estimatedFare,
      status: "PENDING",
      statusHistory: [
        {
          status: "PENDING",
          timestamp: now,
          note: "Pesanan dibuat dan mencari pengemudi terdekat",
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    const bookings = this.getBookings();
    this.saveBookings([newBooking, ...bookings]);
    return newBooking;
  }

  /**
   * Cancel booking (Allowed only when PENDING)
   */
  static cancelBooking(bookingId: string, reason?: string): Booking | null {
    const bookings = this.getBookings();
    const idx = bookings.findIndex((b) => b.id === bookingId);
    if (idx === -1) return null;

    const booking = bookings[idx];
    if (booking.status !== "PENDING") {
      throw new Error("Hanya pesanan berstatus Menunggu (PENDING) yang dapat dibatalkan.");
    }

    const now = new Date().toISOString();
    const updated: Booking = {
      ...booking,
      status: "CANCELLED",
      cancellationReason: reason || "Dibatalkan oleh penumpang",
      updatedAt: now,
      statusHistory: [
        ...booking.statusHistory,
        {
          status: "CANCELLED",
          timestamp: now,
          note: reason || "Dibatalkan oleh penumpang",
        },
      ],
    };

    bookings[idx] = updated;
    this.saveBookings(bookings);
    return updated;
  }

  /**
   * Driver accepts a ride request
   */
  static acceptBooking(
    bookingId: string,
    driver: User,
    profile: DriverProfile
  ): Booking {
    const bookings = this.getBookings();
    const idx = bookings.findIndex((b) => b.id === bookingId);
    if (idx === -1) {
      throw new Error("Pesanan tidak ditemukan.");
    }

    const booking = bookings[idx];
    if (booking.status !== "PENDING") {
      throw new Error("Pesanan ini sudah tidak tersedia atau sudah diambil pengemudi lain.");
    }

    const now = new Date().toISOString();
    const updated: Booking = {
      ...booking,
      status: "ACCEPTED",
      driverId: driver.id,
      driverName: driver.name,
      driverPhone: profile.phone,
      driverRating: profile.rating,
      vehiclePlate: profile.vehiclePlate,
      vehicleModel: profile.vehicleModel,
      updatedAt: now,
      statusHistory: [
        ...booking.statusHistory,
        {
          status: "ACCEPTED",
          timestamp: now,
          note: `Pengemudi ${driver.name} telah menerima pesanan`,
        },
      ],
    };

    bookings[idx] = updated;
    this.saveBookings(bookings);
    return updated;
  }

  /**
   * Driver progresses trip status:
   * ACCEPTED -> PICKING_UP -> IN_PROGRESS -> COMPLETED
   */
  static progressBookingStatus(
    bookingId: string,
    nextStatus: BookingStatus,
    driverProfile?: DriverProfile
  ): Booking {
    const bookings = this.getBookings();
    const idx = bookings.findIndex((b) => b.id === bookingId);
    if (idx === -1) {
      throw new Error("Pesanan tidak ditemukan.");
    }

    const booking = bookings[idx];

    // Validate sequential transitions
    const validTransitions: Record<string, BookingStatus> = {
      ACCEPTED: "PICKING_UP",
      PICKING_UP: "IN_PROGRESS",
      IN_PROGRESS: "COMPLETED",
    };

    if (validTransitions[booking.status] !== nextStatus) {
      throw new Error(
        `Transisi status tidak valid: tidak dapat mengubah ${booking.status} menjadi ${nextStatus}.`
      );
    }

    const now = new Date().toISOString();
    let note = "";
    if (nextStatus === "PICKING_UP") {
      note = "Pengemudi sedang menuju ke titik penjemputan";
    } else if (nextStatus === "IN_PROGRESS") {
      note = "Penumpang sudah naik dan perjalanan dimulai";
    } else if (nextStatus === "COMPLETED") {
      note = "Perjalanan telah sampai di tujuan dengan selamat";
    }

    const updated: Booking = {
      ...booking,
      status: nextStatus,
      updatedAt: now,
      statusHistory: [
        ...booking.statusHistory,
        {
          status: nextStatus,
          timestamp: now,
          note,
        },
      ],
    };

    bookings[idx] = updated;
    this.saveBookings(bookings);

    // If completed, update driver earnings and trips count!
    if (nextStatus === "COMPLETED" && booking.driverId) {
      const currentProfile = this.getDriverProfile(booking.driverId);
      if (currentProfile) {
        this.updateDriverProfile(booking.driverId, {
          totalTrips: currentProfile.totalTrips + 1,
          completedTrips: currentProfile.completedTrips + 1,
          todayTrips: currentProfile.todayTrips + 1,
          todayEarnings: currentProfile.todayEarnings + booking.estimatedFare,
        });
      }
    }

    return updated;
  }

  /**
   * Subscribe to localStorage / state changes across components
   */
  static subscribe(callback: () => void): () => void {
    if (!isBrowser) return () => {};
    window.addEventListener(STORAGE_EVENT_NAME, callback);
    window.addEventListener("storage", callback);
    return () => {
      window.removeEventListener(STORAGE_EVENT_NAME, callback);
      window.removeEventListener("storage", callback);
    };
  }

  private static ensureInitialized(): void {
    if (isBrowser && !localStorage.getItem(STORAGE_KEYS.INITIALIZED)) {
      this.initDemoData();
    }
  }
}

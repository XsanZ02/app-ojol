import type { AuthSession, LoginRequest, RegisterRequest } from "@/types/auth";
import type { User, UserRole } from "@/types/user";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"
).replace(/\/+$/, "");

const TOKEN_STORAGE_KEY = "rideflow_access_token";

let volatileToken: string | null = null;

export class AuthApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(
    message: string,
    status?: number,
    code?: string
  ) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
    this.code = code;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) || volatileToken;
}

function setToken(token: string | null, rememberMe = true): void {
  volatileToken = rememberMe ? null : token;
  if (typeof window === "undefined") return;
  if (token && rememberMe) {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

function clearToken(): void {
  volatileToken = null;
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

async function request(
  path: string,
  options: {
    method: "GET" | "POST" | "PUT" | "PATCH";
    body?: unknown;
    token?: string;
  }
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method,
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new AuthApiError(
        "Tidak dapat terhubung ke server RideFlow. Periksa koneksi dan status backend."
      );
    }
    throw error;
  }

  const text = await response.text();
  let payload: unknown;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new AuthApiError("Server mengirim respons yang tidak valid.");
      }
    }
  }

  if (!response.ok) {
    throw toApiError(response.status, payload, path);
  }
  if (response.status === 204) {
    return undefined;
  }
  if (payload === undefined) {
    throw new AuthApiError("Server mengirim respons yang tidak valid.");
  }
  return payload;
}

export async function authenticatedRequest<T>(
  path: string,
  options: {
    method: "GET" | "POST" | "PUT" | "PATCH";
    body?: unknown;
  }
): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new AuthApiError(
      "Sesi login telah berakhir. Silakan masuk kembali.",
      401,
      "unauthorized"
    );
  }
  try {
    return (await request(path, { ...options, token })) as T;
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 401) {
      throw new AuthApiError(
        "Sesi login telah berakhir. Silakan masuk kembali.",
        error.status,
        error.code
      );
    }
    throw error;
  }
}

export async function authenticatedBlobRequest(path: string): Promise<Blob> {
  const token = getToken();
  if (!token) {
    throw new AuthApiError(
      "Sesi login telah berakhir. Silakan masuk kembali.",
      401,
      "unauthorized"
    );
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "*/*" },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new AuthApiError(
        "Tidak dapat terhubung ke server RideFlow. Periksa koneksi dan status backend."
      );
    }
    throw error;
  }
  if (!response.ok) {
    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : undefined;
    } catch {
      payload = undefined;
    }
    throw toApiError(response.status, payload, path);
  }
  return response.blob();
}

export interface AdminAccess {
  authorized: boolean;
  subject: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  status: string;
  createdAt: string;
}

export interface AdminUserPage {
  users: AdminUser[];
  total: number;
  page: number;
  size: number;
}

export interface AdminDashboard {
  totalUsers: number;
  totalDrivers: number;
  onlineDrivers: number;
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  revenue: number;
  recentOrders: AdminRecentOrder[];
  recentDriverActivity: AdminRecentDriverActivity[];
}

export interface AdminRecentOrder {
  id: string;
  status: string;
  vehicleType: string;
  customerName: string;
  driverName: string | null;
  estimatedFare: number;
  finalFare: number | null;
  currencyCode: string;
  requestedAt: string;
}

export interface AdminRecentDriverActivity {
  id: string;
  name: string;
  email: string;
  operationalStatus: string;
  online: boolean;
  updatedAt: string;
}

export interface AdminDriver {
  id: string;
  name: string;
  email: string;
  accountStatus: string;
  operationalStatus: string;
  online: boolean;
  vehicleCount: number;
  completedTrips: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDriverPage {
  drivers: AdminDriver[];
  total: number;
  page: number;
  size: number;
}

export interface AdminDriverVehicle {
  id: string;
  vehicleType: string;
  plate: string;
  make: string;
  model: string;
  color: string;
  verificationStatus: string;
  active: boolean;
}

export interface AdminDriverDetail {
  driver: AdminDriver;
  vehicles: AdminDriverVehicle[];
  recentOrders: AdminRecentOrder[];
}

export interface VerificationDocument {
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

export interface VerificationProfile {
  driverId: string;
  name: string;
  email: string;
  operationalStatus: string;
  verificationStatus: string;
  submissionVersion: number;
  rejectionReason: string | null;
  reviewedAt: string | null;
}

export interface VerificationVehicle {
  id: string;
  driverId: string;
  type: string;
  plate: string;
  make: string;
  model: string;
  color: string;
  verificationStatus: string;
  verificationVersion: number;
  active: boolean;
  rejectionReason: string | null;
  reviewedAt: string | null;
}

export interface VerificationEvent {
  subjectType: string;
  subjectId: string;
  decision: string;
  reviewerId: string;
  reviewedAt: string;
  rejectionReason: string | null;
}

export interface VerificationQueue {
  profiles: VerificationProfile[];
  vehicles: VerificationVehicle[];
  documents: VerificationDocument[];
}

export interface VerificationDriverDetail {
  profile: VerificationProfile;
  vehicles: VerificationVehicle[];
  documents: VerificationDocument[];
  history: VerificationEvent[];
}

export interface AdminOrder {
  id: string;
  status: string;
  vehicleType: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  driverId: string | null;
  driverName: string | null;
  driverEmail: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  estimatedFare: number;
  finalFare: number | null;
  currencyCode: string;
  requestedAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
}

export interface AdminOrderPage {
  orders: AdminOrder[];
  total: number;
  page: number;
  size: number;
}

export interface AdminOrderDetail {
  order: AdminOrder;
  history: { status: string; timestamp: string; note: string | null }[];
}

export interface AdminPayment {
  tripId: string;
  method: string;
  status: string;
  amount: number;
  currencyCode: string;
  customerName: string;
  driverName: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface AdminPaymentPage {
  payments: AdminPayment[];
  total: number;
  page: number;
  size: number;
}

export interface AdminPaymentReport {
  pendingCount: number;
  succeededCount: number;
  failedCount: number;
  refundedCount: number;
  succeededRevenue: number;
  refundedAmount: number;
}

function adminListParams(query: {
  search?: string;
  status?: string;
  page: number;
  size: number;
}): string {
  const params = new URLSearchParams({
    page: String(query.page),
    size: String(query.size),
  });
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.status) params.set("status", query.status);
  return params.toString();
}

export const adminApi = {
  getAccess(): Promise<AdminAccess> {
    return authenticatedRequest<AdminAccess>("/admin/access", {
      method: "GET",
    });
  },
  listUsers(query: { search?: string; page: number; size: number }): Promise<AdminUserPage> {
    return authenticatedRequest<AdminUserPage>(
      `/admin/users?${adminListParams(query)}`,
      { method: "GET" }
    );
  },
  getDashboard(): Promise<AdminDashboard> {
    return authenticatedRequest<AdminDashboard>("/admin/dashboard", {
      method: "GET",
    });
  },
  getUser(userId: string): Promise<AdminUser> {
    return authenticatedRequest<AdminUser>(`/admin/users/${encodeURIComponent(userId)}`, {
      method: "GET",
    });
  },
  listDrivers(query: { search?: string; status?: string; page: number; size: number }): Promise<AdminDriverPage> {
    return authenticatedRequest<AdminDriverPage>(
      `/admin/drivers?${adminListParams(query)}`,
      { method: "GET" }
    );
  },
  getDriver(driverId: string): Promise<AdminDriverDetail> {
    return authenticatedRequest<AdminDriverDetail>(
      `/admin/drivers/${encodeURIComponent(driverId)}`,
      { method: "GET" }
    );
  },
  getVerificationQueue(): Promise<VerificationQueue> {
    return authenticatedRequest("/admin/verifications", { method: "GET" });
  },
  getVerificationDriver(driverId: string): Promise<VerificationDriverDetail> {
    return authenticatedRequest(
      `/admin/verifications/drivers/${encodeURIComponent(driverId)}`,
      { method: "GET" }
    );
  },
  decideVerification(
    type: "profiles" | "vehicles" | "documents",
    id: string,
    decision: "approved" | "rejected",
    reason?: string
  ): Promise<unknown> {
    return authenticatedRequest(`/admin/verifications/${type}/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      body: { decision, ...(reason ? { reason } : {}) },
    });
  },
  getVerificationDocumentFile(documentId: string): Promise<Blob> {
    return authenticatedBlobRequest(
      `/admin/verifications/documents/${encodeURIComponent(documentId)}/file`
    );
  },
  listOrders(query: { search?: string; status?: string; page: number; size: number }): Promise<AdminOrderPage> {
    return authenticatedRequest<AdminOrderPage>(
      `/admin/orders?${adminListParams(query)}`,
      { method: "GET" }
    );
  },
  getOrder(tripId: string): Promise<AdminOrderDetail> {
    return authenticatedRequest<AdminOrderDetail>(
      `/admin/orders/${encodeURIComponent(tripId)}`,
      { method: "GET" }
    );
  },
  listPayments(query: { search?: string; status?: string; page: number; size: number }): Promise<AdminPaymentPage> {
    return authenticatedRequest<AdminPaymentPage>(
      `/admin/payments?${adminListParams(query)}`,
      { method: "GET" }
    );
  },
  getPaymentReport(): Promise<AdminPaymentReport> {
    return authenticatedRequest<AdminPaymentReport>("/admin/payments/report", {
      method: "GET",
    });
  },
};

function toApiError(
  status: number,
  payload: unknown,
  path: string
): AuthApiError {
  const errorBody =
    payload && typeof payload === "object"
      ? (payload as { message?: unknown; code?: unknown })
      : {};
  const code = typeof errorBody.code === "string" ? errorBody.code : undefined;

  if (
    (status === 401 && path === "/auth/login") ||
    code === "invalid_credentials"
  ) {
    return new AuthApiError(
      "Email atau kata sandi tidak sesuai.",
      status,
      code
    );
  }
  if (
    (status === 409 && path === "/auth/register") ||
    code === "registration_conflict"
  ) {
    return new AuthApiError(
      "Email tersebut sudah terdaftar. Silakan masuk atau gunakan email lain.",
      status,
      code
    );
  }
  if (
    (status === 400 && path === "/auth/register") ||
    code === "invalid_registration"
  ) {
    return new AuthApiError(
      "Data tidak valid. Periksa kembali isian dan ketentuan kata sandi.",
      status,
      code
    );
  }
  if (status >= 500) {
    return new AuthApiError(
      "Server RideFlow sedang mengalami gangguan. Coba lagi beberapa saat.",
      status,
      code
    );
  }
  if (status === 401) {
    return new AuthApiError(
      "Sesi login telah berakhir. Silakan masuk kembali.",
      status,
      code
    );
  }
  if (typeof errorBody.message === "string" && errorBody.message.trim()) {
    return new AuthApiError(errorBody.message, status, code);
  }
  return new AuthApiError(
    "Permintaan RideFlow tidak dapat diproses.",
    status,
    code
  );
}

function parseSession(value: unknown): AuthSession {
  if (!value || typeof value !== "object") {
    throw new AuthApiError("Server mengirim data sesi yang tidak valid.");
  }

  const session = value as { user?: unknown; token?: unknown };
  const user = session.user as
    | (Partial<User> & { roles?: unknown })
    | undefined;
  const validRole = (role: unknown): role is UserRole =>
    role === "CUSTOMER" || role === "DRIVER" || role === "ADMIN";

  if (
    typeof session.token !== "string" ||
    !session.token ||
    !user ||
    typeof user.id !== "string" ||
    typeof user.name !== "string" ||
    typeof user.email !== "string" ||
    !validRole(user.role) ||
    typeof user.createdAt !== "string" ||
    !Array.isArray(user.roles) ||
    !user.roles.every(validRole) ||
    !user.roles.includes(user.role)
  ) {
    throw new AuthApiError("Server mengirim data sesi yang tidak valid.");
  }

  return {
    token: session.token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: typeof user.phone === "string" ? user.phone : undefined,
      createdAt: user.createdAt,
    },
  };
}

async function verifyToken(token: string): Promise<AuthSession> {
  return parseSession(
    await request("/auth/me", { method: "GET", token })
  );
}

async function authenticate(
  path: "/auth/login" | "/auth/register",
  body: LoginRequest | RegisterRequest,
  rememberMe = true
): Promise<AuthSession> {
  const issuedSession = parseSession(
    await request(path, { method: "POST", body })
  );
  setToken(issuedSession.token, rememberMe);

  try {
    const verifiedSession = await verifyToken(issuedSession.token);
    setToken(verifiedSession.token, rememberMe);
    return verifiedSession;
  } catch (error) {
    clearToken();
    throw error;
  }
}

export const authApi = {
  async login(credentials: LoginRequest): Promise<AuthSession> {
    return authenticate(
      "/auth/login",
      {
        email: credentials.email.trim(),
        password: credentials.password,
        rememberMe: credentials.rememberMe,
      },
      credentials.rememberMe ?? true
    );
  },

  async register(requestBody: RegisterRequest): Promise<AuthSession> {
    const { name, email, password, role, phone } = requestBody;
    return authenticate("/auth/register", {
      name: name.trim(),
      email: email.trim(),
      password,
      role,
      phone: phone?.trim() || undefined,
    });
  },

  async getCurrentSession(): Promise<AuthSession | null> {
    const token = getToken();
    if (!token) return null;

    try {
      const session = await verifyToken(token);
      if (session.token !== token) {
        const rememberMe = Boolean(
          window.sessionStorage.getItem(TOKEN_STORAGE_KEY)
        );
        setToken(session.token, rememberMe);
      }
      return session;
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 401) {
        clearToken();
        return null;
      }
      throw error;
    }
  },

  async logout(): Promise<void> {
    clearToken();
  },
};

export function getRoleHomePath(user: Pick<User, "role">): string {
  if (user.role === "ADMIN") return "/admin/dashboard";
  return user.role === "DRIVER" ? "/driver/dashboard" : "/customer/dashboard";
}

export function getProtectedRouteRedirect(
  user: Pick<User, "role"> | null,
  allowedRole?: UserRole
): string | null {
  if (!user) return "/login";
  if (allowedRole && user.role !== allowedRole) return getRoleHomePath(user);
  return null;
}

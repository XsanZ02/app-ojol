const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");

const storage = new Map();
const localStore = new Map();
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

globalThis.window = {
  dispatchEvent: () => true,
  sessionStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
};

globalThis.localStorage = {
  getItem: (key) => localStore.get(key) ?? null,
  setItem: (key, value) => localStore.set(key, String(value)),
  removeItem: (key) => localStore.delete(key),
};

globalThis.CustomEvent = class CustomEvent {
  constructor(type, eventInitDict) {
    this.type = type;
    this.detail = eventInitDict?.detail;
  }
};

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  module._compile(outputText, filename);
};

const { driverApi, profileApi, routesApi } = require("../src/lib/api.ts");
const { MockStorage } = require("../src/lib/mock-storage.ts");

function response(body, status = 200) {
  return new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

function installWindow() {
  globalThis.window = {
    dispatchEvent: () => true,
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  };
}

beforeEach(() => {
  storage.clear();
  localStore.clear();
  storage.set("rideflow_access_token", "driver-bearer-token");
  installWindow();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
});

test("routesApi requests a backend motor route estimate without creating a trip", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response({
      distanceMeters: 4800,
      distanceKm: 4.8,
      durationSeconds: 900,
      estimatedFare: 17500,
      currency: "IDR",
      fareConfigVersion: "demo-v1",
      routingProvider: "valhalla:motor_scooter",
      routeGeometry: "encoded-route",
    });
  };

  const estimate = await routesApi.estimate({
    pickupLatitude: -8.6834,
    pickupLongitude: 115.2289,
    destinationLatitude: -8.6755,
    destinationLongitude: 115.2635,
    vehicleType: "MOTOR",
  });

  assert.equal(estimate.distanceMeters, 4800);
  assert.equal(estimate.estimatedFare, 17500);
  assert.equal(estimate.routeGeometry, "encoded-route");
  assert.equal(estimate.vehicleType, "MOTOR");
  assert.equal(calls[0].url, "http://localhost:8080/routes/estimate");
  assert.equal(calls[0].options.method, "POST");
  assert.match(calls[0].options.headers.Authorization, /^Bearer /);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    pickupLatitude: -8.6834,
    pickupLongitude: 115.2289,
    destinationLatitude: -8.6755,
    destinationLongitude: 115.2635,
    vehicleType: "MOTOR",
  });
});

test("driverApi.updateProfile calls PUT /drivers/me/profile with bearer token", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response({ name: "Budi Driver", phone: "+628123456789" }, 200);
  };

  const result = await driverApi.updateProfile({
    name: "Budi Driver",
    phone: "08123456789",
  });

  assert.equal(result.name, "Budi Driver");
  assert.equal(result.phone, "+628123456789");
  assert.equal(calls[0].url, "http://localhost:8080/drivers/me/profile");
  assert.equal(calls[0].options.method, "PUT");
  assert.equal(calls[0].options.headers.Authorization, "Bearer driver-bearer-token");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    name: "Budi Driver",
    phone: "08123456789",
  });
});

test("driverApi.registerVehicle calls POST /drivers/me/vehicles and maps response", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response(
      {
        id: "42",
        vehicleType: "MOTOR",
        vehiclePlate: "DK1234AB",
        make: "Honda",
        model: "Vario 160",
        color: "Hitam",
        verificationStatus: "pending",
        isActive: false,
        createdAt: "2026-10-30T00:00:00Z",
        updatedAt: "2026-10-30T00:00:00Z",
      },
      201
    );
  };

  const vehicle = await driverApi.registerVehicle({
    vehicleType: "MOTOR",
    vehiclePlate: "DK 1234 AB",
    make: "Honda",
    model: "Vario 160",
    color: "Hitam",
  });

  assert.equal(vehicle.id, "42");
  assert.equal(vehicle.verificationStatus, "pending");
  assert.equal(vehicle.isActive, false);
  assert.equal(calls[0].url, "http://localhost:8080/drivers/me/vehicles");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Authorization, "Bearer driver-bearer-token");
});

test("driverApi.updateVehicle calls PUT /drivers/me/vehicles/:id", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response(
      {
        id: "42",
        vehicleType: "MOTOR",
        vehiclePlate: "DK5678CD",
        make: "Yamaha",
        model: "NMAX",
        color: "Putih",
        verificationStatus: "pending",
        isActive: false,
        createdAt: "2026-10-30T00:00:00Z",
        updatedAt: "2026-10-30T01:00:00Z",
      },
      200
    );
  };

  const vehicle = await driverApi.updateVehicle("42", {
    vehicleType: "MOTOR",
    vehiclePlate: "DK 5678 CD",
    make: "Yamaha",
    model: "NMAX",
    color: "Putih",
  });

  assert.equal(vehicle.id, "42");
  assert.equal(vehicle.vehiclePlate, "DK5678CD");
  assert.equal(calls[0].url, "http://localhost:8080/drivers/me/vehicles/42");
  assert.equal(calls[0].options.method, "PUT");
});

test("driverApi.getVehicles and getProfile reload data from backend", async () => {
  globalThis.fetch = async (url) => {
    if (url.endsWith("/profile")) {
      return response({
        userId: "5",
        status: "pending",
        createdAt: "2026-10-30T00:00:00Z",
        updatedAt: "2026-10-30T00:00:00Z",
      });
    }
    if (url.endsWith("/vehicles")) {
      return response({
        vehicles: [
          {
            id: "101",
            vehicleType: "MOBIL",
            vehiclePlate: "DK9999ZZ",
            make: "Toyota",
            model: "Avanza",
            color: "Silver",
            verificationStatus: "verified",
            isActive: true,
            createdAt: "2026-10-30T00:00:00Z",
            updatedAt: "2026-10-30T00:00:00Z",
          },
        ],
      });
    }
    return response({}, 404);
  };

  const profile = await driverApi.getProfile();
  assert.equal(profile.userId, "5");
  assert.equal(profile.status, "pending");

  const vehicles = await driverApi.getVehicles();
  assert.equal(vehicles.length, 1);
  assert.equal(vehicles[0].vehiclePlate, "DK9999ZZ");
  assert.equal(vehicles[0].verificationStatus, "verified");
  assert.equal(vehicles[0].isActive, true);
});

test("driverApi.getActiveTrip maps passenger identity from the authorized trip response", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response({
      id: "72",
      status: "PICKING_UP",
      vehicleType: "MOTOR",
      pickup: { address: "Pickup", name: "Pickup", lat: -8.65, lng: 115.21 },
      destination: { address: "Dropoff", name: "Dropoff", lat: -8.66, lng: 115.22 },
      tripNotes: null,
      estimatedDistanceKm: 3.2,
      routeDistanceMeters: 3200,
      estimatedDurationMin: 12,
      estimatedDurationSeconds: 720,
      estimatedFare: 12000,
      routingProvider: "valhalla",
      routeGeometry: "route",
      fareConfigVersion: "test",
      finalFare: null,
      currencyCode: "IDR",
      statusHistory: [],
      createdAt: "2026-11-09T00:00:00Z",
      updatedAt: "2026-11-09T00:01:00Z",
      customerId: "15",
      customerName: "Rina Penumpang",
      customerPhone: "+6281234567890",
    });
  };

  const activeTrip = await driverApi.getActiveTrip();

  assert.equal(activeTrip.customerId, "15");
  assert.equal(activeTrip.customerName, "Rina Penumpang");
  assert.equal(activeTrip.customerPhone, "+6281234567890");
  assert.equal(activeTrip.status, "PICKING_UP");
  assert.equal(activeTrip.estimatedFare, 12000);
  assert.equal(calls[0].url, "http://localhost:8080/drivers/me/trips/active");
  assert.equal(calls[0].options.method, "GET");
  assert.ok(calls[0].options.headers.Authorization.length > 10);
});

test("driverApi.registerVehicle handles vehicle conflict error", async () => {
  globalThis.fetch = async () =>
    response(
      { message: "Vehicle could not be registered", code: "vehicle_conflict" },
      409
    );

  await assert.rejects(
    driverApi.registerVehicle({
      vehicleType: "MOTOR",
      vehiclePlate: "DK1234AB",
      make: "Honda",
      model: "Beat",
      color: "Hitam",
    }),
    (err) => err.status === 409
  );
});

test("driverApi.getAvailableOrders rejects when driver is not eligible", async () => {
  globalThis.fetch = async () =>
    response(
      {
        message: "Driver is not eligible for this order",
        code: "driver_not_eligible",
      },
      403
    );

  await assert.rejects(driverApi.getAvailableOrders(), (err) => {
    assert.equal(err.status, 403);
    assert.equal(err.code, "driver_not_eligible");
    assert.match(err.message, /Driver is not eligible/i);
    return true;
  });
});

test("profileApi.updateProfile for driver persists updates through backend endpoints", async () => {
  const calls = [];
  MockStorage.setSession({
    user: {
      id: "5",
      name: "Driver Lama",
      email: "driver5@test.com",
      role: "DRIVER",
      phone: "+628111111111",
      createdAt: "2026-10-30T00:00:00Z",
    },
  });
  MockStorage.getDriversMap();
  const cachedDriversBefore = localStore.get("rideflow_drivers");

  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/profile")) {
      return response({ name: "Driver Baru", phone: "+628222222222" }, 200);
    }
    if (url.endsWith("/vehicles") && options.method === "GET") {
      return response({ vehicles: [] }, 200);
    }
    if (url.endsWith("/vehicles") && options.method === "POST") {
      return response(
        {
          id: "201",
          vehicleType: "MOTOR",
          vehiclePlate: "DK1234AB",
          make: "Honda",
          model: "Vario 160",
          color: "Hitam",
          verificationStatus: "pending",
          isActive: false,
          createdAt: "2026-10-30T00:00:00Z",
          updatedAt: "2026-10-30T00:00:00Z",
        },
        201
      );
    }
    return response({}, 404);
  };

  const updatedUser = await profileApi.updateProfile("5", {
    name: "Driver Baru",
    phone: "08222222222",
    vehicleType: "MOTOR",
    vehiclePlate: "DK1234AB",
    vehicleModel: "Vario 160",
    make: "Honda",
    color: "Hitam",
  });

  assert.equal(updatedUser.name, "Driver Baru");
  assert.equal(updatedUser.phone, "+628222222222");
  assert.equal(localStore.get("rideflow_drivers"), cachedDriversBefore);

  // Verified that /profile was called with PUT
  const profileCall = calls.find((c) => c.url.endsWith("/profile"));
  assert.ok(profileCall);
  assert.equal(profileCall.options.method, "PUT");

  // Verified that /vehicles was called with POST
  const vehiclePost = calls.find(
    (c) => c.url.endsWith("/vehicles") && c.options.method === "POST"
  );
  assert.ok(vehiclePost);
  assert.deepEqual(JSON.parse(vehiclePost.options.body), {
    vehicleType: "MOTOR",
    vehiclePlate: "DK1234AB",
    make: "Honda",
    model: "Vario 160",
    color: "Hitam",
  });
});

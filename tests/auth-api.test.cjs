const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");

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

require.extensions[".tsx"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  module._compile(outputText, filename);
};

const {
  adminApi,
  authApi,
  authenticatedRequest,
  getProtectedRouteRedirect,
  getRoleHomePath,
} = require("../src/lib/auth-api.ts");
const { AdminUsersTable } = require("../src/components/admin/AdminUsersTable.tsx");
const { renderToStaticMarkup } = require("react-dom/server");

const storage = new Map();
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

function response(body, status = 200) {
  return new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

function apiSession(role = "CUSTOMER", roles = [role], token = "jwt-test-token") {
  return {
    user: {
      id: "17",
      name: "RideFlow User",
      email: "rider@example.test",
      role,
      roles,
      phone: "+6281234567890",
      createdAt: "2026-10-28T00:00:00Z",
    },
    token,
  };
}

function installWindow() {
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  };
}

beforeEach(() => {
  storage.clear();
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

test("login validates its identity with /auth/me and stores the bearer token", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response(apiSession("DRIVER"));
  };

  const session = await authApi.login({
    email: " rider@example.test ",
    password: "passphrase",
    rememberMe: true,
  });

  assert.equal(session.user.role, "DRIVER");
  assert.equal(calls[0].url, "http://localhost:8080/auth/login");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    email: "rider@example.test",
    password: "passphrase",
    rememberMe: true,
  });
  assert.equal(calls[1].url, "http://localhost:8080/auth/me");
  assert.equal(
    calls[1].options.headers.Authorization,
    "Bearer jwt-test-token"
  );
  assert.equal(storage.get("rideflow_access_token"), "jwt-test-token");
});

test("admin login and session recovery preserve the ADMIN role", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response(apiSession("ADMIN", ["ADMIN", "CUSTOMER"]));
  };

  const session = await authApi.login({
    email: "admin@example.test",
    password: "passphrase",
  });

  assert.equal(session.user.role, "ADMIN");
  assert.equal(storage.get("rideflow_access_token"), "jwt-test-token");
  assert.equal(getRoleHomePath(session.user), "/admin/dashboard");

  globalThis.fetch = async () =>
    response(apiSession("ADMIN", ["ADMIN", "CUSTOMER"]));
  const restoredSession = await authApi.getCurrentSession();
  assert.equal(restoredSession.user.role, "ADMIN");
  assert.equal(storage.get("rideflow_access_token"), "jwt-test-token");
  assert.equal(calls[1].url, "http://localhost:8080/auth/me");
});

test("session recovery stores a replacement token when database roles changed", async () => {
  storage.set("rideflow_access_token", "old-customer-token");
  globalThis.fetch = async () =>
    response(apiSession("ADMIN", ["ADMIN", "CUSTOMER"], "new-admin-token"));

  const session = await authApi.getCurrentSession();

  assert.equal(session.user.role, "ADMIN");
  assert.equal(storage.get("rideflow_access_token"), "new-admin-token");
});

test("session parser rejects roles it does not recognize", async () => {
  globalThis.fetch = async () => response(apiSession("SUPERVISOR"));

  await assert.rejects(
    authApi.login({ email: "user@example.test", password: "passphrase" }),
    { message: "Server mengirim data sesi yang tidak valid." }
  );
  assert.equal(storage.has("rideflow_access_token"), false);
});

test("admin access request uses authentication and preserves 401 and 403 errors", async (context) => {
  await context.test("authorized admin", async () => {
    storage.set("rideflow_access_token", "admin-token");
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return response({ authorized: true, subject: "17" });
    };

    assert.deepEqual(await adminApi.getAccess(), {
      authorized: true,
      subject: "17",
    });
    assert.equal(calls[0].url, "http://localhost:8080/admin/access");
    assert.equal(calls[0].options.headers.Authorization, "Bearer admin-token");
  });

  test("admin user list request sends search and pagination with the bearer token", async () => {
    storage.set("rideflow_access_token", "admin-token");
    let request;
    const payload = {
      users: [{
        id: "42",
        email: "rider@example.test",
        name: "RideFlow Rider",
        roles: ["customer"],
        status: "active",
        createdAt: "2026-10-28T00:00:00Z",
      }],
      total: 1,
      page: 2,
      size: 10,
    };
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return response(payload);
    };

    assert.deepEqual(await adminApi.listUsers({
      search: " rider@example.test ",
      page: 2,
      size: 10,
    }), payload);
    assert.match(request.url, /\/admin\/users\?page=2&size=10&search=rider%40example\.test$/);
    assert.equal(request.options.headers.Authorization, "Bearer admin-token");
  });

  test("admin user table renders loading and error states", () => {
    const props = {
      search: "",
      page: 1,
      onSearch: () => {},
      onPageChange: () => {},
      onRetry: () => {},
    };
    const loadingMarkup = renderToStaticMarkup(
      AdminUsersTable({ ...props, state: { status: "loading" } })
    );
    assert.match(loadingMarkup, /role="status"/);
    assert.match(loadingMarkup, /Memuat daftar pengguna/);

    const errorMarkup = renderToStaticMarkup(
      AdminUsersTable({
        ...props,
        state: { status: "error", message: "Backend tidak tersedia" },
      })
    );
    assert.match(errorMarkup, /role="alert"/);
    assert.match(errorMarkup, /Backend tidak tersedia/);
    assert.match(errorMarkup, /Coba lagi/);
  });

  test("admin user table renders empty state and searchable input", () => {
    const markup = renderToStaticMarkup(
      AdminUsersTable({
        state: {
          status: "success",
          data: { users: [], total: 0, page: 1, size: 20 },
        },
        search: "missing@example.test",
        page: 1,
        onSearch: () => {},
        onPageChange: () => {},
        onRetry: () => {},
      })
    );

    assert.match(markup, /type="search"/);
    assert.match(markup, /Tidak ada pengguna yang cocok/);
    assert.match(markup, /missing@example\.test/);
  });

  test("admin user table displays safe user identity, roles, and pagination", () => {
    const markup = renderToStaticMarkup(
      AdminUsersTable({
        state: {
          status: "success",
          data: {
            users: [{
              id: "42",
              email: "rider@example.test",
              name: "RideFlow Rider",
              roles: ["customer", "driver"],
              status: "active",
              createdAt: "2026-10-28T00:00:00Z",
              passwordHash: "must-not-render",
              token: "must-not-render",
            }],
            total: 21,
            page: 1,
            size: 20,
          },
        },
        search: "",
        page: 1,
        onSearch: () => {},
        onPageChange: () => {},
        onRetry: () => {},
      })
    );

    assert.match(markup, /rider@example\.test/);
    assert.match(markup, /RideFlow Rider/);
    assert.match(markup, />42</);
    assert.match(markup, />customer</);
    assert.match(markup, />driver</);
    assert.match(markup, /Menampilkan 1–20 dari 21 pengguna/);
    assert.doesNotMatch(markup, /must-not-render/);
  });

  await context.test("missing token", async () => {
    await assert.rejects(adminApi.getAccess(), { status: 401 });
  });

  await context.test("forbidden role", async () => {
    storage.set("rideflow_access_token", "customer-token");
    globalThis.fetch = async () =>
      response({ message: "Forbidden" }, 403);
    await assert.rejects(adminApi.getAccess(), { status: 403 });
  });
});

test("login reports invalid credentials without storing a token", async () => {
  globalThis.fetch = async () => response({ message: "Invalid", code: "invalid_credentials" }, 401);

  await assert.rejects(authApi.login({ email: "a@b.test", password: "wrong" }), {
    message: "Email atau kata sandi tidak sesuai.",
  });
  assert.equal(storage.has("rideflow_access_token"), false);
});

test("registration posts the supported fields and verifies the returned account", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response(apiSession("DRIVER"));
  };

  const session = await authApi.register({
    name: " Driver ",
    email: " driver@example.test ",
    password: "Correct-Horse-Battery-42",
    role: "DRIVER",
    phone: "0812-3456-7890",
    vehicleType: "MOTOR",
    vehiclePlate: "DK 1234 AB",
    vehicleModel: "Vario",
  });

  assert.equal(session.user.role, "DRIVER");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    name: "Driver",
    email: "driver@example.test",
    password: "Correct-Horse-Battery-42",
    role: "DRIVER",
    phone: "0812-3456-7890",
  });
  assert.equal(calls[1].url, "http://localhost:8080/auth/me");
});

test("registration maps invalid and duplicate email responses", async (context) => {
  const invalidCases = [
    [400, "Data tidak valid. Periksa kembali isian dan ketentuan kata sandi."],
    [
      409,
      "Email tersebut sudah terdaftar. Silakan masuk atau gunakan email lain.",
    ],
  ];

  for (const [status, message] of invalidCases) {
    await context.test(`status ${status}`, async () => {
      globalThis.fetch = async () => response({ message: "Rejected" }, status);
      await assert.rejects(
        authApi.register({
          name: "Rider",
          email: "rider@example.test",
          password: "Correct-Horse-Battery-42",
          role: "CUSTOMER",
        }),
        { message }
      );
    });
  }
});

test("session recovery validates /auth/me and clears an expired token", async () => {
  storage.set("rideflow_access_token", "expired");
  globalThis.fetch = async () => response({ message: "Unauthorized" }, 401);

  assert.equal(await authApi.getCurrentSession(), null);
  assert.equal(storage.has("rideflow_access_token"), false);
});

test("unauthenticated session recovery does not call the backend", async () => {
  globalThis.fetch = async () => {
    throw new Error("unexpected network request");
  };

  assert.equal(await authApi.getCurrentSession(), null);
});

test("authenticated API requests use the session token for supported methods", async () => {
  storage.set("rideflow_access_token", "jwt-test-token");
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response({ isOnline: true });
  };

  await authenticatedRequest("/drivers/me/status", { method: "GET" });
  await authenticatedRequest("/drivers/me/status", {
    method: "PUT",
    body: { isOnline: false },
  });
  await authenticatedRequest("/drivers/me/vehicles/1/active", {
    method: "PATCH",
    body: { isActive: true },
  });

  assert.deepEqual(
    calls.map(({ options }) => options.method),
    ["GET", "PUT", "PATCH"]
  );
  assert.equal(
    calls.every(
      ({ options }) => options.headers.Authorization === "Bearer jwt-test-token"
    ),
    true
  );
  assert.deepEqual(JSON.parse(calls[1].options.body), { isOnline: false });
  assert.deepEqual(JSON.parse(calls[2].options.body), { isActive: true });
});

test("authenticated API errors do not include the bearer token", async () => {
  storage.set("rideflow_access_token", "jwt-test-token");
  globalThis.fetch = async () =>
    response({ message: "Unauthorized", code: "unauthorized" }, 401);

  await assert.rejects(
    authenticatedRequest("/drivers/me/status", { method: "GET" }),
    (error) => {
      assert.equal(error.message, "Sesi login telah berakhir. Silakan masuk kembali.");
      assert.equal(error.message.includes("jwt-test-token"), false);
      return true;
    }
  );
});

test("server-side session reads do not access browser storage", async () => {
  delete globalThis.window;
  globalThis.fetch = async () => {
    throw new Error("unexpected network request");
  };

  assert.equal(await authApi.getCurrentSession(), null);
});

test("logout clears the local token without claiming server revocation", async () => {
  storage.set("rideflow_access_token", "jwt-test-token");
  await authApi.logout();
  assert.equal(storage.has("rideflow_access_token"), false);
});

test("malformed success responses and unavailable backend fail explicitly", async (context) => {
  await context.test("malformed session", async () => {
    globalThis.fetch = async () => response({ user: {}, token: "invalid" });
    await assert.rejects(authApi.login({ email: "a@b.test", password: "x" }), {
      message: "Server mengirim data sesi yang tidak valid.",
    });
  });

  await context.test("network unavailable", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("fetch failed");
    };
    await assert.rejects(authApi.login({ email: "a@b.test", password: "x" }), {
      message:
        "Tidak dapat terhubung ke server RideFlow. Periksa koneksi dan status backend.",
    });
  });

  await context.test("backend failure", async () => {
    globalThis.fetch = async () => response({ message: "Unavailable" }, 503);
    await assert.rejects(authApi.login({ email: "a@b.test", password: "x" }), {
      message: "Server RideFlow sedang mengalami gangguan. Coba lagi beberapa saat.",
    });
  });
});

test("redirects use the authenticated backend role and reject missing sessions", () => {
  assert.equal(getRoleHomePath({ role: "ADMIN" }), "/admin/dashboard");
  assert.equal(getRoleHomePath({ role: "DRIVER" }), "/driver/dashboard");
  assert.equal(getRoleHomePath({ role: "CUSTOMER" }), "/customer/dashboard");
  assert.equal(getProtectedRouteRedirect(null), "/login");
  assert.equal(
    getProtectedRouteRedirect({ role: "CUSTOMER" }, "DRIVER"),
    "/customer/dashboard"
  );
  assert.equal(
    getProtectedRouteRedirect({ role: "DRIVER" }, "ADMIN"),
    "/driver/dashboard"
  );
  assert.equal(getProtectedRouteRedirect({ role: "DRIVER" }, "DRIVER"), null);
  assert.equal(getProtectedRouteRedirect({ role: "CUSTOMER" }, "ADMIN"), "/customer/dashboard");
  assert.equal(getProtectedRouteRedirect({ role: "ADMIN" }, "ADMIN"), null);
});

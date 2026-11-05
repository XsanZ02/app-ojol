# rideflow-backend

This project uses Quarkus, the Supersonic Subatomic Java Framework.

If you want to learn more about Quarkus, please visit its website: <https://quarkus.io/>.

## Prerequisites

- JDK 21 or newer
- No global Maven installation is required; the Maven Wrapper downloads Maven 3.9.16 on first use.
- A PostgreSQL database reachable at `localhost:5432`.

## PostgreSQL configuration

The datasource reads its password from `DB_PASSWORD`. The development defaults are
host `localhost`, port `5432`, database `rideflow`, and username `rideflow`.
Set the password in the current PowerShell session before starting the backend:

```powershell
$env:DB_PASSWORD = '<the password configured for your local rideflow database>'
.\mvnw.cmd quarkus:dev
```

You can also override `DB_HOST`, `DB_PORT`, `DB_NAME`, and `DB_USERNAME` with
environment variables. Do not put database passwords in source files.

Flyway migrations are under `src/main/resources/db/migration`. V4 validates
and records a complete verification schema that was materialized before its
Flyway history entry, applies the DDL on a clean V3 database, and fails
explicitly on partial or incompatible state. Do not run
`docs/sql/V4__driver_verification.sql` directly; it is a design draft. Use
Flyway and validate the resulting history before starting the API.

### Authentication API

The API exposes `POST /auth/register`, `POST /auth/login`, and authenticated
`GET /auth/me`. Register accepts the current frontend's `name`, `email`,
`password`, single `role`, and optional `phone`. It also accepts
`roles: ["CUSTOMER", "DRIVER"]` instead of `role` for an account with both
roles. Roles are persisted in `user_roles`; a driver profile starts as
`pending` and is not eligible to accept rides. The response retains the
frontend-compatible `{ user, token }` session shape and includes the database
roles. Phone numbers with an Indonesian leading `0` are normalized to E.164.
Legacy optional vehicle fields may still be present in a registration request,
but this authentication stage does not persist vehicle data; onboard vehicles
and documents through the driver endpoints below.

Passwords require 12–72 UTF-8 bytes and are stored with BCrypt. Access tokens
are RSA-signed JWTs and expire after 900 seconds by default. Provide a
production-managed RSA key pair outside source control:

```powershell
$env:JWT_PRIVATE_KEY_LOCATION = 'C:\secure\rideflow\jwt-private.pem'
$env:JWT_PUBLIC_KEY_LOCATION = 'C:\secure\rideflow\jwt-public.pem'
$env:JWT_ISSUER = 'rideflow'
$env:JWT_AUDIENCE = 'rideflow-api'
$env:JWT_TTL_SECONDS = '900'
```

The private key must be PKCS#8 PEM and the public key X.509 SubjectPublicKeyInfo
PEM. Never commit either key or include JWTs/passwords in logs. Login's
``rememberMe` field is accepted for compatibility but does not extend token
lifetime; refresh/revocation support is not implemented. The frontend validates
the same 12–72 UTF-8 byte password range before submission.

For browser clients, CORS is enabled only for the exact origin configured by
`RIDEFLOW_FRONTEND_ORIGIN` (defaults to `http://localhost:3000`). Configure that
environment variable to the deployed frontend origin in each environment; do
not use a wildcard. Allowed request headers include `Authorization` and
`Content-Type`. CORS credentials are disabled because the API currently uses
bearer JWTs in the Authorization header rather than an HttpOnly cookie.
There is no logout/revocation endpoint: a client can clear its local token, but
an already-issued JWT remains valid until its expiry.

### Driver profile and vehicle API

Authenticated driver endpoints use the verified token subject as the account
identity; request bodies never supply an owner ID:

- `GET /drivers/me/profile` returns the caller's driver profile and status.
- `POST /drivers/me/profile` creates a missing profile as `pending`; if one
  already exists, it returns that profile without changing its status.
- `GET /drivers/me/vehicles` lists only the caller's vehicles.
- `POST /drivers/me/vehicles` registers a vehicle with `pending` verification
  and `isActive=false`.
- `PUT /drivers/me/vehicles/{vehicleId}` edits a vehicle only while its
  verification status is `pending`.
- `PATCH /drivers/me/vehicles/{vehicleId}/active` accepts
  `{"isActive":true|false}`. Activation requires verified status; deactivation
  is allowed for the owner.

Vehicle requests accept `vehicleType` as `MOTOR`/`MOBIL` (also
`motorcycle`/`car`), `vehiclePlate`, `make`, `model`, and `color`. Plate
normalization trims whitespace, removes spaces and hyphens, and uppercases the
value before applying the database format and uniqueness rules. Verification
status is not writable through these endpoints; there is no public API to mark
a vehicle verified. All operations require an active account, a persisted
`driver` role, and a driver profile that is not suspended. Pending profiles
may register vehicles; the driver must be approved and have verified required
documents and an active verified vehicle before going online or receiving an
order.

### Driver verification API

Driver document uploads accept `POST /drivers/me/documents` with
`documentType` (`ktp`, `sim`, `stnk`, or `vehicle_photo`), `filename`,
`mimeType`, and base64 `contentBase64`. STNK and vehicle-photo uploads also
require the caller's `vehicleId`. Uploads are limited to 10 MB and validated
against the declared image/PDF signature. `GET /drivers/me/documents` lists
the caller's document versions; `GET /drivers/me/documents/{documentId}/file`
serves a file only to its owner.

Document bytes are stored outside PostgreSQL in a private local directory.
`DRIVER_DOCUMENT_STORAGE_PATH` overrides the default
`./data/driver-documents`; configure a durable private volume for deployments
and keep this directory inaccessible to the public web server.

Admin-only verification endpoints are protected by the persisted `admin` role:

- `GET /admin/verifications` returns pending profile, vehicle, and latest
  document reviews.
- `GET /admin/verifications/drivers/{driverId}` returns profile, vehicles,
  documents, and decision history.
- `GET /admin/verifications/documents/{documentId}/file` serves a private
  document for review.
- `POST /admin/verifications/documents/{documentId}/decision`,
  `/profiles/{driverId}/decision`, and `/vehicles/{vehicleId}/decision` accept
  `{"decision":"approved"}` or
  `{"decision":"rejected","reason":"..."}`. Rejection reasons are mandatory.
  Each decision records its reviewer and timestamp and appends an immutable
  audit event. Profile and vehicle decisions are independent; profile approval
  requires the latest KTP and SIM approvals, and vehicle approval requires the
  latest STNK and vehicle-photo approvals.

The production default enables the V4 eligibility gate through
`DRIVER_VERIFICATION_V4_ENABLED=true`. Do not enable online/order intake until
the profile is approved, all latest required documents are verified, and an
active verified vehicle is selected.

Driver dashboard endpoints use the authenticated account ID:

- `GET /drivers/me/status` reads the driver's online state.
- `PUT /drivers/me/status` accepts `{ "isOnline": boolean }`. Going online
  requires an active, approved driver profile, the latest verified profile and
  vehicle documents, no unreleased verification hold, and an active, verified
  vehicle when the V4 gate is enabled. A driver cannot choose another account's
  ID.
- `GET /drivers/me/statistics` reports final-fare earnings and completed trip
  counts for the current `Asia/Makassar` calendar day, all completed trips,
  and ratings addressed to the authenticated driver. Empty earnings/counts
  are zero; an unrated driver has `rating: null` and `totalRatingsCount: 0`.
- `GET /drivers/me/trips` lists trips assigned to the authenticated driver;
  `GET /drivers/me/trips/active` returns its active trip or `204 No Content`.

### Trips and orders API

Trip endpoints require an authenticated token and use its database account ID;
clients cannot choose a rider or driver ID:

- `POST /trips` creates a customer trip and its initial status-history row.
- `GET /trips/me` lists trips belonging to the authenticated customer.
- `GET /trips/{tripId}` is visible only to its customer or assigned driver.
- `POST /trips/{tripId}/cancel` allows the customer to cancel only a
  `requested` trip. Its JSON body may contain an optional `reason`.
- `GET /drivers/me/orders` lists requested orders matching the driver's
  active, verified vehicle types; it also requires approved verification,
  current required documents, online status, and no unreleased hold when the
  V4 gate is enabled.
- `POST /trips/{tripId}/accept` locks the trip, selects an eligible matching
  vehicle, and conditionally assigns the order in the same transaction.
- `POST /trips/{tripId}/picking-up`, `/start`, and `/complete` perform the
  assigned driver's ordered status transitions.

Trip IDs in responses are decimal strings representing the existing database
`BIGINT` IDs; no `RF-...` public-ID format is defined. The frontend must use the
ID returned by `POST /trips` unchanged for detail, cancel, and history links.
Malformed or unknown IDs return `404`.

Trip creation accepts `pickupAddress`, `pickupLatitude`, `pickupLongitude`,
`destinationAddress`, `destinationLatitude`, `destinationLongitude`,
`vehicleType` (`MOTOR`/`MOBIL` or `motorcycle`/`car`), and optional
`currencyCode` (only `IDR` is currently supported). The server calculates
distance, duration, and fare using the same Haversine road-factor and tariff
formula as the current frontend mock. Any client-supplied fare is ignored.
Completion records the server-calculated estimated fare as `final_fare`.
Status values in the API map database `requested` to frontend `PENDING`.

The customer booking client sends endpoint coordinates from its existing
predefined location choices and does not send client-calculated fares. The
backend computes the authoritative fare and does not persist location display
names or trip notes because V1 has no corresponding columns. The frontend
therefore prevents submitting unrecognized free-text locations without
coordinates and explicitly reports that notes cannot be saved. Trip responses
omit customer/driver email, phone, and account IDs.

Trip acceptance locks the requested trip row and uses a conditional update,
so only one concurrent driver can claim it. Driver eligibility and a matching
active/verified vehicle are checked inside that transaction. Every state
change and its `trip_status_history` insert share one transaction; service
rules enforce the transition graph because SQL checks only constrain valid
status/timestamp combinations. Payment and rating are not part of these
endpoints.

Flyway is included for versioned schema migrations. Automatic migrations and
Hibernate schema generation remain disabled; review and apply migrations
explicitly rather than changing an existing database during startup.
`V2__add_driver_online_status.sql` adds the driver's online flag with a
default of `false`. Apply this new migration through the project's approved
database change process before deploying the endpoints; do not rerun V1.

### Initial schema and business rules

The initial schema assigns roles explicitly through `user_roles`, allowing one
account to have `customer`, `driver`, or both roles. A `driver_profiles` row
requires the account's `driver` role. Registration and driver-profile creation
keep account, selected roles, and the initial pending driver profile in one
transaction; the database does not infer roles. Later profile or vehicle API
operations are separately authorized and transactional.

`driver_vehicles` stores normalized uppercase alphanumeric plates with global
uniqueness. A vehicle is eligible for assignment only when verification status
is `verified` and `is_active` is true. Service code must also require an active
account and active driver profile before accepting a trip. The trip's
composite foreign key guarantees that the assigned vehicle belongs to its
assigned driver and matches the requested vehicle type; it does not by itself
prove current driver or vehicle eligibility.

Trip acceptance must lock or conditionally update the requested trip and
validate the driver's active account/profile and the selected vehicle's active,
verified state in the same transaction. This prevents two concurrent drivers
from claiming the same order; ordinary foreign keys cannot enforce changing
eligibility state.

Trip status values are `requested`, `accepted`, `picking_up`, `in_progress`,
`completed`, and `cancelled`, matching the existing UI flow. Legal transitions
are `requested` to `accepted` or `cancelled`, `accepted` to `picking_up` or
`cancelled`, `picking_up` to `in_progress` or `cancelled`, and `in_progress` to
`completed`. `completed` and `cancelled` are terminal; cancellation after
`in_progress` is not part of this flow. Backend services must validate both
the actor's authorization/ownership and every transition. Database checks
constrain allowed status/timestamp/assignment combinations and timestamp
ordering, but do not enforce the transition graph. The service must use a
conditional update inside a transaction and append `trip_status_history` in
that same transaction; history is service-written rather than trigger-written.

Pickup/dropoff addresses, coordinates, service type, estimated fare, and
currency are stored on the trip as request-time snapshots. Coordinates are
required and range-checked. Fare values use `NUMERIC(12,2)`, not floating
point. The service sets `accepted_at`, `started_at`, `completed_at`, and
`cancelled_at` only at their corresponding transitions and stores the final
fare when completing the trip.

### Payments

Each trip has at most one main `payments` row. `GET /trips/{tripId}/payment`
and `POST /trips/{tripId}/payment` are available only to the active customer
who owns a completed trip. The create request accepts only `method` (`cash` or
`digital`); amount and currency are copied from the completed trip's stored
`final_fare` and `currency_code`. Repeating a request with the same method
returns the existing payment; choosing a different method conflicts. The
service locks the trip row and inserts within a transaction.

No payment gateway is integrated. Digital payments remain `pending` because
there is no trusted provider callback. Cash payments also begin as `pending`;
`POST /trips/{tripId}/payment/cash/confirm` lets only the assigned, active
driver with an active driver profile acknowledge receipt after trip completion.
This acknowledgement is the driver's assertion, not independently verified
proof of cash transfer. Customers cannot set status, amount, currency, provider,
or provider reference, and provider references are not returned. There is no
refund or failed-payment endpoint. A real digital settlement flow still
requires an authenticated, idempotent provider integration and operational
secrets/configuration; do not mark a digital payment successful without that
trusted confirmation. The schema stores no card number, CVV, or payment
credentials.

Ratings are unique per trip and rater, with scores limited to 1–5. The service
must verify that the trip is completed, the rater and recipient are the two
distinct trip participants, and the authenticated caller owns the rater
identity. These rules are documented on the table but cannot be inferred from
the rating table's ordinary foreign keys.

The database sets `updated_at` with a `BEFORE UPDATE` trigger on users, driver
profiles, vehicles, trips, and payments. The trigger uses PostgreSQL
`statement_timestamp()`, so rows changed by one update statement receive that
statement's timestamp; application code should not set the column itself.

The migration source is tested without executing its DDL. Flyway
`info`/validation checks do not apply schema changes; apply V1 only after an
explicit review and approval.

To execute V1 against a disposable PostgreSQL 17 instance and verify its
catalog objects, Docker must be available. This opt-in test starts a fresh
`postgres:17` container with a random loopback-only port, no mounted volumes,
and a temporary database; it runs Flyway and stops/removes only that test
container afterward. It does not connect to the development database:

```powershell
.\mvnw.cmd '-Dtest=FlywayPostgres17Test' '-Drideflow.postgres17.integration=true' test
```

Authentication endpoint tests use the same disposable-database approach and
apply V1 only in the temporary PostgreSQL container. The RSA fixture under
`src/test/resources` is generated solely for tests and is not a production key.
Run with:

```powershell
.\mvnw.cmd '-Dtest=AuthResourceTest' test
```

## Running the application in dev mode

You can run your application in dev mode that enables live coding using:

PowerShell on Windows:

```powershell
.\mvnw.cmd quarkus:dev
```

Linux, macOS, or a Unix-like shell:

```shell script
./mvnw quarkus:dev
```

> **_NOTE:_**  Quarkus now ships with a Dev UI, which is available in dev mode only at <http://localhost:8080/q/dev/>.

## Packaging and running the application

The application can be packaged using:

```shell script
./mvnw package
```

It produces the `quarkus-run.jar` file in the `target/quarkus-app/` directory.
Be aware that it’s not an _über-jar_ as the dependencies are copied into the `target/quarkus-app/lib/` directory.

The application is now runnable using `java -jar target/quarkus-app/quarkus-run.jar`.

If you want to build an _über-jar_, execute the following command:

```shell script
./mvnw package -Dquarkus.package.jar.type=uber-jar
```

The application, packaged as an _über-jar_, is now runnable using `java -jar target/*-runner.jar`.

## Creating a native executable

You can create a native executable using:

```shell script
./mvnw package -Dnative
```

Or, if you don't have GraalVM installed, you can run the native executable build in a container using:

```shell script
./mvnw package -Dnative -Dquarkus.native.container-build=true
```

You can then execute your native executable with: `./target/rideflow-backend-1.0.0-SNAPSHOT-runner`

If you want to learn more about building native executables, please consult <https://quarkus.io/guides/maven-tooling>.

## Related Guides

- REST Jackson ([guide](https://quarkus.io/guides/rest#json-serialisation)): Jackson serialization support for Quarkus REST. This extension is not compatible with the quarkus-resteasy extension, or any of the extensions that depend on it

## Provided Code

### REST

Easily start your REST Web Services

[Related guide section...](https://quarkus.io/guides/getting-started-reactive#reactive-jax-rs-resources)

# RideFlow Driver Verification Database Design

## Status and scope

Design only. This document and SQL draft do not change application code or a
database. The draft is deliberately outside
`backend/src/main/resources/db/migration`, so Flyway will not discover it.
Existing V1, V2, and V3 files remain unchanged.

The migration directory contains only:

- V1 creates `users`, `user_roles`, `driver_profiles`, `driver_vehicles`,
  trips, and related tables/triggers.
- V2 adds `driver_profiles.is_online`.
- V3 allows lowercase `admin` in `user_roles`.

No later migration was found.

## Existing structure and driver queries

- `driver_profiles`: one row per driver, `user_id` primary key, role fixed to
  `driver`, status limited to `pending`, `active`, and `suspended`, and
  timestamps. The profile FK `(user_id, role)` references
  `user_roles(user_id, role)`.
- `driver_vehicles`: vehicle details, `verification_status` limited to
  `pending`, `verified`, and `rejected`, `is_active`, timestamps, and a
  constraint that an active vehicle must be verified. Its unique key
  `(driver_user_id, id, vehicle_type)` can support a document-to-vehicle
  composite FK.
- Driver registration inserts a `pending` profile. There are no document
  upload/storage handlers or persisted identity documents in the inspected
  code.
- `TripService.activeDriverTrip` treats `accepted`, `picking_up`, and
  `in_progress` as active. It returns at most one matching trip; the schema
  has no constraint proving a driver can have only one active trip. The final
  rule explicitly includes all three states in the drain, including `accepted`
  trips that have not started passenger pickup.
- `DriverService.setOnlineStatus(true)` requires the profile to be `active`
  and at least one active, verified vehicle. The existing profile self-service
  guard denies `suspended`, but does not require `active` for all other
  profile operations.
- `TripService.availableOrders`, acceptance, and eligibility checks require an
  active account, `driver` role, profile `active`, online where applicable,
  and an active verified vehicle of the applicable type.
- `PaymentService` driver checks require profile `active`.
- Existing code supports profile operational statuses `pending`, `active`, and
  `suspended`; it has no profile `rejected` state. Existing order/payment
  queries permit only operational status `active`. The draft adds a separate
  profile verification status; future order eligibility must require
  `approved` without changing the existing operational-state check.
- Existing vehicle self-service editing permits only `pending` vehicles.
  Supporting edits/resubmission of a `rejected` vehicle requires a future
  application change; it is not implemented by this schema draft.

Relevant query sites: `AuthService` profile creation; `DriverService` profile,
online, and vehicle queries; `TripService` order and eligibility queries;
`PaymentService` driver eligibility query. Current frontend presents
profile pending/active/suspended and vehicle pending/verified/rejected.

## Business rules represented by the design

Required document types:

- `ktp` and `sim` belong to a driver profile.
- `stnk` and `vehicle_photo` belong to a specific driver vehicle.
- All four are required for the applicable profile/vehicle review. The
  backend must check that the latest required document versions exist and
  have passed their document checks before completing the corresponding
  decision. A SQL row-level CHECK cannot enforce this multi-row rule.
- The reviewer evaluates the truth and match of the submitted data against
  the uploaded documents and registered vehicle details. No government
  identity-validation API or external source is assumed to exist.
- Profile approval/rejection and vehicle verification/rejection are distinct
  decisions. Approving a profile must not set any vehicle to `verified`;
  verifying a vehicle must not activate a profile.
- A profile verification state moved to `pending` or `rejected` must be offline. A vehicle moved
  from verified to rejected/pending must be made inactive in the same
  transaction to satisfy the existing active-requires-verified CHECK. The
  draft forces the profile offline on new inserts/updates in pending or
  rejected verification state or while any order hold is unreleased; adding
  the trigger does not rewrite legacy `is_online` values during migration.
- A profile verification rejection may be corrected and resubmitted.
  Resubmission changes its verification state back to `pending`, increments
  submission version, clears current-decision metadata, and retains all old decision
  events. A rejected vehicle is similarly resubmitted as `pending` with a
  higher verification version; existing code must be changed to permit the
  driver's corrections.
- Replacing a document inserts a new row with a new storage key. Do not
  update or delete old document rows as part of replacement. Latest-version
  selection must be explicit, not inferred from a client-supplied ID.
- When a previously verified document is replaced, the new document version
  is pending and its affected scope is sent back for review: KTP/SIM set the
  profile to pending; STNK/photo set the related vehicle to pending and
  inactive. The previous document row and its decision history remain intact.
  An unverified first upload for an already-pending application does not create
  a reverification hold because that driver is already ineligible.
- A replacement immediately blocks new orders. If any assigned trip is
  `accepted`, `picking_up`, or `in_progress`, set the order hold to `draining`:
  reject order listing/acceptance while allowing only those already assigned
  trips to progress. Otherwise set it directly to `held`. When the last active
  trip becomes terminal, change `draining` to `held` transactionally. Do not
  cancel trips or modify their status as part of the hold.
- Lock the driver profile before both hold creation and order acceptance, and
  use the same lock order in both transactions. Check for any active trip using
  the indexed `trips` query; do not rely on `activeDriverTrip()` because it
  returns only one row and the database does not enforce a single active trip.
- Keep the order hold independent from profile/vehicle/document verification
  states. After all impacted profile/vehicle/document review requirements are
  satisfied, admin approval can restore the affected verification states;
  release holds only for the scope whose latest required documents passed.
  Order intake resumes only when every hold for the driver is released.
  Existing account, role, online, and vehicle eligibility checks still apply.
- Set `driver_profiles.is_online = FALSE` when any replacement hold is
  requested. It remains false after hold release; the driver must explicitly
  opt back online, and the backend must still reject online activation while
  any hold is unreleased.
- Admin rejection always requires a non-blank reason. Every admin decision
  records reviewer ID and decision timestamp.
- A driver can receive an order only when the existing eligibility logic
  succeeds, including profile `active`, relevant vehicle `is_active` and
  `verification_status = 'verified'`, account/role checks, and online
  requirements. It must additionally require approved profile verification,
  verified latest KTP/SIM and STNK/vehicle-photo versions for the selected
  vehicle, and no unreleased driver hold. Legacy `verified` vehicle rows with
  no document history must not bypass these required-document checks. Do not
  weaken existing SQL checks.

## Proposed schema additions

### `driver_profiles`: profile verification only

- Leave existing operational `driver_profiles.status` and its V1 CHECK
  (`pending`, `active`, `suspended`) unchanged. Add an independent
  `verification_status` (`pending`, `approved`, `rejected`) so a driver can
  be reverified without overwriting an operational suspension or treating
  verification rejection as account suspension.
- Add `submission_version INTEGER NOT NULL DEFAULT 1`, positive. It increases
  when a rejected profile is resubmitted or a previously approved profile
  returns to pending after a verified KTP/SIM replacement.
- Add nullable `reviewer_admin_id BIGINT`, constrained constant
  `reviewer_role VARCHAR(16) DEFAULT 'admin' NOT NULL`, `reviewed_at
  TIMESTAMPTZ`, and `rejection_reason VARCHAR(1000)`.
- Add an FK from `reviewer_admin_id` to `users(id)` with `ON DELETE RESTRICT`.
  `reviewer_role` is a fixed `admin` audit snapshot. A trigger validates current
  admin membership when the decision is initially recorded, but there is no FK
  to `user_roles`: role revocation must not invalidate or block audit history.
- Add a `review_metadata_legacy BOOLEAN NOT NULL DEFAULT TRUE` column for the
  migration, then set its default to `FALSE`. Existing rows receive verification
  status `pending` with NULL reviewer metadata; this does not alter existing
  operational status or trip rows. Newly inserted rows also default to pending
  verification. New non-legacy rejected profiles require reviewer, time, and
  reason; pending profiles have no current decision metadata; approved profiles
  require reviewer/time and no rejection reason. The legacy flag is not
  application-facing and must not be set true by new code. Requiring approved
  verification for new orders will conservatively block legacy profiles until
  their required documents are reviewed.
- Profile `verification_status` never changes vehicle
  `verification_status`. Rejecting an application must not change an existing
  operational `suspended` status.
- Keep order holds in a separate `driver_order_acceptance_holds` table, not in
  profile/vehicle/document verification status. A hold is created for each
  verified document replacement that invalidates a scope. Its states are
  `draining`, `held`, and `released`; `draining` and `held` both block new
  orders. A separate append-only hold event table records request, drain,
  applied, and release transitions. A hold never changes trip status.
- Replacing a previously verified profile document sets profile
  `verification_status = 'pending'` and `is_online = FALSE` in the same
  transaction. It does not change operational `status` while a trip is
  draining. The hold becomes `draining` if an active trip exists, otherwise
  `held`. Prior approval events remain unchanged.

### `driver_vehicles`: vehicle verification only

- Keep the existing separate `verification_status` values `pending`,
  `verified`, and `rejected`, and keep `is_active` / the existing active
  requires verified constraint.
- Add `verification_version INTEGER NOT NULL DEFAULT 1`, positive. Increase
  it only when a rejected vehicle is resubmitted.
- Add nullable reviewer ID, constant admin role, review timestamp, and
  rejection reason fields for the current vehicle decision.
- Add `review_metadata_legacy` with the same migration pattern: existing
  vehicle rows, including any legacy `rejected` or `verified` rows, are marked
  legacy and retain their original status; the new-row default is false.
  Non-legacy pending has no current-decision metadata; non-legacy verified
  requires reviewer/time; non-legacy rejected requires reviewer/time and a
  non-blank reason. Keep the compatibility flag inaccessible to normal
  application updates.
- Use the same reviewer user FK, role snapshot, and decision-time role
  validation as the profile. Vehicle decisions do not alter profile status.
- Replacing a previously verified vehicle document sets the vehicle
  `verification_status` to `pending` and `is_active = FALSE`; the existing
  CHECK requires the latter. During an active trip, backend progression must
  permit only the already-assigned trip under `draining` despite the vehicle
  no longer being eligible for new dispatch. The driver-wide order hold blocks
  new intake while any required scope is reverified.

### `driver_documents`: immutable versions and private-storage metadata

Each upload version is a separate row:

- `id`, `driver_user_id`, `document_type` (`ktp`, `sim`, `stnk`,
  `vehicle_photo`), `document_version`, nullable vehicle identity, `storage_key`,
  `original_filename`, `mime_type`, `file_size`, `uploaded_at`, `uploaded_by`.
- KTP/SIM rows have no vehicle ID. STNK/vehicle-photo rows must identify the
  driver's vehicle. A composite FK using
  `(driver_user_id, vehicle_id, vehicle_type)` references the existing
  `driver_vehicles(driver_user_id, id, vehicle_type)` unique key, preventing a
  document from referencing another driver's vehicle.
- `storage_key` is a unique opaque key of 64 lowercase hex characters (at
  least 256 bits generated by a cryptographically secure RNG). It is not a
  public URL or a bearer credential.
- Allowed filename extensions are `.jpg`, `.jpeg`, `.png`, `.pdf`; allowed
  MIME types are `image/jpeg`, `image/png`, and `application/pdf`, with
  extension/MIME pairing constrained in SQL as defense in depth.
- Maximum `file_size` is 10,000,000 bytes (decimal 10 MB) per document.
- Document-level `verification_status` is separate from vehicle status and
  supports `pending`, `verified`, and `rejected`; current decision metadata
  includes reviewer, time, and required reason on rejection. These states
  represent document inspection, not profile approval or vehicle activation.
- Keep every version. A replacement adds a row and never deletes or overwrites
  an earlier document or its history. Increment `document_version` within its
  profile/document-type or vehicle/document-type scope; select the latest
  version by this value, not upload timestamp or client-provided IDs. The
  insert trigger locks the driver profile and assigns the next version; the
  unique indexes are a second defense. Never trust a client-supplied version.
- The draft uses a trigger to prevent deletion or changes to uploaded document
  identity/storage metadata; only document review fields may change. Version
  generation is serialized per driver profile, then (for vehicle documents)
  the vehicle row is locked.
- Legacy profile/vehicle decisions cannot be changed while leaving the row in
  legacy mode. A reviewer must transition the row out of legacy mode together
  with the new decision; the deferred audit constraint then requires the
  matching event for every resulting non-pending decision. A legacy row may
  transition to a non-legacy pending state without inventing a past decision.

`uploaded_by` is constrained to an existing user and must equal the driver
owner in this driver-upload workflow. Current document reviewer references
the admin user and stores `reviewer_role = 'admin'` as a decision-time audit
snapshot.

### `driver_order_acceptance_holds`: dispatch-only suspension

- Each hold references its driver and the replacement document version that
  caused reverification. Scope is either `profile` (KTP/SIM) or `vehicle`
  (STNK/photo, with a same-driver vehicle FK).
- An AFTER INSERT document trigger creates the hold in the same transaction
  when the immediately preceding version was verified. It also sets the
  affected profile/vehicle verification state pending, clears only current
  review metadata, deactivates a vehicle document scope, and sets the driver
  offline for profile documents. First uploads and replacements of unverified
  versions do not create an additional reverification hold.
- Initial state is `draining` when any assigned trip has status `accepted`,
  `picking_up`, or `in_progress`; otherwise initial state is `held`.
- Both states prohibit new order discovery/acceptance immediately.
  `draining` exists only while at least one already-assigned trip remains
  active; after the last trip becomes terminal, it transitions to `held`.
- When the impacted scope and its current required documents pass admin review,
  the hold transitions to `released`. Multiple replacement documents create
  separate holds; order intake is allowed only when no unreleased hold remains.
- Profile-scope release requires current profile verification `approved`, an
  `approved` event for the current submission version, and latest KTP and SIM
  versions both `verified` with matching verification events. Vehicle-scope
  release requires current vehicle status `verified`, a `verified` event for
  its current verification version, and latest STNK and vehicle-photo versions
  both `verified` with matching events. A database trigger enforces this
  release gate against the latest versions; incomplete or rejected scopes
  cannot release a hold.
- Each row is retained. A trigger appends state events and prevents deleting
  holds; state transitions are monotonic (`draining -> held`, then
  `held -> released`). This audit trail is separate from profile/vehicle
  approval events.
- A BEFORE trigger derives initial `draining`/`held` state from the active-trip
  query, rejects `draining -> held` while any active trip exists, and enforces
  the release gate against the current profile/vehicle decision and latest
  required verified document versions with their decision events.
- An AFTER trip-status trigger moves all of a driver's draining holds to
  `held` in the same transaction that makes the last active trip terminal.
- A database CHECK cannot enforce that profile/vehicle approval itself has
  all required documents; the release trigger enforces this for holds, while
  backend order eligibility must enforce it for every driver, including legacy
  rows and first-time uploads.

### Decision histories

- `driver_profile_verification_events`: driver ID, profile `submission_version`,
  decision (`approved`/`rejected`), reviewer admin ID, decision time, and
  rejection reason. Unique `(driver_user_id, submission_version)` prevents
  two final profile decisions for one application attempt.
- `driver_vehicle_verification_events`: vehicle ID, vehicle
  `verification_version`, decision (`verified`/`rejected`), reviewer, time,
  and rejection reason. Unique `(vehicle_id, verification_version)`.
- `driver_document_verification_events`: document ID, decision
  (`verified`/`rejected`), reviewer, time, and rejection reason. Unique
  `(document_id)` for one final decision per immutable upload version.
- Each history reviewer has an FK to `users(id)` and a CHECK requiring the
  role snapshot `admin`. A BEFORE INSERT trigger verifies the reviewer has
  current `admin` membership when the decision is recorded. Do not FK audit
  history to `user_roles`: removing an admin role later must not invalidate or
  block historical records. `ON DELETE RESTRICT` on the user FK preserves the
  reviewer identity row.
- Current-state update and event insertion must occur in one transaction.
  Deferred constraint triggers check both directions at commit: every new
  non-legacy approved/rejected/verified state has exactly one matching
  immutable event, and every newly inserted event matches the current
  non-legacy state/version and decision metadata. Draft triggers reject event
  UPDATE/DELETE.
- Documents have no expiry-driven status transition. Validity dates may be
  retained as untrusted/display metadata only if later required; no scheduler
  or database trigger suspends a driver merely because a date passes.

The histories reference profile/vehicle/document identity, plus a version
number, rather than a composite FK to the *current* version. That preserves old
events when the profile or vehicle version increments during resubmission.

## Constraints and indexes

- Preserve existing PKs, role/profile FKs, vehicle FKs, vehicle state check,
  and all existing V1–V3 objects.
- Reviewer IDs FK to `users(id)` with `ON DELETE RESTRICT`; reviewer role is
  a fixed `admin` snapshot. A trigger checks current role membership when
  inserting or first assigning a decision. Removing the role later does not
  cascade to or prevent reading the audit event. Deleting the user remains
  restricted to preserve identity.
- Existing profile operational status remains governed by V1; the added
  profile verification CHECK is `pending`, `approved`, or `rejected`.
  Vehicle/document checks retain their own separate state sets.
- Rejection reason is `VARCHAR(1000)`, non-blank after `btrim`, and required
  for new rejected decisions. Reviewer ID and decision timestamp must both be
  present or both absent.
- Enforce required-document placement (profile vs vehicle), extension/MIME
  pairing, file-size range, allowed document/status values, opaque-key format,
  and uploader ownership.
- Index profile review queue `(verification_status, created_at, user_id)`.
- Index vehicle review queue `(verification_status, created_at, id)` and
  documents `(verification_status, uploaded_at, id)`,
  `(driver_user_id, document_type, document_version DESC)`, and
  `(vehicle_id, document_type, document_version DESC)`. Add partial unique
  indexes so document versions are unique within each profile- or
  vehicle-scoped type.
- Index histories by profile/vehicle/document identity and decision time, and
  reviewer ID/time. Current vehicle unique constraint already supports the
  composite document FK; no user-role schema change is needed.
- Add a partial index on trips `(driver_user_id, status)` for statuses
  `accepted`, `picking_up`, and `in_progress` to detect active rides while
  applying/releasing a hold.
- Use one lock order for all competing operations: driver profile first, then
  vehicle, document rows, trip rows, and hold rows. Upload/replacement,
  document/profile/vehicle decisions, online activation, order acceptance,
  active-trip progression, and trip completion must follow this order and
  revalidate state after acquiring locks. Otherwise approval can race a newer
  upload, or replacement can race an order acceptance. `TripService` currently
  locks a trip before checking driver eligibility; its future implementation
  must first identify the driver, lock the profile, then lock and revalidate
  the trip. The drain trigger itself runs after the trip row is updated, so
  every application path changing a trip must pre-lock the profile; direct
  table writes should not be granted to application roles.
- PostgreSQL may abort a transaction that acquires these locks in the opposite
  order. Retry only bounded, known serialization/deadlock SQL states; do not
  convert an aborted acceptance or completion into success-shaped fallback.
- `availableOrders`, `accept`, and driver online activation must check for any
  unreleased hold. An active-trip progression request must instead verify it is
  the same driver and trip already assigned before allowing progress during
  `draining`. The SQL offline trigger is defense in depth, not a substitute for
  returning an explicit eligibility error from the online-status API.

## File security and serving requirements

- Store binaries outside PostgreSQL in private object storage with public
  access disabled. Never create a public document URL.
- Validate file size and extension on the server, inspect content/signature
  (not just browser MIME), and verify the MIME/extension pair. Apply
  allow-listing and malware scanning before storage; browser-supplied filename
  and MIME are untrusted.
- Generate random storage keys server-side with at least 256 bits of
  cryptographic randomness. Do not derive a key from driver ID, document ID,
  filename, email, plate, or a sequence.
- A later document-read endpoint must authenticate, require
  `@RolesAllowed("admin")`, authorize the referenced document, and stream from
  private storage. A signed URL is optional only after authorization, narrowly
  scoped and short-lived. Never expose storage keys through general user APIs.
- Escape `original_filename` in UI and `Content-Disposition`; never use it to
  construct a path.
- Define encryption-at-rest, access audit logging, retention/deletion, and
  secure backup/object-store policies before accepting real KTP/SIM/STNK data.

## Existing-data compatibility and behavioral impact

- V1–V3 remain untouched. Existing profile operational statuses (`pending`,
  `active`, `suspended`) remain permitted and unchanged. Existing vehicle statuses
  (`pending`, `verified`, `rejected`) and `is_active` values remain permitted.
- The legacy metadata flag is populated `TRUE` for existing rows before its
  default changes to `FALSE`. It lets existing `active` profiles and
  `verified`/`rejected` vehicles keep NULL reviewer/time/reason rather than
  inventing audit history or causing migration failure. New rows get `FALSE`.
- Existing users, roles, profile/vehicle rows, and trip/payment data are not
  rewritten. New columns use safe defaults; new child tables are empty.
- Existing eligibility checks remain and gain explicit checks for profile
  `verification_status = 'approved'` and no unreleased order hold. Operational
  profile status must still be `active`, the vehicle active and verified, and
  all account/role/online/type checks still apply. A rejected profile is
  resubmitted by setting verification status to `pending`, incrementing
  `submission_version`, clearing only current decision metadata, setting
  `is_online = FALSE`, and retaining events. Operational `suspended` remains
  suspended through review and approval.
- The order hold is an additional explicit dispatch gate, not a replacement
  for profile/vehicle status checks. Order listing and acceptance require that
  no unreleased hold exists. During `draining`, an already accepted trip must remain
  progressable even after the profile/vehicle status becomes pending; after
  the last trip completes or otherwise becomes terminal, hold state changes
  to `held`. The profile/vehicle/document statuses remain pending until admin
  review succeeds.
- A rejected vehicle needs the equivalent versioned resubmission and a driver
  edit path. Current `DriverService.updatePendingVehicle` only edits pending
  vehicles; schema alone does not provide the requested correction flow.
- Document completeness and document verification are separate from profile
  and vehicle statuses. The admin service must validate KTP/SIM before profile
  approval, and STNK/photo for the selected vehicle before vehicle
  verification. This coordination is transactional; no profile approval
  should silently verify a vehicle or vice versa.
- Frontend and service updates are required later for upload, document
  replacement/version selection, profile/vehicle review separately,
  rejection/resubmission, secure document viewing, and status display.

## Backup and isolated migration validation plan

1. Before eventual rollout, take and restore-test a PostgreSQL 17 backup.
   Record Flyway history and counts for profiles, vehicles, roles, and trips.
2. Restore to an isolated PostgreSQL 17 instance; apply V1–V3 and candidate
   V4 only there. Never point validation at the primary database.
3. Use representative existing profile states (pending/active/suspended) and
   vehicle states (pending/verified/rejected), including active verified
   vehicles. Verify every old row/status/relationship is unchanged and legacy
   metadata remains NULL.
4. Test new profile/vehicle statuses and metadata combinations, decision-time
   rejection of non-admin reviewers, required reasons, timestamp/reviewer
   pairing, version/event uniqueness, and resubmission without losing history.
   Remove an admin role after decisions and verify reviewer references and
   audit rows remain readable and unchanged.
5. Test document type placement, owner/vehicle composite FK, extension/MIME
   combinations, unique sequential versions per scope, exact 10,000,000 byte
   limit, invalid/oversized files at the API layer, private storage behavior,
   and document replacement retaining prior rows/events.
6. Exercise existing driver online/order/payment query paths against pending,
   rejected, active, and suspended profiles and all vehicle states. Verify no
   eligibility regression and no customer/driver access to admin document
   reads.
7. Test a document replacement during each active trip status, including
   multiple active trips: new order listing/acceptance must be denied
   immediately; assigned trips must progress to terminal without status
   rewriting; the hold becomes `held` only after none remain. Test no-active-
   trip replacement creates a `held` row immediately. Approval releases only
   the applicable holds, and order intake remains blocked while any unreleased
   hold remains.
8. Test that hold states cannot move backwards, hold/event deletion or event
   edits fail, and replacement/accept transactions serialize to prevent an
   order-acceptance race.
9. Check Flyway history/checksum and startup against the restored instance;
   rehearse restore/rollback operationally before approval. Do not apply V4 to
   production until design, application implementation, tests, and rollout
   are approved.

## Remaining decisions and risks

- The 10 MB limit is specified here as decimal 10,000,000 bytes. Keep the same
  precise limit at API, reverse proxy, and object-storage layers.
- No date-based automatic suspension is designed. Review decisions are based
  on the truth and match of the submitted data/documents, not an expiry date
  alone.
- Confirm accepted image/PDF content profiles (e.g. whether animated or
  multi-page content is acceptable), malware scanning, retention, encryption,
  and document access audit requirements.
- Admin role revocation is supported by snapshot reviewer role + FK to users
  + decision-time role validation trigger. Removing the `admin` row from
  `user_roles` leaves every review event intact. The reviewer user row itself
  cannot be deleted while audit records refer to it.
- `review_metadata_legacy` is a migration compatibility marker, not a
  user-editable value. The draft rejects new legacy rows and blocks changes to
  a legacy review decision while it remains in legacy mode. A new
  approved/rejected/verified decision must transition it out of legacy mode
  with current metadata and its matching event in the same transaction.
  Application update paths must never set it to `TRUE`.
- Existing service does not allow editing rejected vehicles and current
  profile guards do not fully define rejected self-service. Those application
  changes are out of scope for this design-only stage.
- `TripService.progress()` currently rechecks profile active and vehicle active/
  verified. Backend must change it to permit progression only for the already
  assigned active trip during `draining`, without permitting new acceptance.
  Re-evaluate the account suspension/role checks separately; do not broaden
  this exception to unrelated trips.
- A vehicle document replacement changes the vehicle to pending/inactive
  immediately. Consequently the existing vehicle eligibility check in
  `TripService.progress()` would block its assigned trip unless the backend
  adds a narrow draining exception for that exact driver/trip/vehicle. Profile
  operational status remains unchanged during verification, so KTP/SIM
  replacement does not itself break current profile-active progress/payment
  checks.
- `PaymentService.confirmCash()` currently also requires an active driver
  profile. The proposed reverification flow leaves operational profile status
  unchanged, so it should not by itself block settlement. If another policy
  changes that operational status during a trip, design a narrowly scoped
  post-completion settlement rule without authorizing new trip acceptance.
- Hold transition must be coordinated with every path that makes a trip
  terminal, including customer cancellation and driver completion. If another
  cancellation/administrative path exists, it must also trigger the
  `draining` -> `held` check.
- Current `TripService.cancel()` cancels only trips still in `requested` state,
  so it does not end an assigned active trip. If cancellation policy changes,
  its new terminal paths must participate in the hold transition logic.
- The database currently has no one-active-trip-per-driver constraint;
  `activeDriverTrip()` returns only one row. Backend hold activation/release
  must query whether *any* matching active trip remains, not rely on that
  single-row API result.
- The legacy marker deliberately preserves old vehicle verification values,
  but legacy rows have no decision event or required document versions.
  Therefore neither a legacy vehicle `verified` state nor a newly approved
  profile alone is sufficient for dispatch; the future backend eligibility
  query must require the latest required document decisions explicitly.

## Related code audited

- `backend/src/main/resources/db/migration/V1__create_initial_schema.sql`
- `backend/src/main/resources/db/migration/V2__add_driver_online_status.sql`
- `backend/src/main/resources/db/migration/V3__add_admin_role.sql`
- `backend/src/main/java/id/rideflow/service/AuthService.java`
- `backend/src/main/java/id/rideflow/service/DriverService.java`
- `backend/src/main/java/id/rideflow/service/TripService.java`
- `backend/src/main/java/id/rideflow/service/PaymentService.java`
- `backend/src/main/java/id/rideflow/resource/DriverResource.java`
- `backend/src/main/java/id/rideflow/resource/AdminResource.java`
- `src/app/driver/profile/page.tsx`
- `src/components/admin/AdminLayout.tsx`

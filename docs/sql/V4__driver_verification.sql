-- DESIGN DRAFT ONLY. Kept outside the active Flyway migration directory.
-- Do not execute until approved and tested on a restored PostgreSQL 17 copy.
-- V1, V2, and V3 are not modified by this draft.

-- Profile review state is independent of vehicle verification state.
ALTER TABLE driver_profiles
    ADD COLUMN verification_status VARCHAR(16) NOT NULL DEFAULT 'pending',
    ADD COLUMN submission_version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN reviewer_admin_id BIGINT,
    ADD COLUMN reviewer_role VARCHAR(16) NOT NULL DEFAULT 'admin',
    ADD COLUMN reviewed_at TIMESTAMPTZ,
    ADD COLUMN rejection_reason VARCHAR(1000),
    ADD COLUMN review_metadata_legacy BOOLEAN NOT NULL DEFAULT TRUE,
    ADD CONSTRAINT driver_profiles_verification_status_valid
        CHECK (verification_status IN ('pending', 'approved', 'rejected')),
    ADD CONSTRAINT driver_profiles_submission_version_positive
        CHECK (submission_version > 0),
    ADD CONSTRAINT driver_profiles_reviewer_role_admin
        CHECK (reviewer_role = 'admin'),
    ADD CONSTRAINT driver_profiles_reviewer_admin_fk
        FOREIGN KEY (reviewer_admin_id)
        REFERENCES users (id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT driver_profiles_review_metadata_pair
        CHECK ((reviewer_admin_id IS NULL) = (reviewed_at IS NULL)),
    ADD CONSTRAINT driver_profiles_review_metadata_valid
        CHECK (
            (
                review_metadata_legacy
                AND (
                    (reviewer_admin_id IS NULL
                        AND reviewed_at IS NULL
                        AND rejection_reason IS NULL)
                    OR
                    (reviewer_admin_id IS NOT NULL
                        AND reviewed_at IS NOT NULL
                        AND (
                            (verification_status = 'rejected'
                                AND rejection_reason IS NOT NULL
                                AND btrim(rejection_reason) <> '')
                            OR
                            (verification_status = 'approved'
                                AND rejection_reason IS NULL)
                        ))
                )
            )
            OR
            (
                NOT review_metadata_legacy
                AND (
                    (verification_status = 'pending'
                        AND reviewer_admin_id IS NULL
                        AND reviewed_at IS NULL
                        AND rejection_reason IS NULL)
                    OR
                    (verification_status = 'rejected'
                        AND reviewer_admin_id IS NOT NULL
                        AND reviewed_at IS NOT NULL
                        AND rejection_reason IS NOT NULL
                        AND btrim(rejection_reason) <> '')
                    OR
                    (verification_status = 'approved'
                        AND reviewer_admin_id IS NOT NULL
                        AND reviewed_at IS NOT NULL
                        AND rejection_reason IS NULL)
                )
            )
        );

-- Existing rows are marked legacy by the ADD COLUMN default. New rows use
-- FALSE. Resubmission code must clear current decision metadata and increment
-- submission_version; it must never mark a row legacy.
ALTER TABLE driver_profiles
    ALTER COLUMN review_metadata_legacy SET DEFAULT FALSE;

CREATE INDEX driver_profiles_review_queue_idx
    ON driver_profiles (verification_status, created_at, user_id);

CREATE INDEX trips_driver_active_status_idx
    ON trips (driver_user_id, status)
    WHERE status IN ('accepted', 'picking_up', 'in_progress');

CREATE INDEX driver_profiles_reviewer_admin_idx
    ON driver_profiles (reviewer_admin_id)
    WHERE reviewer_admin_id IS NOT NULL;

-- Vehicle review is independent of driver-profile review. Existing vehicle
-- rows may already be rejected/verified without reviewer metadata, so preserve
-- them with a legacy marker and only require metadata for new/current reviews.
ALTER TABLE driver_vehicles
    ADD COLUMN verification_version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN reviewer_admin_id BIGINT,
    ADD COLUMN reviewer_role VARCHAR(16) NOT NULL DEFAULT 'admin',
    ADD COLUMN reviewed_at TIMESTAMPTZ,
    ADD COLUMN rejection_reason VARCHAR(1000),
    ADD COLUMN review_metadata_legacy BOOLEAN NOT NULL DEFAULT TRUE,
    ADD CONSTRAINT driver_vehicles_driver_id_uq UNIQUE (driver_user_id, id),
    ADD CONSTRAINT driver_vehicles_verification_version_positive
        CHECK (verification_version > 0),
    ADD CONSTRAINT driver_vehicles_reviewer_role_admin
        CHECK (reviewer_role = 'admin'),
    ADD CONSTRAINT driver_vehicles_reviewer_admin_fk
        FOREIGN KEY (reviewer_admin_id)
        REFERENCES users (id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT driver_vehicles_review_metadata_pair
        CHECK ((reviewer_admin_id IS NULL) = (reviewed_at IS NULL)),
    ADD CONSTRAINT driver_vehicles_review_metadata_valid
        CHECK (
            (
                review_metadata_legacy
                AND (
                    (reviewer_admin_id IS NULL
                        AND reviewed_at IS NULL
                        AND rejection_reason IS NULL)
                    OR
                    (reviewer_admin_id IS NOT NULL
                        AND reviewed_at IS NOT NULL
                        AND (
                            (verification_status = 'rejected'
                                AND rejection_reason IS NOT NULL
                                AND btrim(rejection_reason) <> '')
                            OR
                            (verification_status = 'verified'
                                AND rejection_reason IS NULL)
                        ))
                )
            )
            OR
            (
                NOT review_metadata_legacy
                AND (
                    (verification_status = 'pending'
                        AND reviewer_admin_id IS NULL
                        AND reviewed_at IS NULL
                        AND rejection_reason IS NULL)
                    OR
                    (verification_status = 'verified'
                        AND reviewer_admin_id IS NOT NULL
                        AND reviewed_at IS NOT NULL
                        AND rejection_reason IS NULL)
                    OR
                    (verification_status = 'rejected'
                        AND reviewer_admin_id IS NOT NULL
                        AND reviewed_at IS NOT NULL
                        AND rejection_reason IS NOT NULL
                        AND btrim(rejection_reason) <> '')
                )
            )
        );

ALTER TABLE driver_vehicles
    ALTER COLUMN review_metadata_legacy SET DEFAULT FALSE;

CREATE INDEX driver_vehicles_review_queue_idx
    ON driver_vehicles (verification_status, created_at, id);

CREATE INDEX driver_vehicles_reviewer_admin_idx
    ON driver_vehicles (reviewer_admin_id)
    WHERE reviewer_admin_id IS NOT NULL;

CREATE FUNCTION prevent_new_legacy_review_metadata() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.review_metadata_legacy THEN
            RAISE EXCEPTION 'Legacy review metadata is reserved for pre-migration rows';
        END IF;
    ELSIF NEW.review_metadata_legacy AND NOT OLD.review_metadata_legacy THEN
        RAISE EXCEPTION 'Legacy review metadata is reserved for pre-migration rows';
    ELSIF OLD.review_metadata_legacy AND NEW.review_metadata_legacy
        AND ROW(
            NEW.verification_status,
            NEW.reviewer_admin_id,
            NEW.reviewer_role,
            NEW.reviewed_at,
            NEW.rejection_reason
        ) IS DISTINCT FROM ROW(
            OLD.verification_status,
            OLD.reviewer_admin_id,
            OLD.reviewer_role,
            OLD.reviewed_at,
            OLD.rejection_reason
        ) THEN
        RAISE EXCEPTION 'Legacy review state must be cleared before recording a new decision';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER driver_profiles_legacy_review_flag_guard
    BEFORE INSERT OR UPDATE ON driver_profiles
    FOR EACH ROW EXECUTE FUNCTION prevent_new_legacy_review_metadata();

CREATE TRIGGER driver_vehicles_legacy_review_flag_guard
    BEFORE INSERT OR UPDATE ON driver_vehicles
    FOR EACH ROW EXECUTE FUNCTION prevent_new_legacy_review_metadata();

CREATE FUNCTION force_driver_offline_for_unapproved_profile() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.verification_status IN ('pending', 'rejected')
        OR EXISTS (
            SELECT 1
            FROM driver_order_acceptance_holds h
            WHERE h.driver_user_id = NEW.user_id
                AND h.status IN ('draining', 'held')
        ) THEN
        NEW.is_online := FALSE;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER driver_profiles_unapproved_offline
    BEFORE INSERT OR UPDATE OF verification_status, is_online ON driver_profiles
    FOR EACH ROW EXECUTE FUNCTION force_driver_offline_for_unapproved_profile();

-- One row per immutable uploaded version. Binary data stays in private object
-- storage. STNK and vehicle photos are tied to the exact driver's vehicle;
-- KTP and SIM are profile-level documents.
CREATE TABLE driver_documents (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    driver_user_id BIGINT NOT NULL,
    document_type VARCHAR(32) NOT NULL,
    document_version INTEGER NOT NULL DEFAULT 1,
    vehicle_id BIGINT,
    vehicle_type VARCHAR(16),
    storage_key VARCHAR(64) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uploaded_by BIGINT NOT NULL,
    verification_status VARCHAR(16) NOT NULL DEFAULT 'pending',
    reviewer_admin_id BIGINT,
    reviewer_role VARCHAR(16) NOT NULL DEFAULT 'admin',
    reviewed_at TIMESTAMPTZ,
    rejection_reason VARCHAR(1000),
    CONSTRAINT driver_documents_driver_fk
        FOREIGN KEY (driver_user_id)
        REFERENCES driver_profiles (user_id)
        ON DELETE RESTRICT,
    CONSTRAINT driver_documents_vehicle_fk
        FOREIGN KEY (driver_user_id, vehicle_id, vehicle_type)
        REFERENCES driver_vehicles (driver_user_id, id, vehicle_type)
        ON DELETE RESTRICT,
    CONSTRAINT driver_documents_uploader_fk
        FOREIGN KEY (uploaded_by)
        REFERENCES users (id)
        ON DELETE RESTRICT,
    CONSTRAINT driver_documents_driver_id_uq
        UNIQUE (driver_user_id, id),
    CONSTRAINT driver_documents_uploaded_by_owner
        CHECK (uploaded_by = driver_user_id),
    CONSTRAINT driver_documents_type_valid
        CHECK (document_type IN ('ktp', 'sim', 'stnk', 'vehicle_photo')),
    CONSTRAINT driver_documents_version_positive
        CHECK (document_version > 0),
    CONSTRAINT driver_documents_vehicle_scope_valid
        CHECK (
            (document_type IN ('ktp', 'sim')
                AND vehicle_id IS NULL
                AND vehicle_type IS NULL)
            OR
            (document_type IN ('stnk', 'vehicle_photo')
                AND vehicle_id IS NOT NULL
                AND vehicle_type IS NOT NULL)
        ),
    CONSTRAINT driver_documents_storage_key_unique
        UNIQUE (storage_key),
    CONSTRAINT driver_documents_storage_key_random_format
        CHECK (storage_key ~ '^[0-9a-f]{64}$'),
    CONSTRAINT driver_documents_filename_not_blank
        CHECK (btrim(original_filename) <> ''),
    CONSTRAINT driver_documents_file_format_valid
        CHECK (
            (lower(original_filename) ~ '\.(jpg|jpeg)$'
                AND lower(mime_type) = 'image/jpeg')
            OR
            (lower(original_filename) ~ '\.png$'
                AND lower(mime_type) = 'image/png')
            OR
            (lower(original_filename) ~ '\.pdf$'
                AND lower(mime_type) = 'application/pdf')
        ),
    CONSTRAINT driver_documents_file_size_valid
        CHECK (file_size BETWEEN 1 AND 10000000),
    CONSTRAINT driver_documents_verification_status_valid
        CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    CONSTRAINT driver_documents_reviewer_role_admin
        CHECK (reviewer_role = 'admin'),
    CONSTRAINT driver_documents_reviewer_admin_fk
        FOREIGN KEY (reviewer_admin_id)
        REFERENCES users (id)
        ON DELETE RESTRICT,
    CONSTRAINT driver_documents_review_metadata_pair
        CHECK ((reviewer_admin_id IS NULL) = (reviewed_at IS NULL)),
    CONSTRAINT driver_documents_review_metadata_valid
        CHECK (
            (verification_status = 'pending'
                AND reviewer_admin_id IS NULL
                AND reviewed_at IS NULL
                AND rejection_reason IS NULL)
            OR
            (verification_status = 'verified'
                AND reviewer_admin_id IS NOT NULL
                AND reviewed_at IS NOT NULL
                AND rejection_reason IS NULL)
            OR
            (verification_status = 'rejected'
                AND reviewer_admin_id IS NOT NULL
                AND reviewed_at IS NOT NULL
                AND rejection_reason IS NOT NULL
                AND btrim(rejection_reason) <> '')
        )
);

CREATE INDEX driver_documents_review_queue_idx
    ON driver_documents (verification_status, uploaded_at, id);

CREATE INDEX driver_documents_reviewer_admin_idx
    ON driver_documents (reviewer_admin_id)
    WHERE reviewer_admin_id IS NOT NULL;

CREATE INDEX driver_documents_driver_type_idx
    ON driver_documents (driver_user_id, document_type, document_version DESC);

CREATE INDEX driver_documents_vehicle_type_idx
    ON driver_documents (vehicle_id, document_type, document_version DESC)
    WHERE vehicle_id IS NOT NULL;

CREATE UNIQUE INDEX driver_documents_profile_version_uq
    ON driver_documents (driver_user_id, document_type, document_version)
    WHERE vehicle_id IS NULL;

CREATE UNIQUE INDEX driver_documents_vehicle_version_uq
    ON driver_documents (vehicle_id, document_type, document_version)
    WHERE vehicle_id IS NOT NULL;

-- A hold is created for each replacement that invalidates a previously
-- verified document. It is separate from all verification states and is
-- retained after release for auditability.
CREATE TABLE driver_order_acceptance_holds (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    driver_user_id BIGINT NOT NULL,
    source_document_id BIGINT NOT NULL,
    scope_type VARCHAR(16) NOT NULL,
    vehicle_id BIGINT,
    status VARCHAR(16) NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    CONSTRAINT driver_order_holds_driver_fk
        FOREIGN KEY (driver_user_id)
        REFERENCES driver_profiles (user_id)
        ON DELETE RESTRICT,
    CONSTRAINT driver_order_holds_source_document_fk
        FOREIGN KEY (driver_user_id, source_document_id)
        REFERENCES driver_documents (driver_user_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT driver_order_holds_vehicle_fk
        FOREIGN KEY (driver_user_id, vehicle_id)
        REFERENCES driver_vehicles (driver_user_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT driver_order_holds_scope_valid
        CHECK (
            (scope_type = 'profile' AND vehicle_id IS NULL)
            OR (scope_type = 'vehicle' AND vehicle_id IS NOT NULL)
        ),
    CONSTRAINT driver_order_holds_status_valid
        CHECK (
            (status = 'draining'
                AND applied_at IS NULL
                AND released_at IS NULL)
            OR (status = 'held'
                AND applied_at IS NOT NULL
                AND applied_at >= requested_at
                AND released_at IS NULL)
            OR (status = 'released'
                AND applied_at IS NOT NULL
                AND released_at IS NOT NULL
                AND applied_at >= requested_at
                AND released_at >= applied_at)
        ),
    CONSTRAINT driver_order_holds_source_document_uq UNIQUE (source_document_id)
);

CREATE INDEX driver_order_holds_active_idx
    ON driver_order_acceptance_holds (driver_user_id, status)
    WHERE status IN ('draining', 'held');

CREATE INDEX driver_order_holds_source_document_idx
    ON driver_order_acceptance_holds (driver_user_id, source_document_id);

CREATE INDEX driver_order_holds_vehicle_idx
    ON driver_order_acceptance_holds (driver_user_id, vehicle_id)
    WHERE vehicle_id IS NOT NULL;

CREATE TABLE driver_order_acceptance_hold_events (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    hold_id BIGINT NOT NULL,
    event_type VARCHAR(16) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT driver_order_hold_events_hold_fk
        FOREIGN KEY (hold_id)
        REFERENCES driver_order_acceptance_holds (id)
        ON DELETE RESTRICT,
    CONSTRAINT driver_order_hold_events_type_valid
        CHECK (event_type IN ('requested', 'draining', 'held', 'released'))
);

CREATE INDEX driver_order_hold_events_history_idx
    ON driver_order_acceptance_hold_events (hold_id, occurred_at, id);

-- Current submission versions live on the profile/vehicle rows. Histories
-- retain decisions for older versions as those current-version numbers rise.
CREATE TABLE driver_profile_verification_events (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    driver_user_id BIGINT NOT NULL,
    submission_version INTEGER NOT NULL,
    decision VARCHAR(16) NOT NULL,
    reviewer_admin_id BIGINT NOT NULL,
    reviewer_role VARCHAR(16) NOT NULL DEFAULT 'admin',
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rejection_reason VARCHAR(1000),
    CONSTRAINT driver_profile_events_driver_fk
        FOREIGN KEY (driver_user_id)
        REFERENCES driver_profiles (user_id)
        ON DELETE RESTRICT,
    CONSTRAINT driver_profile_events_version_positive
        CHECK (submission_version > 0),
    CONSTRAINT driver_profile_events_one_decision_per_submission
        UNIQUE (driver_user_id, submission_version),
    CONSTRAINT driver_profile_events_decision_valid
        CHECK (decision IN ('approved', 'rejected')),
    CONSTRAINT driver_profile_events_reviewer_role_admin
        CHECK (reviewer_role = 'admin'),
    CONSTRAINT driver_profile_events_reviewer_admin_fk
        FOREIGN KEY (reviewer_admin_id)
        REFERENCES users (id)
        ON DELETE RESTRICT,
    CONSTRAINT driver_profile_events_reason_valid
        CHECK (
            (decision = 'rejected'
                AND rejection_reason IS NOT NULL
                AND btrim(rejection_reason) <> '')
            OR
            (decision = 'approved' AND rejection_reason IS NULL)
        )
);

CREATE INDEX driver_profile_events_history_idx
    ON driver_profile_verification_events
        (driver_user_id, reviewed_at DESC, id DESC);

CREATE INDEX driver_profile_events_reviewer_idx
    ON driver_profile_verification_events (reviewer_admin_id, reviewed_at DESC);

CREATE TABLE driver_vehicle_verification_events (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    vehicle_id BIGINT NOT NULL,
    verification_version INTEGER NOT NULL,
    decision VARCHAR(16) NOT NULL,
    reviewer_admin_id BIGINT NOT NULL,
    reviewer_role VARCHAR(16) NOT NULL DEFAULT 'admin',
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rejection_reason VARCHAR(1000),
    CONSTRAINT driver_vehicle_events_vehicle_fk
        FOREIGN KEY (vehicle_id)
        REFERENCES driver_vehicles (id)
        ON DELETE RESTRICT,
    CONSTRAINT driver_vehicle_events_version_positive
        CHECK (verification_version > 0),
    CONSTRAINT driver_vehicle_events_one_decision_per_version
        UNIQUE (vehicle_id, verification_version),
    CONSTRAINT driver_vehicle_events_decision_valid
        CHECK (decision IN ('verified', 'rejected')),
    CONSTRAINT driver_vehicle_events_reviewer_role_admin
        CHECK (reviewer_role = 'admin'),
    CONSTRAINT driver_vehicle_events_reviewer_admin_fk
        FOREIGN KEY (reviewer_admin_id)
        REFERENCES users (id)
        ON DELETE RESTRICT,
    CONSTRAINT driver_vehicle_events_reason_valid
        CHECK (
            (decision = 'rejected'
                AND rejection_reason IS NOT NULL
                AND btrim(rejection_reason) <> '')
            OR
            (decision = 'verified' AND rejection_reason IS NULL)
        )
);

CREATE INDEX driver_vehicle_events_history_idx
    ON driver_vehicle_verification_events
        (vehicle_id, reviewed_at DESC, id DESC);

CREATE INDEX driver_vehicle_events_reviewer_idx
    ON driver_vehicle_verification_events (reviewer_admin_id, reviewed_at DESC);

CREATE TABLE driver_document_verification_events (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    document_id BIGINT NOT NULL,
    decision VARCHAR(16) NOT NULL,
    reviewer_admin_id BIGINT NOT NULL,
    reviewer_role VARCHAR(16) NOT NULL DEFAULT 'admin',
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rejection_reason VARCHAR(1000),
    CONSTRAINT driver_document_events_document_fk
        FOREIGN KEY (document_id)
        REFERENCES driver_documents (id)
        ON DELETE RESTRICT,
    CONSTRAINT driver_document_events_one_decision_per_document
        UNIQUE (document_id),
    CONSTRAINT driver_document_events_decision_valid
        CHECK (decision IN ('verified', 'rejected')),
    CONSTRAINT driver_document_events_reviewer_role_admin
        CHECK (reviewer_role = 'admin'),
    CONSTRAINT driver_document_events_reviewer_admin_fk
        FOREIGN KEY (reviewer_admin_id)
        REFERENCES users (id)
        ON DELETE RESTRICT,
    CONSTRAINT driver_document_events_reason_valid
        CHECK (
            (decision = 'rejected'
                AND rejection_reason IS NOT NULL
                AND btrim(rejection_reason) <> '')
            OR
            (decision = 'verified' AND rejection_reason IS NULL)
        )
);

CREATE INDEX driver_document_events_history_idx
    ON driver_document_verification_events (document_id, reviewed_at DESC, id DESC);

CREATE INDEX driver_document_events_reviewer_idx
    ON driver_document_verification_events (reviewer_admin_id, reviewed_at DESC);

-- A replacement document is a new row. The bytes and upload identity of an
-- existing version cannot be overwritten or deleted; only its review decision
-- fields are mutable.
CREATE FUNCTION prevent_driver_document_upload_mutation() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Driver document versions cannot be deleted';
    END IF;

    IF ROW(
        NEW.id,
        NEW.driver_user_id,
        NEW.document_type,
        NEW.document_version,
        NEW.vehicle_id,
        NEW.vehicle_type,
        NEW.storage_key,
        NEW.original_filename,
        NEW.mime_type,
        NEW.file_size,
        NEW.uploaded_at,
        NEW.uploaded_by
    ) IS DISTINCT FROM ROW(
        OLD.id,
        OLD.driver_user_id,
        OLD.document_type,
        OLD.document_version,
        OLD.vehicle_id,
        OLD.vehicle_type,
        OLD.storage_key,
        OLD.original_filename,
        OLD.mime_type,
        OLD.file_size,
        OLD.uploaded_at,
        OLD.uploaded_by
    ) THEN
        RAISE EXCEPTION 'Driver document upload metadata is immutable';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER driver_documents_upload_immutable
    BEFORE UPDATE OR DELETE ON driver_documents
    FOR EACH ROW EXECUTE FUNCTION prevent_driver_document_upload_mutation();

CREATE FUNCTION prevent_verification_event_mutation() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Verification decision history is append-only';
END;
$$;

CREATE TRIGGER driver_profile_events_append_only
    BEFORE UPDATE OR DELETE ON driver_profile_verification_events
    FOR EACH ROW EXECUTE FUNCTION prevent_verification_event_mutation();

CREATE TRIGGER driver_vehicle_events_append_only
    BEFORE UPDATE OR DELETE ON driver_vehicle_verification_events
    FOR EACH ROW EXECUTE FUNCTION prevent_verification_event_mutation();

CREATE TRIGGER driver_document_events_append_only
    BEFORE UPDATE OR DELETE ON driver_document_verification_events
    FOR EACH ROW EXECUTE FUNCTION prevent_verification_event_mutation();

CREATE FUNCTION audit_driver_order_hold_state() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    source_type VARCHAR(32);
    source_vehicle_id BIGINT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status NOT IN ('draining', 'held') THEN
            RAISE EXCEPTION 'A driver order hold must start as draining or held';
        END IF;

        SELECT document_type, vehicle_id
            INTO source_type, source_vehicle_id
            FROM driver_documents
            WHERE driver_user_id = NEW.driver_user_id
                AND id = NEW.source_document_id;
        IF (NEW.scope_type = 'profile'
                AND (source_type NOT IN ('ktp', 'sim') OR source_vehicle_id IS NOT NULL))
            OR (NEW.scope_type = 'vehicle'
                AND (source_type NOT IN ('stnk', 'vehicle_photo')
                    OR source_vehicle_id IS DISTINCT FROM NEW.vehicle_id)) THEN
            RAISE EXCEPTION 'Order hold scope must match its source document';
        END IF;

        INSERT INTO driver_order_acceptance_hold_events (hold_id, event_type)
            VALUES (NEW.id, 'requested');
        INSERT INTO driver_order_acceptance_hold_events (hold_id, event_type)
            VALUES (NEW.id, NEW.status);
        RETURN NEW;
    END IF;

    IF ROW(
        OLD.driver_user_id,
        OLD.source_document_id,
        OLD.scope_type,
        OLD.vehicle_id,
        OLD.requested_at
    ) IS DISTINCT FROM ROW(
        NEW.driver_user_id,
        NEW.source_document_id,
        NEW.scope_type,
        NEW.vehicle_id,
        NEW.requested_at
    ) THEN
        RAISE EXCEPTION 'Driver order hold identity is immutable';
    END IF;

    IF OLD.status = NEW.status THEN
        IF ROW(OLD.applied_at, OLD.released_at)
            IS DISTINCT FROM ROW(NEW.applied_at, NEW.released_at) THEN
            RAISE EXCEPTION 'Driver order hold timestamps change with state only';
        END IF;
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'draining' AND NEW.status = 'held')
        OR (OLD.status = 'held' AND NEW.status = 'released')
    ) THEN
        RAISE EXCEPTION 'Invalid driver order hold state transition';
    END IF;

    INSERT INTO driver_order_acceptance_hold_events (hold_id, event_type)
        VALUES (NEW.id, NEW.status);
    RETURN NEW;
END;
$$;

CREATE TRIGGER driver_order_holds_audit_state
    AFTER INSERT OR UPDATE ON driver_order_acceptance_holds
    FOR EACH ROW EXECUTE FUNCTION audit_driver_order_hold_state();

CREATE TRIGGER driver_order_holds_no_delete
    BEFORE DELETE ON driver_order_acceptance_holds
    FOR EACH ROW EXECUTE FUNCTION prevent_verification_event_mutation();

CREATE TRIGGER driver_order_hold_events_append_only
    BEFORE UPDATE OR DELETE ON driver_order_acceptance_hold_events
    FOR EACH ROW EXECUTE FUNCTION prevent_verification_event_mutation();

-- reviewer_role is an audit snapshot. Validate current admin membership when
-- a reviewer is first recorded, but do not FK history to user_roles: removing
-- a role later must not erase or block the audit record.
CREATE FUNCTION require_admin_reviewer_at_decision() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    valid_admin_id BIGINT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.reviewer_admin_id IS NOT DISTINCT FROM OLD.reviewer_admin_id
            AND NEW.reviewer_role IS NOT DISTINCT FROM OLD.reviewer_role THEN
            RETURN NEW;
        END IF;
    END IF;

    IF NEW.reviewer_admin_id IS NOT NULL THEN
        SELECT user_id INTO valid_admin_id
            FROM user_roles
            WHERE user_id = NEW.reviewer_admin_id
                AND role = 'admin'
            FOR KEY SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Reviewer must have the admin role when the decision is recorded';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER driver_profiles_reviewer_admin_at_decision
    BEFORE INSERT OR UPDATE ON driver_profiles
    FOR EACH ROW EXECUTE FUNCTION require_admin_reviewer_at_decision();

CREATE TRIGGER driver_vehicles_reviewer_admin_at_decision
    BEFORE INSERT OR UPDATE ON driver_vehicles
    FOR EACH ROW EXECUTE FUNCTION require_admin_reviewer_at_decision();

CREATE TRIGGER driver_documents_reviewer_admin_at_decision
    BEFORE INSERT OR UPDATE ON driver_documents
    FOR EACH ROW EXECUTE FUNCTION require_admin_reviewer_at_decision();

CREATE TRIGGER driver_profile_events_reviewer_admin_at_decision
    BEFORE INSERT ON driver_profile_verification_events
    FOR EACH ROW EXECUTE FUNCTION require_admin_reviewer_at_decision();

CREATE TRIGGER driver_vehicle_events_reviewer_admin_at_decision
    BEFORE INSERT ON driver_vehicle_verification_events
    FOR EACH ROW EXECUTE FUNCTION require_admin_reviewer_at_decision();

CREATE TRIGGER driver_document_events_reviewer_admin_at_decision
    BEFORE INSERT ON driver_document_verification_events
    FOR EACH ROW EXECUTE FUNCTION require_admin_reviewer_at_decision();

-- Serialize a driver's document uploads, allocate the next version, and use
-- the driver-profile row as the shared lock for upload/order-acceptance paths.
CREATE FUNCTION lock_and_validate_driver_document_version() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    expected_version INTEGER;
BEGIN
    PERFORM 1
        FROM driver_profiles
        WHERE user_id = NEW.driver_user_id
        FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver profile does not exist';
    END IF;

    IF NEW.vehicle_id IS NOT NULL THEN
        PERFORM 1
            FROM driver_vehicles
            WHERE driver_user_id = NEW.driver_user_id
                AND id = NEW.vehicle_id
            FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Driver vehicle does not exist';
        END IF;
    END IF;

    SELECT COALESCE(MAX(document_version), 0) + 1
        INTO expected_version
        FROM driver_documents
        WHERE driver_user_id = NEW.driver_user_id
            AND document_type = NEW.document_type
            AND vehicle_id IS NOT DISTINCT FROM NEW.vehicle_id;

    NEW.document_version := expected_version;

    RETURN NEW;
END;
$$;

CREATE TRIGGER driver_documents_version_guard
    BEFORE INSERT ON driver_documents
    FOR EACH ROW EXECUTE FUNCTION lock_and_validate_driver_document_version();

-- A verified document replacement immediately invalidates only its own
-- profile/vehicle verification and creates an order hold in this transaction.
CREATE FUNCTION start_document_reverification() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    previous_status VARCHAR(16);
    current_scope_status VARCHAR(16);
    current_version INTEGER;
    hold_status VARCHAR(16);
BEGIN
    IF NEW.document_version = 1 THEN
        RETURN NEW;
    END IF;

    SELECT verification_status
        INTO previous_status
        FROM driver_documents
        WHERE driver_user_id = NEW.driver_user_id
            AND document_type = NEW.document_type
            AND vehicle_id IS NOT DISTINCT FROM NEW.vehicle_id
            AND document_version = NEW.document_version - 1;

    IF previous_status IS DISTINCT FROM 'verified' THEN
        RETURN NEW;
    END IF;

    IF NEW.document_type IN ('ktp', 'sim') THEN
        UPDATE driver_profiles
            SET verification_status = 'pending',
                is_online = FALSE,
                submission_version = submission_version
                    + CASE WHEN verification_status = 'pending' THEN 0 ELSE 1 END,
                reviewer_admin_id = NULL,
                reviewed_at = NULL,
                rejection_reason = NULL,
                review_metadata_legacy = FALSE
            WHERE user_id = NEW.driver_user_id
            RETURNING verification_status INTO current_scope_status;
    ELSE
        UPDATE driver_vehicles
            SET verification_status = 'pending',
                is_active = FALSE,
                verification_version = verification_version
                    + CASE WHEN verification_status = 'pending' THEN 0 ELSE 1 END,
                reviewer_admin_id = NULL,
                reviewed_at = NULL,
                rejection_reason = NULL,
                review_metadata_legacy = FALSE
            WHERE driver_user_id = NEW.driver_user_id
                AND id = NEW.vehicle_id
            RETURNING verification_status INTO current_scope_status;
        UPDATE driver_profiles
            SET is_online = FALSE
            WHERE user_id = NEW.driver_user_id;
    END IF;

    IF current_scope_status IS NULL THEN
        RAISE EXCEPTION 'Document verification scope does not exist';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM trips
        WHERE driver_user_id = NEW.driver_user_id
            AND status IN ('accepted', 'picking_up', 'in_progress')
    ) THEN
        hold_status := 'draining';
    ELSE
        hold_status := 'held';
    END IF;

    INSERT INTO driver_order_acceptance_holds (
        driver_user_id,
        source_document_id,
        scope_type,
        vehicle_id,
        status,
        applied_at
    ) VALUES (
        NEW.driver_user_id,
        NEW.id,
        CASE WHEN NEW.document_type IN ('ktp', 'sim') THEN 'profile' ELSE 'vehicle' END,
        NEW.vehicle_id,
        hold_status,
        CASE WHEN hold_status = 'held' THEN statement_timestamp() ELSE NULL END
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER driver_documents_start_reverification
    AFTER INSERT ON driver_documents
    FOR EACH ROW EXECUTE FUNCTION start_document_reverification();

-- Enforce that a hold starts in the state matching the active-trip set, cannot
-- bypass draining, and cannot be released before its current scope is approved.
CREATE FUNCTION guard_driver_order_hold_transition() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    source_type VARCHAR(32);
    source_vehicle_id BIGINT;
    source_status VARCHAR(16);
    source_version INTEGER;
    verified_document_count INTEGER;
    scope_approved BOOLEAN;
BEGIN
    PERFORM 1
        FROM driver_profiles
        WHERE user_id = NEW.driver_user_id
        FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver profile does not exist';
    END IF;

    IF TG_OP = 'INSERT' THEN
        SELECT document_type, vehicle_id, verification_status, document_version
            INTO source_type, source_vehicle_id, source_status, source_version
            FROM driver_documents
            WHERE driver_user_id = NEW.driver_user_id
                AND id = NEW.source_document_id;
        IF NOT FOUND
            OR source_status <> 'pending'
            OR NOT EXISTS (
                SELECT 1
                FROM driver_documents previous
                WHERE previous.driver_user_id = NEW.driver_user_id
                    AND previous.document_type = source_type
                    AND previous.vehicle_id IS NOT DISTINCT FROM source_vehicle_id
                    AND previous.document_version = source_version - 1
                    AND previous.verification_status = 'verified'
            )
            OR (NEW.scope_type = 'profile'
                AND (source_type NOT IN ('ktp', 'sim') OR source_vehicle_id IS NOT NULL))
            OR (NEW.scope_type = 'vehicle'
                AND (source_type NOT IN ('stnk', 'vehicle_photo')
                    OR source_vehicle_id IS DISTINCT FROM NEW.vehicle_id)) THEN
            RAISE EXCEPTION 'Order hold scope must match its source document';
        END IF;

        IF EXISTS (
            SELECT 1 FROM trips
            WHERE driver_user_id = NEW.driver_user_id
                AND status IN ('accepted', 'picking_up', 'in_progress')
        ) THEN
            NEW.status := 'draining';
            NEW.applied_at := NULL;
        ELSE
            NEW.status := 'held';
            NEW.applied_at := statement_timestamp();
        END IF;
        NEW.released_at := NULL;
        RETURN NEW;
    END IF;

    IF ROW(
        OLD.driver_user_id,
        OLD.source_document_id,
        OLD.scope_type,
        OLD.vehicle_id,
        OLD.requested_at
    ) IS DISTINCT FROM ROW(
        NEW.driver_user_id,
        NEW.source_document_id,
        NEW.scope_type,
        NEW.vehicle_id,
        NEW.requested_at
    ) THEN
        RAISE EXCEPTION 'Driver order hold identity is immutable';
    END IF;

    IF OLD.status = NEW.status THEN
        IF ROW(OLD.applied_at, OLD.released_at)
            IS DISTINCT FROM ROW(NEW.applied_at, NEW.released_at) THEN
            RAISE EXCEPTION 'Driver order hold timestamps change with state only';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'draining' AND NEW.status = 'held' THEN
        IF EXISTS (
            SELECT 1 FROM trips
            WHERE driver_user_id = NEW.driver_user_id
                AND status IN ('accepted', 'picking_up', 'in_progress')
        ) THEN
            RAISE EXCEPTION 'Cannot apply the hold while an active trip remains';
        END IF;
        NEW.applied_at := statement_timestamp();
        NEW.released_at := NULL;
        RETURN NEW;
    END IF;

    IF OLD.status = 'held' AND NEW.status = 'released' THEN
        IF NEW.scope_type = 'profile' THEN
            SELECT (
                p.verification_status = 'approved'
                AND EXISTS (
                    SELECT 1 FROM driver_profile_verification_events e
                    WHERE e.driver_user_id = p.user_id
                        AND e.submission_version = p.submission_version
                        AND e.decision = 'approved'
                )
            ) INTO scope_approved
            FROM driver_profiles p
            WHERE p.user_id = NEW.driver_user_id;

            SELECT COUNT(*) INTO verified_document_count
            FROM driver_documents d
            WHERE d.driver_user_id = NEW.driver_user_id
                AND d.document_type IN ('ktp', 'sim')
                AND d.vehicle_id IS NULL
                AND d.document_version = (
                    SELECT MAX(latest.document_version)
                    FROM driver_documents latest
                    WHERE latest.driver_user_id = d.driver_user_id
                        AND latest.document_type = d.document_type
                        AND latest.vehicle_id IS NULL
                )
                AND d.verification_status = 'verified'
                AND EXISTS (
                    SELECT 1 FROM driver_document_verification_events e
                    WHERE e.document_id = d.id AND e.decision = 'verified'
                );
        ELSE
            SELECT (
                v.verification_status = 'verified'
                AND EXISTS (
                    SELECT 1 FROM driver_vehicle_verification_events e
                    WHERE e.vehicle_id = v.id
                        AND e.verification_version = v.verification_version
                        AND e.decision = 'verified'
                )
            ) INTO scope_approved
            FROM driver_vehicles v
            WHERE v.driver_user_id = NEW.driver_user_id
                AND v.id = NEW.vehicle_id;

            SELECT COUNT(*) INTO verified_document_count
            FROM driver_documents d
            WHERE d.driver_user_id = NEW.driver_user_id
                AND d.vehicle_id = NEW.vehicle_id
                AND d.document_type IN ('stnk', 'vehicle_photo')
                AND d.document_version = (
                    SELECT MAX(latest.document_version)
                    FROM driver_documents latest
                    WHERE latest.vehicle_id = d.vehicle_id
                        AND latest.document_type = d.document_type
                )
                AND d.verification_status = 'verified'
                AND EXISTS (
                    SELECT 1 FROM driver_document_verification_events e
                    WHERE e.document_id = d.id AND e.decision = 'verified'
                );
        END IF;

        IF COALESCE(scope_approved, FALSE) IS NOT TRUE
            OR verified_document_count <> 2 THEN
            RAISE EXCEPTION 'Cannot release order hold before scope and required documents are approved';
        END IF;

        NEW.applied_at := OLD.applied_at;
        NEW.released_at := statement_timestamp();
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid driver order hold state transition';
END;
$$;

CREATE TRIGGER driver_order_holds_transition_guard
    BEFORE INSERT OR UPDATE ON driver_order_acceptance_holds
    FOR EACH ROW EXECUTE FUNCTION guard_driver_order_hold_transition();

-- Last-active-trip completion advances every draining hold atomically. The
-- driver profile lock serializes concurrent trip completions for that driver.
CREATE FUNCTION finish_driver_order_hold_drain() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status IN ('accepted', 'picking_up', 'in_progress')
        AND NEW.status IN ('completed', 'cancelled') THEN
        PERFORM 1
            FROM driver_profiles
            WHERE user_id = NEW.driver_user_id
            FOR UPDATE;

        IF NOT EXISTS (
            SELECT 1 FROM trips
            WHERE driver_user_id = NEW.driver_user_id
                AND status IN ('accepted', 'picking_up', 'in_progress')
        ) THEN
            UPDATE driver_order_acceptance_holds
                SET status = 'held',
                    applied_at = statement_timestamp()
                WHERE driver_user_id = NEW.driver_user_id
                    AND status = 'draining';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trips_finish_driver_order_hold_drain
    AFTER UPDATE OF status ON trips
    FOR EACH ROW EXECUTE FUNCTION finish_driver_order_hold_drain();

CREATE FUNCTION guard_driver_reverification_version() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    old_state VARCHAR(16);
    new_state VARCHAR(16);
    old_version INTEGER;
    new_version INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'driver_profiles' THEN
        old_state := OLD.verification_status;
        new_state := NEW.verification_status;
        old_version := OLD.submission_version;
        new_version := NEW.submission_version;
    ELSE
        old_state := OLD.verification_status;
        new_state := NEW.verification_status;
        old_version := OLD.verification_version;
        new_version := NEW.verification_version;
    END IF;

    IF new_state = 'pending'
        AND old_state IN ('approved', 'rejected', 'verified')
        AND new_version = old_version + 1 THEN
        RETURN NEW;
    END IF;

    IF new_version <> old_version THEN
        RAISE EXCEPTION 'Reverification version may only increment once on return to pending';
    END IF;

    IF old_state IN ('approved', 'rejected', 'verified')
        AND new_state = 'pending' THEN
        RAISE EXCEPTION 'Resubmission must increment the current verification version';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER driver_profiles_version_guard
    BEFORE UPDATE OF verification_status, submission_version ON driver_profiles
    FOR EACH ROW EXECUTE FUNCTION guard_driver_reverification_version();

CREATE TRIGGER driver_vehicles_version_guard
    BEFORE UPDATE OF verification_status, verification_version ON driver_vehicles
    FOR EACH ROW EXECUTE FUNCTION guard_driver_reverification_version();

CREATE FUNCTION require_current_verification_event() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    expected_decision VARCHAR(16);
    matching_event_count INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'driver_profile_verification_events' THEN
        SELECT COUNT(*) INTO matching_event_count
        FROM driver_profiles p
        WHERE p.user_id = NEW.driver_user_id
            AND p.submission_version = NEW.submission_version
            AND p.verification_status = NEW.decision
            AND NOT p.review_metadata_legacy
            AND p.reviewer_admin_id = NEW.reviewer_admin_id
            AND p.reviewer_role = NEW.reviewer_role
            AND p.reviewed_at = NEW.reviewed_at
            AND p.rejection_reason IS NOT DISTINCT FROM NEW.rejection_reason;
    ELSIF TG_TABLE_NAME = 'driver_vehicle_verification_events' THEN
        SELECT COUNT(*) INTO matching_event_count
        FROM driver_vehicles v
        WHERE v.id = NEW.vehicle_id
            AND v.verification_version = NEW.verification_version
            AND v.verification_status = NEW.decision
            AND NOT v.review_metadata_legacy
            AND v.reviewer_admin_id = NEW.reviewer_admin_id
            AND v.reviewer_role = NEW.reviewer_role
            AND v.reviewed_at = NEW.reviewed_at
            AND v.rejection_reason IS NOT DISTINCT FROM NEW.rejection_reason;
    ELSIF TG_TABLE_NAME = 'driver_document_verification_events' THEN
        SELECT COUNT(*) INTO matching_event_count
        FROM driver_documents d
        WHERE d.id = NEW.document_id
            AND d.verification_status = NEW.decision
            AND d.reviewer_admin_id = NEW.reviewer_admin_id
            AND d.reviewer_role = NEW.reviewer_role
            AND d.reviewed_at = NEW.reviewed_at
            AND d.rejection_reason IS NOT DISTINCT FROM NEW.rejection_reason;
    ELSIF TG_TABLE_NAME = 'driver_profiles' THEN
        IF NEW.review_metadata_legacy
            OR NEW.verification_status = 'pending' THEN
            RETURN NULL;
        END IF;
        expected_decision := NEW.verification_status;

        SELECT COUNT(*) INTO matching_event_count
        FROM driver_profile_verification_events e
        WHERE e.driver_user_id = NEW.user_id
            AND e.submission_version = NEW.submission_version
            AND e.decision = expected_decision
            AND e.reviewer_admin_id = NEW.reviewer_admin_id
            AND e.reviewed_at = NEW.reviewed_at
            AND e.rejection_reason IS NOT DISTINCT FROM NEW.rejection_reason;
    ELSIF TG_TABLE_NAME = 'driver_vehicles' THEN
        IF NEW.review_metadata_legacy
            OR NEW.verification_status = 'pending' THEN
            RETURN NULL;
        END IF;
        expected_decision := NEW.verification_status;

        SELECT COUNT(*) INTO matching_event_count
        FROM driver_vehicle_verification_events e
        WHERE e.vehicle_id = NEW.id
            AND e.verification_version = NEW.verification_version
            AND e.decision = expected_decision
            AND e.reviewer_admin_id = NEW.reviewer_admin_id
            AND e.reviewed_at = NEW.reviewed_at
            AND e.rejection_reason IS NOT DISTINCT FROM NEW.rejection_reason;
    ELSE
        IF NEW.verification_status = 'pending' THEN
            RETURN NULL;
        END IF;
        expected_decision := NEW.verification_status;

        SELECT COUNT(*) INTO matching_event_count
        FROM driver_document_verification_events e
        WHERE e.document_id = NEW.id
            AND e.decision = expected_decision
            AND e.reviewer_admin_id = NEW.reviewer_admin_id
            AND e.reviewed_at = NEW.reviewed_at
            AND e.rejection_reason IS NOT DISTINCT FROM NEW.rejection_reason;
    END IF;

    IF matching_event_count <> 1 THEN
        RAISE EXCEPTION 'Current verification decision must have a matching audit event';
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER driver_profiles_decision_event_required
    AFTER INSERT OR UPDATE ON driver_profiles
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION require_current_verification_event();

CREATE CONSTRAINT TRIGGER driver_vehicles_decision_event_required
    AFTER INSERT OR UPDATE ON driver_vehicles
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION require_current_verification_event();

CREATE CONSTRAINT TRIGGER driver_documents_decision_event_required
    AFTER INSERT OR UPDATE ON driver_documents
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION require_current_verification_event();

CREATE CONSTRAINT TRIGGER driver_profile_event_current_state_required
    AFTER INSERT ON driver_profile_verification_events
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION require_current_verification_event();

CREATE CONSTRAINT TRIGGER driver_vehicle_event_current_state_required
    AFTER INSERT ON driver_vehicle_verification_events
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION require_current_verification_event();

CREATE CONSTRAINT TRIGGER driver_document_event_current_state_required
    AFTER INSERT ON driver_document_verification_events
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION require_current_verification_event();

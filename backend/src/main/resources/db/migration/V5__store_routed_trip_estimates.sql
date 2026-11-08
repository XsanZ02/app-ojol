ALTER TABLE trips
    ADD COLUMN route_distance_meters BIGINT,
    ADD COLUMN estimated_duration_seconds INTEGER,
    ADD COLUMN route_geometry TEXT,
    ADD COLUMN routing_provider VARCHAR(64),
    ADD COLUMN fare_base_amount NUMERIC(12, 2),
    ADD COLUMN fare_per_kilometer NUMERIC(12, 2),
    ADD COLUMN fare_minimum_amount NUMERIC(12, 2),
    ADD COLUMN fare_config_version VARCHAR(32);

ALTER TABLE trips
    ADD CONSTRAINT trips_route_distance_positive
        CHECK (route_distance_meters IS NULL OR route_distance_meters > 0),
    ADD CONSTRAINT trips_duration_positive
        CHECK (estimated_duration_seconds IS NULL OR estimated_duration_seconds > 0),
    ADD CONSTRAINT trips_fare_snapshot_nonnegative
        CHECK (
            (fare_base_amount IS NULL OR fare_base_amount >= 0)
            AND (fare_per_kilometer IS NULL OR fare_per_kilometer >= 0)
            AND (fare_minimum_amount IS NULL OR fare_minimum_amount >= 0)
        );

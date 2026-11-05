ALTER TABLE user_roles
    DROP CONSTRAINT user_roles_role_valid;

ALTER TABLE user_roles
    ADD CONSTRAINT user_roles_role_valid
    CHECK (role IN ('customer', 'driver', 'admin'));

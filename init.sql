CREATE EXTENSION IF NOT EXISTS citext;

-- main users table
CREATE TABLE IF NOT EXISTS users (
    username citext PRIMARY KEY,
    password text NOT NULL,
    ips inet[],
    disabled boolean
);

-- how to update ips
-- UPDATE users SET ips = ARRAY(SELECT DISTINCT unnest FROM unnest(array_append(ips, '2a07:1c44:3980::1'::inet))) WHERE username = 'iczero';

-- pending account creation
CREATE TABLE IF NOT EXISTS pending_registrations (
    username citext PRIMARY KEY,
    password text NOT NULL,
    ips inet[],

    succeeded boolean, -- update to true for application to promote to user
    expires timestamp
);

-- notify application when a registration is updated to successful
CREATE OR REPLACE FUNCTION notify_registration_success()
    RETURNS trigger AS $notify_registration_success$
    BEGIN
        IF NEW.succeeded = TRUE THEN
            PERFORM pg_notify('registration_succeeded', '"' || NEW.username || '"');
        END IF;
        RETURN NEW;
    END;
$notify_registration_success$ LANGUAGE plpgsql;

CREATE TRIGGER registration_success_trigger
    AFTER INSERT OR UPDATE OF succeeded ON pending_registrations
    FOR EACH ROW EXECUTE PROCEDURE notify_registration_success();

-- external services
CREATE TABLE IF NOT EXISTS external_services (
    username citext NOT NULL,
    service text NOT NULL, -- service name (for example, 'discord')
    identifier text NOT NULL, -- the user's account on that service
    required boolean, -- whether or not this service is required for registration
    verify_token text -- token used to verify the external account
);
CREATE INDEX IF NOT EXISTS external_services_user_index ON external_services (username);

-- user sessions
CREATE TABLE IF NOT EXISTS sessions (
    username citext NOT NULL,
    token text PRIMARY KEY,
    expires timestamp NOT NULL,
    uuid text -- store this so user can identify which devices are logged in
);
CREATE INDEX IF NOT EXISTS sessions_user_index ON sessions (username);

-- connection tokens
CREATE TABLE IF NOT EXISTS connecting (
    username citext NOT NULL,
    token text PRIMARY KEY,
    serverhash bytea NOT NULL,
    ip inet NOT NULL,
    expires timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS connecting_user_index ON connecting (username);

CREATE TABLE IF NOT EXISTS admin_users (
    id                      SERIAL PRIMARY KEY,
    username                TEXT UNIQUE NOT NULL,
    passhash                TEXT NOT NULL,
    admin_session_token     TEXT,
    name                    TEXT,
    email                   TEXT,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login              TIMESTAMP WITH TIME ZONE,
    is_superAdmin           BOOLEAN DEFAULT FALSE --for highest-level admin
);
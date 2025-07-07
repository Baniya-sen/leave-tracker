CREATE TABLE IF NOT EXISTS admin_users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    passhash      TEXT NOT NULL,
    admin_session_token TEXT,
    name          TEXT,
    email         TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login    DATETIME,
    is_superadmin INTEGER DEFAULT 0 -- 1 for highest-level admin
);

CREATE TABLE IF NOT EXISTS admin_config (
    key   TEXT PRIMARY KEY,
    value TEXT
);

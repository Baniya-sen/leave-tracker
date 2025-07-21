CREATE TABLE IF NOT EXISTS users (
  id                       SERIAL PRIMARY KEY,
  username                 TEXT    UNIQUE,
  passhash                 TEXT,
  session_token            TEXT,
  name                     TEXT,
  age                      INTEGER,
  date                     DATE,
  email                    TEXT    UNIQUE NOT NULL,
  google_id                TEXT    UNIQUE,
  picture_url              TEXT,
  firm_name                TEXT,
  firm_join_date           DATE,
  account_created          TIMESTAMP WITH TIME ZONE,
  account_updated          TIMESTAMP WITH TIME ZONE,
  account_verified         INTEGER DEFAULT 0,
  firm_weekend_days        TEXT,
  leaves_type              JSONB    DEFAULT '{}'::jsonb
);
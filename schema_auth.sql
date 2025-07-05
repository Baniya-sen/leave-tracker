CREATE TABLE IF NOT EXISTS users (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  username                 TEXT    UNIQUE NOT NULL,
  passhash                 TEXT    NOT NULL,
  session_token            TEXT,
  name                     TEXT,
  age                      INTEGER,
  date                     DATE,
  email                    TEXT,
  firm_name                TEXT,
  firm_join_date           DATE,
  account_created          DATETIME,
  account_verified         INTEGER DEFAULT 0,
  firm_weekend_days        TEXT,
  leaves_type              TEXT DEFAULT '{}'
);
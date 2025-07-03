CREATE TABLE IF NOT EXISTS users (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  username                 TEXT    UNIQUE NOT NULL,
  passhash                 TEXT    NOT NULL,
  name                     TEXT,
  age                      INTEGER,
  date                     DATE,       -- optional generic date field
  email                    TEXT,       -- optional email address
  firm_name                TEXT,       -- optional company name
  firm_join_date           DATE,       -- optional company join date
  account_created          DATETIME,  -- optional timestamp of account creation
  account_verified         INTEGER DEFAULT 0,    -- optional boolean flag (0 = false, 1 = true)
  firm_weekend_days        TEXT,        -- optional JSON array storing weekend days, e.g. '[6,7]'
  leaves_type              TEXT DEFAULT '{}'     --JSON blob
);
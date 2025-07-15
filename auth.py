import json
from datetime import datetime, timezone

import sqlite3
from flask import g, current_app, session
from werkzeug.security import generate_password_hash


def get_auth_db():
    if 'auth_db' not in g:
        g.auth_db = sqlite3.connect(
            current_app.config['AUTH_DB'],
            detect_types=sqlite3.PARSE_DECLTYPES
        )
        g.auth_db.row_factory = sqlite3.Row
    return g.auth_db


def close_auth_db(e=None):
    db = g.pop('auth_db', None)
    if db:
        db.close()


def init_auth_db():
    db = get_auth_db()
    with current_app.open_resource('schema_auth.sql') as f:
        db.executescript(f.read().decode())


def register_user(email: str, password: str) -> bool:
    pw_hash = generate_password_hash(password)
    signup_iso = datetime.now(timezone.utc).isoformat()
    db = get_auth_db()
    try:
        db.execute(
            '''
            INSERT INTO users (email, passhash, account_created)
            VALUES (?, ?, ?)
            ''',
            (email, pw_hash, signup_iso)
        )
        db.commit()
        return True
    except sqlite3.IntegrityError:
        return False


def authenticate_user(identifier: str, password: str):
    db = get_auth_db()
    user = db.execute(
        '''
        SELECT *
          FROM users
         WHERE email    = ?
            OR username = ?
        ''',
        (identifier, identifier),
    ).fetchone()
    return user or None


def get_user_info_with_id(user_id: int):
    try:
        db = get_auth_db()
        user = db.execute(
            'SELECT * FROM users WHERE id = ?', (user_id,)
        ).fetchone()
        if user and user['id'] == session['user_id']:
            return user
        return None
    except sqlite3.IntegrityError:
        return None


def get_user_info_with_email(email: str):
    db = get_auth_db()
    user = db.execute(
        'SELECT * FROM users WHERE email = ?', (email,)
    ).fetchone()
    if user and user['email'] == email:
        return user
    return None


def get_user_field(user_id: int, column_name: str):
    allowed = {
        "id",
        "username",
        "session_token",
        "name",
        "age",
        "date",
        "email",
        "firm_name",
        "firm_join_date",
        "account_created",
        "account_verified",
        "firm_weekend_days",
        "leaves_type",
    }
    if column_name not in allowed:
        raise ValueError(f"Invalid column name: {column_name!r}")

    db = get_auth_db()
    sql = f"SELECT {column_name} FROM users WHERE id = ?"
    row = db.execute(sql, (user_id,)).fetchone()

    if row is None:
        return None

    return row[column_name]


def update_user_info(user_id: int, data: dict) -> bool:
    db = get_auth_db()
    allowed_fields = [
        'name', 'age', 'session_token', 'email', 'date',
        'firm_name', 'firm_join_date', 'firm_weekend_days',
        'leaves_type', 'account_verified'
    ]

    existing_leaves = {}
    if "leaves_type" in data:
        existing = db.execute(
            "SELECT leaves_type FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if existing and existing["leaves_type"]:
            try:
                existing_leaves = json.loads(existing["leaves_type"])
            except Exception as e:
                print(e)
                existing_leaves = {}

    fields = []
    values = []
    for field in allowed_fields:
        if field in data:
            fields.append(f"{field} = ?")
            if field == "leaves_type":
                new_leaves = data[field]
                merged = existing_leaves.copy()
                merged.update(new_leaves)
                values.append(json.dumps(merged))
            else:
                values.append(data[field])

    if not fields:
        return False

    values.append(user_id)
    query = f"UPDATE users SET {', '.join(fields)} WHERE id = ?"

    try:
        cur = db.execute(query, values)
        db.commit()
        return cur.rowcount > 0
    except sqlite3.Error:
        print("User not updated to sql!", session['user_id'])
        return False

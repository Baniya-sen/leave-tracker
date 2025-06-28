from datetime import datetime, timezone

import sqlite3
from flask import g, current_app, session
from werkzeug.security import generate_password_hash, check_password_hash


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


def register_user(username: str, password: str) -> bool:
    pw_hash = generate_password_hash(password)
    signup_iso = datetime.now(timezone.utc).isoformat()
    db = get_auth_db()
    try:
        db.execute(
            '''
            INSERT INTO users (username, passhash, account_created)
            VALUES (?, ?, ?)
            ''',
            (username, pw_hash, signup_iso)
        )
        db.commit()
        return True
    except sqlite3.IntegrityError:
        return False


def authenticate_user(username: str, password: str):
    db = get_auth_db()
    user = db.execute(
        'SELECT * FROM users WHERE username = ?', (username,)
    ).fetchone()
    if user and check_password_hash(user['passhash'], password):
        return user
    return None


def get_user_info_with_id(user_id: int):
    db = get_auth_db()
    user = db.execute(
        'SELECT * FROM users WHERE id = ?', (user_id,)
    ).fetchone()
    if user and user['id'] == session['user_id']:
        return user
    return None


def get_user_info_with_username(username: str):
    db = get_auth_db()
    user = db.execute(
        'SELECT * FROM users WHERE username = ?', (username,)
    ).fetchone()
    if user and user['username'] == username:
        return user
    return None


def update_user_info(user_id: int, data: dict) -> bool:
    db = get_auth_db()
    allowed_fields = [
        'name', 'age', 'email', 'date',
        'firm_name', 'firm_join_date', 'firm_weekend_days'
    ]

    fields = []
    values = []
    for field in allowed_fields:
        if field in data:
            fields.append(f"{field} = ?")
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

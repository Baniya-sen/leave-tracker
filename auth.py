from datetime import datetime, timezone

import psycopg2
from psycopg2.extras import RealDictCursor

from flask import g, current_app, session
from werkzeug.security import generate_password_hash


def get_auth_db():
    if 'auth_db' not in g:
        g.auth_db = psycopg2.connect(
            dsn=current_app.config['DATABASE_URL'],
            cursor_factory=RealDictCursor,
            sslmode='require'
        )
    return g.auth_db


def close_auth_db(e=None):
    db = g.pop('auth_db', None)
    if db:
        db.close()


def init_auth_db():
    db = get_auth_db()
    with current_app.open_resource("schema_auth.sql") as f:
        with db.cursor() as cur:
            cur.execute(f.read().decode())
        db.commit()


def register_user(email: str, password=None) -> int | None:
    pw_hash = generate_password_hash(password) if password else None
    signup_iso = datetime.now(timezone.utc).isoformat()

    try:
        db = get_auth_db()
        cursor = db.cursor()
        cursor.execute(
            '''
            INSERT INTO users (email, passhash, account_created)
            VALUES (%s, %s, %s)
            ''',
            (email, pw_hash, signup_iso)
        )
        db.commit()
        return cursor.lastrowid

    except psycopg2.IntegrityError:
        print("User not Registered! Email exists.")
        current_app.logger.info("User not Registered! Email exists.")
        return None
    except Exception as e:
        print(f"An unexpected error occurred during user registration: {e}")
        current_app.logger.error(f"An unexpected error occurred during user registration: {e}")
        return None


def authenticate_user(identifier: str):
    db = get_auth_db()
    with db.cursor() as cursor:
        cursor.execute(
            '''
            SELECT *
              FROM users
             WHERE email = %s
                OR username = %s
            ''',
            (identifier, identifier),
        )
        user = cursor.fetchone()
    return user or None


def get_last_user_id():
    try:
        conn = get_auth_db()
        cursor = conn.cursor()
        cursor.execute("SELECT MAX(id) FROM users")
        result = cursor.fetchone()

        if result:
            row = dict(result) if not isinstance(result, dict) else result
            max_id = row.get('max')
            if max_id is not None:
                return max_id
        else:
            return None

    except psycopg2.Error as e:
        return None
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        current_app.logger.error(f"An unexpected error occurred: {e}")
        return None


def get_user_info_with_id(user_id: int):
    try:
        db = get_auth_db()
        with db.cursor() as cursor:
            cursor.execute(
                'SELECT * FROM users WHERE id = %s', (user_id,)
            )
            user = dict(row) if (row := cursor.fetchone()) else None
            if user and user['id'] == session.get('user_id', user_id):
                return user
            return None
    except psycopg2 .IntegrityError:
        return None


def get_user_info_with_email(email: str):
    db = get_auth_db()
    with db.cursor() as cursor:
        cursor.execute('SELECT * FROM users WHERE email = %s', (email,))
        user = dict(row) if (row := cursor.fetchone()) else None
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
        "picture_url",
        "google_id",
        "firm_name",
        "firm_join_date",
        "account_created",
        "account_updated",
        "account_verified",
        "firm_weekend_days",
        "leaves_type",
    }
    if column_name not in allowed:
        raise ValueError(f"Invalid column name: {column_name!r}")

    db = get_auth_db()
    sql = f"SELECT {column_name} FROM users WHERE id = %s"
    with db.cursor() as cursor:
        cursor.execute(sql, (user_id,))
        row = dict(row) if (row := cursor.fetchone()) else None
        if row is None:
            return None
        return row[column_name]


def update_user_info(user_id: int, data: dict) -> bool:
    db = get_auth_db()
    allowed_fields = [
        'name', 'age', 'session_token', 'email', 'date', "picture_url", "account_updated",
        'google_id', 'firm_name', 'firm_join_date', 'firm_weekend_days',
        'leaves_type', 'account_verified'
    ]

    existing_leaves = {}
    if "leaves_type" in data:
        with db.cursor() as cursor:
            cursor.execute(
                "SELECT leaves_type FROM users WHERE id = %s", (user_id,)
            )
            existing = dict(row) if (row := cursor.fetchone()) else None
            if existing and existing["leaves_type"]:
                try:
                    existing_leaves = existing["leaves_type"]
                except Exception as e:
                    print("Not-Imp error", e)
                    current_app.logger.error("Not-Imp error", e)
                    existing_leaves = {}

    fields = []
    values = []
    for field in allowed_fields:
        if field in data:
            fields.append(f"{field} = %s")
            if field == "leaves_type":
                new_leaves = data[field]
                merged = existing_leaves.copy()
                merged.update(new_leaves)
                values.append(merged)
            else:
                values.append(data[field])

    if not fields:
        return False

    values.append(user_id)
    query = f"UPDATE users SET {', '.join(fields)} WHERE id = %s"

    try:
        with db.cursor() as cursor:
            cursor.execute(query, values)
            db.commit()
            return cursor.rowcount > 0
    except psycopg2.Error:
        print("User not updated to sql!", session['user_id'])
        current_app.logger.error("User not updated to sql!", session['user_id'])
        return False

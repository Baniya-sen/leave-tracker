import os
import hashlib
import json
import sqlite3
import tempfile
import zipfile
from dotenv import load_dotenv
from time import time
from functools import wraps
from datetime import datetime
from flask import g, current_app, send_file, request, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash

from leaves import get_mongo_client


if os.environ.get("FLASK_ENV") != "production":
    load_dotenv()


def hash_to_admin(period_seconds: int = 10*60, when: float = None) -> str:
    h1 = os.getenv('H1')
    h2 = os.getenv('H2')
    h3 = os.getenv('H3')
    ts = when if when is not None else time()
    bucket = int(ts // period_seconds)
    data = h1 + h2 + h3 + str(bucket)
    return hashlib.sha256(data.encode('utf-8')).hexdigest()


def admin_login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if 'admin_id' not in session or 'admin_session_token' not in session:
            return redirect(url_for('login'))

        admin_added = get_admin_info_with_id(session['admin_id'])
        if admin_added is None or dict(admin_added).get('admin_session_token') != session['admin_session_token']:
            session.clear()
            return redirect(url_for('login'))

        return f(*args, **kwargs)
    return wrapper


def get_admin_db():
    if 'admin_db' not in g:
        g.admin_db = sqlite3.connect(
            current_app.config['ADMIN_DB'],
            detect_types=sqlite3.PARSE_DECLTYPES
        )
        g.admin_db.row_factory = sqlite3.Row
    return g.admin_db


def close_admin_db(e=None):
    db = g.pop('admin_db', None)
    if db:
        db.close()


def init_admin_db():
    db = get_admin_db()
    with current_app.open_resource('schema_admin.sql') as f:
        db.executescript(f.read().decode())


def register_admin(username: str, password: str) -> bool:
    pw_hash = generate_password_hash(password)
    db = get_admin_db()
    try:
        db.execute(
            '''
            INSERT INTO admin_users (username, passhash)
            VALUES (?, ?)
            ''',
            (username, pw_hash)
        )
        db.commit()
        return True
    except sqlite3.IntegrityError:
        return False


def authenticate_admin(username: str, password: str):
    db = get_admin_db()
    admin_added = db.execute(
        'SELECT * FROM admin_users WHERE username = ?', (username,)
    ).fetchone()
    if admin_added and check_password_hash(admin_added['passhash'], password):
        return admin_added
    return None


def get_admin_info_with_id(admin_id):
    db = get_admin_db()
    cur = db.execute(
        "SELECT * FROM admin_users WHERE id = ?",
        (admin_id,)
    )
    return cur.fetchone()


def get_user_info_with_username(username: str):
    db = get_admin_db()
    admin_added = db.execute(
        'SELECT * FROM admin_users WHERE username = ?', (username,)
    ).fetchone()
    if admin_added and admin_added['username'] == username:
        return admin_added
    return None


def get_admin_field(admin_id: int, column_name: str):
    allowed = {
        "id",
        "username",
        "admin_session_token",
        "name",
        "email",
        "last_login",
        "is_superadmin"
    }
    if column_name not in allowed:
        raise ValueError(f"Invalid column name: {column_name!r}")

    db = get_admin_db()
    sql = f"SELECT {column_name} FROM admin_users WHERE id = ?"
    row = db.execute(sql, (admin_id,)).fetchone()

    if row is None:
        return None

    return row[column_name]


def update_admin_info(user_id: int, data: dict) -> bool:
    db = get_admin_db()
    allowed_fields = [
        'name', 'admin_session_token', 'email',
        'last_login', 'is_superadmin'
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
    query = f"UPDATE admin_users SET {', '.join(fields)} WHERE id = ?"

    try:
        cur = db.execute(query, values)
        db.commit()
        return cur.rowcount > 0
    except sqlite3.Error:
        print("User not updated to sql!", user_id)
        return False


def delete_all_user_data():
    session.clear()

    try:
        # --- SQL cleanup ---
        db_path = current_app.config['AUTH_DB']
        current_app.logger.debug(f"Clearing users table in: {db_path}")
        if not os.path.exists(db_path):
            current_app.logger.error(f"DB file not found: {db_path}")
            return False

        with sqlite3.connect(db_path) as conn:
            conn = sqlite3.connect(db_path)
            conn.execute("PRAGMA foreign_keys = ON;")
            conn.execute("DELETE FROM users;")
            conn.commit()
            conn.close()

            conn = sqlite3.connect(db_path)
            conn.execute("VACUUM;")
            conn.close()

            print(f"All users deleted from {db_path}")
            current_app.logger.info(f"All users deleted from {db_path}")

        # --- MongoDB cleanup ---
        client = get_mongo_client()
        db_name = current_app.config['MONGO_DB']
        coll_name = current_app.config['MONGO_Coll']
        collection = client[db_name][coll_name]
        print(f"Clearing users info from MongoDb collection: {collection}")
        current_app.logger.debug(f"Clearing users info from MongoDb collection: {collection}")

        result = collection.delete_many({})
        print(f"Deleted {result.deleted_count} documents from MongoDB collection: {coll_name}")
        current_app.logger.info(f"Deleted {result.deleted_count} documents from MongoDB collection: {coll_name}")

        return True, f"Successfully deleted all user data. SQL: all users, MongoDB: {result.deleted_count} documents"

    except Exception as e:
        print(f"Error deleting user data: {e}")
        return False, f"Error deleting user data: {str(e)}"


def download_all_data_as_zip():
    try:
        client = get_mongo_client()
        db_name = current_app.config['MONGO_DB']
        coll_name = current_app.config['MONGO_Coll']
        collection = client[db_name][coll_name]
        mongo_docs = list(collection.find({}, {'_id': False}))
        mongo_json = json.dumps(mongo_docs, indent=2)

        db_path = current_app.config['AUTH_DB']
        if not os.path.exists(db_path):
            return False, "SQL user database file not found!"
        admin_db_path = current_app.config['ADMIN_DB']
        if not os.path.exists(admin_db_path):
            return False, "SQL admin database file not found!"

        with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp_zip:
            with zipfile.ZipFile(tmp_zip, 'w') as zipf:
                zipf.write(db_path, arcname=current_app.config['AUTH_DB'])
                zipf.write(admin_db_path, arcname=current_app.config['ADMIN_DB'])
                zipf.writestr(current_app.config['MONGO_FILE'], mongo_json)
            zip_path = tmp_zip.name

        download_name = f"{current_app.config['BACKUP_DATABASE']}_{datetime.now():%Y%m%d_%H%M%S}.zip"
        return send_file(zip_path, as_attachment=True, download_name=download_name,
                         mimetype='application/zip')

    except Exception as e:
        current_app.logger.exception("Error creating ZIP backup")
        return False, f"Error creating ZIP backup: {e}"


def upload_databases():
    if 'file' not in request.files:
        return False, "No SQL file uploaded"
    sql_file = request.files['file']
    if sql_file.filename == '':
        return False, "No SQL file selected"
    if not sql_file.filename.lower().endswith('.db'):
        return False, "Please upload a .db file"

    db_path = current_app.config['AUTH_DB']
    tmp_sql = db_path + f".uploading_{datetime.now():%Y%m%d_%H%M%S}"
    sql_file.save(tmp_sql)

    try:
        conn = sqlite3.connect(tmp_sql)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [r[0] for r in cursor.fetchall()]
        conn.close()
        print(f"Added all data from {tmp_sql}")
        current_app.logger.info(f"Added all data from {tmp_sql}")
        if not tables:
            print(f"no tables in SQL file")
            current_app.logger.info("no tables in SQL file")
            raise sqlite3.Error("no tables in SQL file")
    except Exception as e:
        os.remove(tmp_sql)
        print(f"Invalid SQLite DB: {e}")
        current_app.logger.info(f"Invalid SQLite DB: {e}")
        return False, f"Invalid SQLite DB: {e}"

    session.clear()

    mongo_count = None
    if 'mongo_file' in request.files and request.files['mongo_file'].filename:
        mongo_file = request.files['mongo_file']
        if not mongo_file.filename.lower().endswith(('.json', '.txt')):
            os.remove(tmp_sql)
            return False, "Please upload a JSON file for Mongo data"
        try:
            data = json.load(mongo_file)
            if not isinstance(data, list):
                raise ValueError("Root JSON must be an array of documents")
        except Exception as e:
            os.remove(tmp_sql)
            return False, f"Invalid Mongo JSON file: {e}"

        client = get_mongo_client()
        db_name = current_app.config['MONGO_DB']
        coll_name = current_app.config['MONGO_Coll']
        collection = client[db_name][coll_name]
        collection.drop()
        res = collection.insert_many(data)
        mongo_count = len(res.inserted_ids)

    try:
        os.replace(tmp_sql, db_path)
    except OSError as e:
        os.remove(tmp_sql)
        return False, f"Couldn’t replace SQL DB: {e}"

    msg = f"Replaced SQL DB with tables: {tables}."
    if mongo_count is not None:
        msg += f" Imported {mongo_count} Mongo documents."
        print(f" Imported {mongo_count} Mongo documents.")
        current_app.logger.info(f" Imported {mongo_count} Mongo documents.")

    return True, msg


def delete_unverified_accounts():
    db = get_admin_db()
    cursor = db.cursor()
    cursor.execute("""
            DELETE FROM users
             WHERE account_verified = 0
               AND datetime(account_created) < datetime('now', '-7 days')
        """)
    db.commit()
    deleted = cursor.rowcount
    cursor.close()
    print(f"Deleted {deleted} stale unverified users.")
    current_app.logger.info(f"Deleted {deleted} stale unverified users.")
    return deleted

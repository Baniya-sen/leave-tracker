import base64
import hashlib
import json
import os
import tempfile
import zipfile
from datetime import datetime, timezone
from functools import wraps
from time import time
from concurrent.futures import ThreadPoolExecutor

import psycopg2
import requests
from dotenv import load_dotenv

from psycopg2.extras import RealDictCursor
from firebase_admin import credentials, initialize_app, firestore, _apps

from flask import g, current_app, send_file, request, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash

from auth import get_auth_db
from leaves import get_mongo_client

if os.environ.get("FLASK_ENV") != "production":
    load_dotenv()

EXECUTOR = None

# FireBase Auth
if not _apps:
    b64 = os.getenv("FIREBASE_CREDENTIALS_B64")
    creds_json = base64.b64decode(b64)
    creds_dict = json.loads(creds_json)
    cred = credentials.Certificate(creds_dict)
    initialize_app(cred)

fb_db = firestore.client()


def hash_to_admin(period_seconds: int = 10 * 60, when: float = None) -> str:
    h1 = os.getenv('H1')
    h2 = os.getenv('H2')
    h3 = os.getenv('H3')
    ts = when if when is not None else time()
    bucket = int(ts // period_seconds)
    data = h1 + h2 + h3 + str(bucket)
    return hashlib.sha256(data.encode('utf-8')).hexdigest()


def lookup_geo(ip: str) -> dict:
    try:
        resp = requests.get(f"https://ipwho.is/{ip}", timeout=1)
        data = resp.json()
        if not data.get("success"):
            return {"ip": ip, "error": data.get("message", "Geo lookup failed")}
        for key in ["success", "flag", "About Us"]:
            data.pop(key, None)
        return data
    except Exception as e:
        return {"ip": ip, "error": str(e)}


def make_fingerprint(req_payload: dict) -> str:
    keys = ["path", "method", "query_params", "user_id"]
    imp_params = {k: req_payload[k] for k in keys if k in req_payload}
    s = json.dumps(imp_params, sort_keys=True)
    return hashlib.sha256(s.encode()).hexdigest()


def flatten(d: dict, parent_key: str = '', sep: str = '_') -> dict:
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            if v:
                items.extend(flatten(v, new_key, sep).items())
            else:
                items.append((new_key, {}))
        else:
            if isinstance(v, (str, int, float, bool, type(None))):
                items.append((new_key, v))
            else:
                items.append((new_key, str(v)))
    return dict(items)


def get_executor():
    global EXECUTOR
    if EXECUTOR is None:
        EXECUTOR = ThreadPoolExecutor(max_workers=int(os.getenv("ANALYTICS_POOL_SIZE", 5)))
    return EXECUTOR


def get_req_payload() -> dict:
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "server_time": datetime.now().isoformat(),
        "flask_env": current_app,
        "debug": current_app.debug,
        "remote_ip": request.remote_addr,
        "geo": lookup_geo(request.remote_addr or "0.0.0.0"),
        "method": request.method,
        "path": request.path,
        "url": request.url,
        "base_url": request.base_url,
        "endpoint": request.endpoint,
        "blueprint": request.blueprint,
        "user_agent": request.headers.get("User-Agent"),
        "referrer": request.referrer,
        "headers": dict(request.headers),
        "cookies": dict(request.cookies),
        "query_params": dict(request.args),
        "form_data": request.form.to_dict(),
        "json_body": request.get_json(silent=True),
        "user_id": session.get('user_id'),
        "session_id": request.cookies.get(current_app.config.get("SESSION_COOKIE_NAME", "session")),
    }


def store_event_firebase(doc: dict) -> None:
    try:
        doc_id = f"LeavesTracker-{datetime.now(timezone.utc).isoformat()}"
        fb_db.collection("leave_tracker_analytics_events").document(doc_id).set(doc)
    except Exception as e:
        print("Analytics logging failed: %s", e)
        current_app.logger.error("Analytics logging failed: %s", e)


def log_analytics(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if os.environ.get("FLASK_ENV") == "production":
            payload = flatten(get_req_payload())
            fp = make_fingerprint(payload)
            if session.get('event_fingerprint') != fp:
                session['event_fingerprint'] = fp
                get_executor().submit(store_event_firebase, payload)
        return fn(*args, **kwargs)
    return wrapper


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
        g.admin_db = psycopg2.connect(
            current_app.config['DATABASE_URL'],
            cursor_factory=RealDictCursor
        )
    return g.admin_db


def close_admin_db(e=None):
    db = g.pop('admin_db', None)
    if db:
        db.close()


def init_admin_db():
    db = get_admin_db()
    with current_app.open_resource('schema_admin.sql') as f:
        with db.cursor() as cur:
            cur.execute(f.read().decode())
        db.commit()


def register_admin(username: str, password: str) -> bool:
    pw_hash = generate_password_hash(password)
    db = get_admin_db()
    try:
        with db.cursor() as cursor:
            cursor.execute(
                '''
                INSERT INTO admin_users (username, passhash)
                VALUES (%s, %s)
                ''',
                (username, pw_hash)
            )
            db.commit()
            return True
    except psycopg2.IntegrityError:
        return False


def authenticate_admin(username: str, password: str):
    db = get_admin_db()
    with db.cursor() as cursor:
        cursor.execute(
            'SELECT * FROM admin_users WHERE username = %s', (username,)
        )
        admin_added = dict(row) if (row := cursor.fetchone()) else None
        if admin_added and check_password_hash(admin_added['passhash'], password):
            return admin_added
    return None


def get_admin_info_with_id(admin_id):
    db = get_admin_db()
    with db.cursor() as cursor:
        cursor.execute(
            "SELECT * FROM admin_users WHERE id = %s",
            (admin_id,)
        )
        return cursor.fetchone() or None


def get_user_info_with_username(username: str):
    db = get_admin_db()
    with db.cursor() as cursor:
        cursor.execute(
            'SELECT * FROM admin_users WHERE username = %s', (username,)
        )
        admin_added = dict(row) if (row := cursor.fetchone()) else None
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
        "is_superAdmin"
    }
    if column_name not in allowed:
        raise ValueError(f"Invalid column name: {column_name!r}")

    db = get_admin_db()
    sql = f"SELECT {column_name} FROM admin_users WHERE id = %s"
    with db.cursor() as cursor:
        cursor.execute(sql, (admin_id,))
        row = dict(row) if (row := cursor.fetchone()) else None
        return row[column_name] if row else None


def update_admin_info(user_id: int, data: dict) -> bool:
    db = get_admin_db()
    allowed_fields = [
        'name', 'admin_session_token', 'email',
        'last_login', 'is_superAdmin'
    ]

    fields = []
    values = []
    for field in allowed_fields:
        if field in data:
            fields.append(f"{field} = %s")
            values.append(data[field])

    if not fields:
        return False

    values.append(user_id)
    query = f"UPDATE admin_users SET {', '.join(fields)} WHERE id = %s"

    try:
        with db.cursor() as cursor:
            cursor.execute(query, values)
            db.commit()
            return cursor.rowcount > 0
    except psycopg2.Error:
        print("User not updated to sql!", user_id)
        return False


def delete_all_user_data():
    session.clear()

    try:
        # --- SQL cleanup ---
        conn = get_auth_db()
        try:
            with conn.cursor() as cur:
                print("Opted to delete all users data!")
                current_app.logger.info("Opted to delete all users data!")

                cur.execute("SELECT EXISTS (SELECT 1 FROM users)")
                result_row = cur.fetchone()
                has_rows = result_row['exists']

                if has_rows:
                    cur.execute("""
                        DO
                        $$
                        DECLARE
                          t RECORD;
                        BEGIN
                          IF EXISTS (SELECT 1 FROM users) THEN
                            FOR t IN
                              SELECT table_schema, table_name
                                FROM information_schema.tables
                               WHERE table_type = 'BASE TABLE'
                                 AND table_schema NOT IN ('pg_catalog','information_schema')
                            LOOP
                              EXECUTE format(
                                'TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE;',
                                t.table_schema, t.table_name
                              );
                            END LOOP;
                          END IF;
                        END
                        $$;
                    """)
            conn.commit()

            print("All users deleted and table reset.")
            current_app.logger.info("All users deleted and table reset.")

        except Exception as e:
            print(f"Error clearing users table: {e}")
            current_app.logger.error(f"Error clearing users table: {e}")
            conn.rollback()
            return False, f"Error deleting user SQL data: {str(e)}"

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

        def json_serial(obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            return obj

        conn = get_auth_db()
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users;")
            users_data = [dict(row) for row in cur.fetchall()]
        admin_conn = get_admin_db()
        with admin_conn.cursor() as cur:
            cur.execute("SELECT * FROM admin_users;")
            admin_data = [dict(row) for row in cur.fetchall()]

        users_json = json.dumps(users_data, indent=2, default=json_serial)
        admin_json = json.dumps(admin_data, indent=2, default=json_serial)

        print(users_json)
        print(admin_json)
        print(mongo_json)

        with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp_zip:
            with zipfile.ZipFile(tmp_zip, 'w') as zipf:
                zipf.writestr('users.json', users_json)
                zipf.writestr('admin.json', admin_json)
                zipf.writestr(current_app.config['MONGO_FILE'], mongo_json)
            zip_path = tmp_zip.name

        download_name = f"{current_app.config['BACKUP_DATABASE']}_{datetime.now():%Y%m%d_%H%M%S}.zip"
        print("All Database downloaded by: ", session.get('admin_id'), session.get('admin_username'))
        current_app.logger.exception("All Database downloaded!" + str(session.get('admin_id')) + " " + session.get('admin_username'))
        return send_file(zip_path, as_attachment=True, download_name=download_name,
                         mimetype='application/zip')

    except Exception as e:
        print("Error creating ZIP backup", e)
        current_app.logger.exception("Error creating ZIP backup", e)
        return False, f"Error creating ZIP backup: {e}"


def upload_databases():
    if 'file' not in request.files:
        return False, "No file uploaded"

    uploaded_file = request.files['file']
    if uploaded_file.filename == '':
        return False, "No file selected"
    if not uploaded_file.filename.lower().endswith('.json'):
        return False, "Please upload a .json file"

    # Save uploaded JSON file temporarily
    with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as tmp_json:
        uploaded_file.save(tmp_json.name)
        tmp_path = tmp_json.name

    try:
        with open(tmp_path, 'r', encoding='utf-8') as f:
            users_data = json.load(f)
        if not isinstance(users_data, list):
            return False, "Invalid JSON format: expected a list of users"

        conn = get_auth_db()
        with conn.cursor() as cur:
            cur.execute("TRUNCATE users RESTART IDENTITY CASCADE;")
            for user in users_data:
                columns = ', '.join(user.keys())
                placeholders = ', '.join(['%s'] * len(user))
                values = tuple(user.values())
                cur.execute(f"INSERT INTO users ({columns}) VALUES ({placeholders})", values)

        conn.commit()
        session.clear()
        msg = f"Pushed all users data to Postgres users table."
        print(f"Pushed all users data to Postgres users table.")
        current_app.logger.info(f"Pushed all users data to Postgres users table.")

    except Exception as e:
        print(f"Restore failed: {e}")
        current_app.logger.error(f"Restore failed: {e}")
        return False, f"Restore failed: {e}"

    mongo_count = None
    if 'mongo_file' in request.files and request.files['mongo_file'].filename:
        mongo_file = request.files['mongo_file']
        if not mongo_file.filename.lower().endswith(('.json', '.txt')):
            return False, "Please upload a JSON file for Mongo data"
        try:
            data: list = json.load(mongo_file)
            if not isinstance(data, list):
                raise ValueError("Root JSON must be an array of documents")
            if len(data) == 0:
                msg += f" Mongo JSON was empty, Imported 0 Mongo documents."
                print(f"Mongo JSON was empty, Imported 0 Mongo documents.")
                current_app.logger.info(f"Mongo JSON was empty, Imported 0 Mongo documents.")
                return True, msg
        except Exception as e:
            return False, f"Invalid Mongo JSON file: {e}"

        client = get_mongo_client()
        db_name = current_app.config['MONGO_DB']
        coll_name = current_app.config['MONGO_Coll']
        collection = client[db_name][coll_name]
        collection.drop()
        res = collection.insert_many(data)
        mongo_count = len(res.inserted_ids)

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
                    AND strftime('%s', account_created) 
                       < strftime('%s', 'now', '-7 days');
        """)
    db.commit()
    deleted = cursor.rowcount
    cursor.close()
    print(f"Deleted {deleted} stale unverified users.")
    current_app.logger.info(f"Deleted {deleted} stale unverified users.")
    return deleted

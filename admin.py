import os
from datetime import datetime
from flask import current_app, send_file, request, jsonify
import sqlite3

from leaves import get_mongo_client


def delete_all_user_data():
    try:
        db_path = current_app.config['AUTH_DB']
        if os.path.exists(db_path):
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("DELETE FROM users")
            conn.commit()
            conn.close()
            print(f"All users deleted from SQL database: {db_path}")

        client = get_mongo_client()
        db_name = current_app.config['MONGO_DB']
        collection_name = current_app.config['MONGO_Coll']
        collection = client[db_name][collection_name]

        result = collection.delete_many({})
        print(f"Deleted {result.deleted_count} documents from MongoDB collection: {collection_name}")

        return True, f"Successfully deleted all user data. SQL: all users, MongoDB: {result.deleted_count} documents"

    except Exception as e:
        print(f"Error deleting user data: {e}")
        return False, f"Error deleting user data: {str(e)}"


def download_sql_database():
    try:
        db_path = current_app.config['AUTH_DB']

        if not os.path.exists(db_path):
            return False, "Database file not found"

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"user_auth_backup_{timestamp}.db"

        return send_file(
            db_path,
            as_attachment=True,
            download_name=filename,
            mimetype='application/octet-stream'
        )

    except Exception as e:
        print(f"Error downloading database: {e}")
        return False, f"Error downloading database: {str(e)}"


def upload_sql_database():
    if 'file' not in request.files:
        return False, "No file uploaded"
    file = request.files['file']
    if file.filename == '':
        return False, "No file selected"
    if not file.filename.lower().endswith('.db'):
        return False, "Please upload a .db file"

    db_path = current_app.config['AUTH_DB']
    tmp_path = db_path + f".uploading_{datetime.now():%Y%m%d_%H%M%S}"
    file.save(tmp_path)

    try:
        conn = sqlite3.connect(tmp_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [row[0] for row in cursor.fetchall()]
        conn.close()

        if not tables:
            raise sqlite3.Error("no tables")

    except sqlite3.Error as e:
        os.remove(tmp_path)
        return False, f"Invalid SQLite DB: {e}"

    try:
        os.replace(tmp_path, db_path)
    except OSError as e:
        os.remove(tmp_path)
        return False, f"Could’t replace DB: {e}"

    return True, f"Database replaced successfully. Tables: {tables}"

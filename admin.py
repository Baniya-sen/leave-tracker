import os
import shutil
from datetime import datetime
from flask import current_app, send_file, request, jsonify
from werkzeug.utils import secure_filename
import sqlite3
from pymongo import MongoClient

from leaves import get_mongo_client


def delete_all_user_data():
    """
    Delete all user data from both SQL and MongoDB databases
    """
    try:
        # Delete all data from SQL database
        db_path = current_app.config['AUTH_DB']
        if os.path.exists(db_path):
            # Connect to database and delete all users
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("DELETE FROM users")
            conn.commit()
            conn.close()
            print(f"All users deleted from SQL database: {db_path}")

        # Delete all data from MongoDB
        client = get_mongo_client()
        db_name = current_app.config['MONGO_DB']
        collection_name = current_app.config['MONGO_Coll']
        collection = client[db_name][collection_name]

        # Delete all documents from the collection
        result = collection.delete_many({})
        print(f"Deleted {result.deleted_count} documents from MongoDB collection: {collection_name}")

        return True, f"Successfully deleted all user data. SQL: all users, MongoDB: {result.deleted_count} documents"

    except Exception as e:
        print(f"Error deleting user data: {e}")
        return False, f"Error deleting user data: {str(e)}"


def download_sql_database():
    """
    Download the SQL database file
    """
    try:
        db_path = current_app.config['AUTH_DB']

        if not os.path.exists(db_path):
            return False, "Database file not found"

        # Create a timestamp for the filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"user_auth_backup_{timestamp}.db"

        # Send the file for download
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
    """
    Upload and replace the SQL database file
    """
    try:
        # Check if file was uploaded
        if 'file' not in request.files:
            return False, "No file uploaded"

        file = request.files['file']

        # Check if file was selected
        if file.filename == '':
            return False, "No file selected"

        # Check if file is a database file
        if not file.filename.endswith('.db'):
            return False, "Please upload a .db file"

        # Secure the filename
        filename = secure_filename(file.filename)

        # Get the current database path
        db_path = current_app.config['AUTH_DB']

        # Create backup of existing database if it exists
        if os.path.exists(db_path):
            backup_path = f"{db_path}.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            shutil.copy2(db_path, backup_path)
            print(f"Created backup: {backup_path}")

            return send_file(
                db_path,
                as_attachment=True,
                download_name=backup_path,
                mimetype='application/octet-stream'
            )

        # Save the uploaded file
        file.save(db_path)

        # Verify the database is valid by trying to connect to it
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = cursor.fetchall()
            conn.close()

            if not tables:
                # If no tables found, restore from backup
                if os.path.exists(backup_path):
                    shutil.copy2(backup_path, db_path)
                    os.remove(backup_path)
                return False, "Uploaded file is not a valid database (no tables found)"

            print(f"Successfully uploaded database with tables: {[table[0] for table in tables]}")
            return True, f"Database successfully uploaded and replaced. Tables found: {[table[0] for table in tables]}"

        except sqlite3.Error as e:
            # If database is invalid, restore from backup
            if os.path.exists(backup_path):
                shutil.copy2(backup_path, db_path)
                os.remove(backup_path)
            return False, f"Uploaded file is not a valid SQLite database: {str(e)}"

    except Exception as e:
        print(f"Error uploading database: {e}")
        return False, f"Error uploading database: {str(e)}"

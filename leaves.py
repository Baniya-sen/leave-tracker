from datetime import datetime, timezone

from flask import current_app, session
from pymongo import MongoClient
from pymongo import ReturnDocument

CLIENT = None


def get_mongo_client():
    global CLIENT
    if CLIENT is None:
        CLIENT = MongoClient(current_app.config['MONGO_URI'])
    return CLIENT


def get_leaves_collection():
    client = get_mongo_client()
    db_name = current_app.config['MONGO_DB']
    collection_name = current_app.config['MONGO_Coll']
    return client[db_name][collection_name]


def init_user_info(user_id: int, username: str) -> None:
    collection = get_leaves_collection()
    now_iso = datetime.now(timezone.utc).isoformat()

    stub = {
        "user_id": user_id,
        "user_info": {
            "username": username,
            "account_created": now_iso
        },
        "user_leaves": {}
    }
    collection.insert_one(stub)


def update_user_profile(user_id: int, data: dict) -> bool:
    coll = get_leaves_collection()
    set_ops = {}

    for key, val in data.items():
        if key in ("name", "age"):
            set_ops[key] = val
        else:
            set_ops[f"user_info.{key}"] = val

    if not set_ops:
        return False

    try:
        result = coll.update_one(
            {"user_id": user_id},
            {"$set": set_ops},
            upsert=False
        )
        return result.matched_count > 0
    except Exception as e:
        print("Failed to update mongo with user info", session['user_id'], e)
        return False


def get_users_leaves(user_id: int, username: str) -> dict | None:
    collection = get_leaves_collection()
    document = collection.find_one(
        {
            "user_id": user_id,
            "user_info.username": username
        },
        {
            "_id": 0,
            "user_leaves": 1
        }
    )
    return document.get("user_leaves") if document else None

from datetime import datetime, timezone, date
from typing import Optional, Any, Tuple

from flask import current_app, session, jsonify, Response
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


def init_user_info(user_id: int, email: str) -> bool:
    try:
        collection = get_leaves_collection()
        now_iso = datetime.now(timezone.utc).isoformat()

        stub = {
            "user_id": user_id,
            "user_info": {
                "email": email,
                "account_created": now_iso
            },
            "user_leaves": {}
        }
        collection.insert_one(stub)
        return True
    except Exception as e:
        print(e)
        return False


def update_user_profile(user_id: int, data: dict) -> bool:
    coll = get_leaves_collection()
    firm = get_user_key_data(user_id, "user_info.firm_name")
    set_ops = {}

    existing_doc = coll.find_one(
        {"user_id": user_id},
        {f"user_leaves.{firm}.leaves_given": 1,
         f"user_leaves.{firm}.leaves_remaining": 1,
         "_id": 0}
    )

    existing_g = existing_doc.get("user_leaves", {}).get(firm, {}).get("leaves_given", {}) if existing_doc else {}
    existing_r = existing_doc.get("user_leaves", {}).get(firm, {}).get("leaves_remaining", {}) if existing_doc else {}

    for key, val in data.items():
        if key == "leaves_type":
            new_given = val
            merged_given = existing_g.copy()
            merged_remaining = existing_r.copy()
            for t, c in new_given.items():
                merged_given[t] = c
                merged_remaining.setdefault(t, c)

            set_ops[f"user_leaves.{firm}.leaves_given"] = merged_given
            set_ops[f"user_leaves.{firm}.leaves_remaining"] = merged_remaining

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


def get_user_key_data(user_id: int, key_path: str) -> dict | None:
    coll = get_leaves_collection()

    doc = coll.find_one(
        {"user_id": user_id},
        {key_path: 1, "_id": 0}
    )
    if not doc:
        return None

    value = doc
    for key in key_path.split("."):
        if isinstance(value, dict) and key in value:
            value = value[key]
        else:
            return None
    return value


def update_user_leaves_by_import(user_id: int, leaves_taken_data: dict) -> Tuple[int, int]:
    coll = get_leaves_collection()
    firm = get_user_key_data(user_id, "user_info.firm_name")
    if not firm:
        return -1, -1

    update_ops = {
        f"user_leaves.{firm}.leaves_taken.{lt.title()}": dates
        for lt, dates in leaves_taken_data.items()
    }
    doc = coll.find_one({"user_id": user_id}, {
        f"user_leaves.{firm}.leaves_remaining": 1,
        "_id": 0
    })
    current_remaining = doc.get("user_leaves", {}).get(firm, {}).get("leaves_remaining", {})

    remaining_update = {}
    for lt, dates in leaves_taken_data.items():
        current = current_remaining.get(lt, 0)
        required = len(dates)

        if required > current:
            print(f"Too many leaves: {lt}: requested={required}, available={current}")
            return -1, -1

        remaining_update[f"user_leaves.{firm}.leaves_remaining.{lt}"] = current - required

    update_ops.update(remaining_update)
    result = coll.update_one(
        {"user_id": user_id},
        {"$set": update_ops}
    )
    return len(update_ops), result.matched_count


def get_users_leaves(user_id: int, username: str, firm: str) -> dict | None:
    collection = get_leaves_collection()
    document = collection.find_one(
        {
            "user_id": user_id,
            "user_info.username": username
        },
        {
            "_id": 0,
            f"user_leaves.{firm}": 1
        }
    )
    return document.get("user_leaves") if document else None


def remove_user_leave(user_id: int, firm: str, leave_type: str, date_str: str) -> tuple[bool, str|None]:
    coll = get_leaves_collection()
    # Pull the date from the leaves_taken array for the type
    update = {
        "$pull": {f"user_leaves.{firm}.leaves_taken.{leave_type}": date_str},
        "$inc": {f"user_leaves.{firm}.leaves_remaining.{leave_type}": 1}
    }
    result = coll.update_one({"user_id": user_id}, update)
    if result.modified_count > 0:
        return True, None
    else:
        return False, "No leave found to remove or already removed."


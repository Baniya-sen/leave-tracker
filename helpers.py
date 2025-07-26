import re
import threading
from datetime import datetime, timedelta
from os import getenv

import pyotp
from flask import current_app, session

from telegram import Bot

import auth
from admin import delete_unverified_accounts


OTP_STORE = {}


def account_verified(user_id) -> bool:
    return auth.get_user_field(user_id, 'account_verified') == 1


def validate_name_age(data, user_id) -> any:
    name = data.get('name', '').strip()
    age = data.get('age', '').strip()
    if not name:
        return False, 'Name required', None
    if not age.isdigit() or int(age) < 14:
        return False, 'Age must be a number >= 14', None
    return True, None, {'name': name, 'age': int(age)}


def validate_email(data, user_id=None) -> any:
    email = data.get('email', '').strip()
    if not email or not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return False, 'Invalid email', None
    return True, None, {'email': email}


def validate_dob(data, user_id) -> any:
    date_str = data.get('date', '').strip()

    try:
        dob = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return False, 'Invalid date format', None

    age = auth.get_user_field(user_id, 'age')
    if not age:
        return False, 'Please enter your Age first!', None

    try:
        age = int(age)
    except ValueError:
        return False, 'Age is invalid', None

    today = datetime.today().date()
    calculated_age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

    if calculated_age != age:
        return False, 'Birth date and Age do not match!', None

    return True, None, {'date': date_str}


def validate_firm_info(data, user_id) -> any:
    firm_name = data.get('firm_name', '').strip()
    firm_join_date = data.get('firm_join_date', '').strip()
    if not firm_name:
        return False, 'Firm name required', None
    try:
        datetime.strptime(firm_join_date, '%Y-%m-%d')
    except Exception:
        return False, 'Invalid join date', None
    return True, None, {'firm_name': firm_name, 'firm_join_date': firm_join_date}


def validate_firm_weekend(data, user_id) -> any:
    days = data.get('firm_weekend_days', '').strip()
    if not days or not re.match(r'^([1-7])(?:\s*,\s*(?!\\1)[1-7])?\s*$', days):
        return False, 'Weekend days must be a single number 1-7 or two numbers 1-7 separated by a comma.', None

    parts = [d.strip() for d in days.split(',')]
    sorted_parts = sorted(parts, key=int)
    normalized = ','.join(sorted_parts)
    return True, None, {'firm_weekend_days': normalized}


def validate_firm_leaves(data, request=None, user_id=None) -> any:
    if request is not None:
        types = request.form.getlist('leave_type[]')
        counts = request.form.getlist('leave_count[]')
    else:
        types = data.get('leave_type[]', [])
        counts = data.get('leave_count[]', [])
    if not types or not counts or len(types) != len(counts):
        return False, 'Leave types/counts mismatch', None
    for t, c in zip(types, counts):
        if not t.strip():
            return False, 'Leave type required', None
        try:
            n = int(c)
            if n < 0:
                raise ValueError
        except Exception as e:
            print(e)
            current_app.logger.error("Errors from helpers: ", e)
            return False, 'Leave count must be non-negative integer', None
    return True, None, {}


def schedule_next_run():
    # compute next 3 AM
    now = datetime.now()
    tomorrow = now.date() + timedelta(days=1)
    run_dt = datetime.combine(tomorrow, datetime.min.time()).replace(hour=3)
    delay = (run_dt - now).total_seconds()
    if delay < 0:
        delay += 24 * 3600

    t = threading.Timer(delay, run_task_and_reschedule)
    t.daemon = True
    t.start()


def run_task_and_reschedule():
    try:
        delete_unverified_accounts()
    finally:
        schedule_next_run()


def send_otp_telegram():
    TG_BOT = Bot(token=getenv("TELEGRAM_BOT_TOKEN"))
    TG_CHAT = getenv("TELEGRAM_CHAT_ID")

    secret = session.get("admin_otp_secret")
    if not secret:
        secret = pyotp.random_base32()
        session["admin_otp_secret"] = secret

    totp = pyotp.TOTP(secret, interval=600)
    code = totp.now()
    OTP_STORE[secret] = code
    text = f"🚀 Your one‑time admin OTP is *{code}* (valid 10 for min)."
    TG_BOT.send_message(chat_id=TG_CHAT, text=text, parse_mode="Markdown")
    return code


def validate_otp(submitted_otp) -> bool:
    secret = session.get("admin_otp_secret")
    if not secret:
        return False
    totp = pyotp.TOTP(secret, interval=600)
    if not totp.verify(submitted_otp, valid_window=1):
        return False
    if OTP_STORE.get(secret) != submitted_otp:
        return False
    OTP_STORE.pop(secret, None)
    session.pop("admin_otp_secret", None)
    return True

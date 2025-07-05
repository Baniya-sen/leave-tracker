import re
from datetime import datetime

import auth


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


def validate_email(data, user_id) -> any:
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


def validate_firm_leaves(data, request=None) -> any:
    # request: pass flask.request if available, else None
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
        except Exception:
            return False, 'Leave count must be non-negative integer', None
    return True, None, {}

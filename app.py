import json
import pprint
import re
import hmac
import hashlib
import base64
from os import getenv, path
from datetime import datetime, date
from dotenv import load_dotenv
from functools import wraps
from urllib.parse import quote_plus

from flask import (
    Flask, g, session, request, render_template,
    redirect, url_for, jsonify
)
from flask_session import Session
from flask_wtf import CSRFProtect
from flask_limiter import Limiter

import auth
import leaves
import helpers

load_dotenv()

# Reddis
REDDIS_PASS = quote_plus(getenv('REDDIS_PASS'))
REDDIS_DB = quote_plus(getenv('REDDIS_DB'))
REDDIS_PORT = quote_plus(getenv('REDDIS_PORT'))
REDDIS_URI = f'rediss://default:{REDDIS_PASS}@{REDDIS_DB}.upstash.io:{REDDIS_PORT}'

# Mongo variables
MONGO_USER = quote_plus(getenv('MONGO_USER'))
MONGO_PASS = quote_plus(getenv('MONGO_PASS'))
MONGO_CLUSTER = getenv('MONGO_CLUSTER')
MONGO_COLLECTION = getenv('MONGO_COLLECTION')
MONGO_HOST = getenv('MONGO_HOST')
MONGO_OPTIONS = getenv('MONGO_OPTIONS')
MONGO_URI = f"mongodb+srv://{MONGO_USER}:{MONGO_PASS}@{MONGO_CLUSTER}{MONGO_HOST}/?{MONGO_OPTIONS}{MONGO_CLUSTER}"

app = Flask(__name__)
app.secret_key = getenv('APP_KEY')

app.config['AUTH_DB'] = 'user_auth.db'
app.config['RATELIMIT_STORAGE_URL'] = REDDIS_URI
app.config['SESSION_PERMANENT'] = False
app.config['SESSION_TYPE'] = 'filesystem'
app.config['MONGO_URI'] = MONGO_URI
app.config['MONGO_DB'] = MONGO_CLUSTER
app.config['MONGO_Coll'] = MONGO_COLLECTION
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=True
)

limiter = Limiter(
    app=app,
    key_func=lambda: session.get('user_id'),
    storage_uri=REDDIS_URI
)
Session(app)
csrf = CSRFProtect(app)

DATE_FMT = "%Y-%m-%d"
WEEKEND_RE = re.compile(r'^\d+(?:,\d+)*$')


# Initialize/teardown databases
@app.teardown_appcontext
def teardown(exc):
    auth.close_auth_db(exc)


@app.template_filter("from_json")
def from_json_filter(s):
    try:
        return json.loads(s)
    except Exception as e:
        print(e)
        return {}


def valid_date(s):
    try:
        datetime.strptime(s, DATE_FMT)
        return True
    except ValueError:
        return False


def make_daily_token(username: str) -> str:
    key = app.config['SECRET_KEY'].encode()
    msg = f"{username}:{date.today().isoformat()}".encode()
    digest = hmac.new(key, msg, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode('utf8')[:8]


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))

        user = auth.get_user_info_with_id(session['user_id'])
        if user is None or user['id'] != session['user_id']:
            return redirect(url_for('login'))

        return f(*args, **kwargs)

    return wrapper


@app.before_request
def load_user():
    user_id = session.get('user_id')
    g.user = None
    if user_id:
        db = auth.get_auth_db()
        g.user = db.execute(
            'SELECT * FROM users WHERE id = ?', (user_id,)
        ).fetchone()


def apology(message, code=400):
    def string_handle(s):
        """Filters invalid symbols from message"""
        for old, new in [("-", "--"), (" ", "-"), ("_", "__"), ("?", "~q"),
                         ("%", "~p"), ("#", "~h"), ("/", "~s"), ("\"", "''")]:
            s = s.replace(old, new)
        return s

    return render_template("apology.html", top=code, bottom=string_handle(message)), code


# Routes
@csrf.exempt
@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == "GET":
        return render_template("register.html")

    if request.method == 'POST':
        if not request.form.get("username") or not request.form.get("password"):
            return apology("At-least enter user/password", 401)
        elif request.form.get("password") != request.form.get("confirmation"):
            return apology("Passwords mismatch!", 401)

        if auth.register_user(request.form.get("username"), request.form.get("password")):
            user = auth.get_user_info_with_username(request.form.get("username"))
            if leaves.init_user_info(user['id'], user['username']):
                print("User Registered! ", user['username'])
                return redirect(url_for('login'))

        return apology('Username taken!')


@csrf.exempt
@app.route('/login', methods=['GET', 'POST'])
def login():
    session.clear()

    if request.method == "GET":
        return render_template("login.html")

    if request.method == 'POST':
        if not request.form.get("username") or not request.form.get("password"):
            return apology("At-least provide a username/password!", 401)

        user = auth.authenticate_user(
            request.form['username'], request.form['password']
        )
        if user:
            session['user_id'] = user['id']
            session['username'] = user['username']
            return redirect('/')

        return apology('Invalid credentials', 401)


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


@app.route('/')
@login_required
def home():
    username = session['username']
    token = make_daily_token(username)
    return redirect(
        url_for('user_home',
                username=username,
                token=token)
    )


@app.route('/<username>/<token>')
@login_required
def user_home(username: str, token: str):
    if username != session['username']:
        apology("Username did not matched! Logout and Re-login!", 403)

    if token != make_daily_token(username):
        apology("Token did not matched! Logout and Re-login.", 404)

    all_firm_leaves = leaves.get_user_key_data(session['user_id'], f"user_leaves")
    last_firm = list(all_firm_leaves.keys())[-1]
    firm_leaves = all_firm_leaves[last_firm]

    return render_template(
        'index.html',
        firms="Bonanza Interactive",
        user_leaves=firm_leaves
    )


@app.route('/account', methods=['GET', 'POST'])
@login_required
def account_root():
    uname = session['username']
    token = make_daily_token(uname)
    return redirect(url_for('account', username=uname, token=token), code=307)


@app.route('/<username>/account/<token>', methods=['GET'])
@login_required
def account(username: str, token: str):
    if username != session['username'] or token != make_daily_token(username):
        return apology("Verification failed! Logout and Re-login!", 403)

    user = auth.get_user_info_with_id(session['user_id'])
    pprint.pprint(dict(user))
    return render_template(
        'account.html',
        user_info=user or {}
    )


@app.route('/account/update-info/<info_type>', methods=['POST'])
@login_required
def update_account_info(info_type):
    user_id = session['user_id']
    data = request.form.to_dict(flat=True)

    validators = {
        'name_age': helpers.validate_name_age,
        'email': helpers.validate_email,
        'dob': helpers.validate_dob,
        'firm_info': helpers.validate_firm_info,
        'firm_weekend': helpers.validate_firm_weekend,
        'firm_leaves': lambda d: helpers.validate_firm_leaves(d, request),
    }

    if info_type not in validators:
        return apology('Unknown info type', 400)
    valid, error, clean_data = validators[info_type](data)
    if not valid:
        return apology(error, 400)

    update_data = clean_data
    if info_type == 'firm_leaves':
        update_data['leaves_type'] = dict(zip(
            request.form.getlist('leave_type[]'),
            map(int, request.form.getlist('leave_count[]'))
        ))

    if auth.update_user_info(user_id, update_data):
        return redirect(url_for('account_root'))
    else:
        return apology('Update failed', 400)


@app.route("/leaves/import", methods=["POST"])
@limiter.limit("1 per minute")
@login_required
def import_leaves():
    user_id = session["user_id"]

    if not request.is_json:
        return jsonify(error="Expected application/json"), 415

    data = request.get_json()
    if "leaves_taken" not in data:
        return jsonify(error="Missing 'leaves_taken' field."), 400

    leaves_taken = data["leaves_taken"]
    if not isinstance(leaves_taken, dict):
        return jsonify(error="'leaves_taken' must be a JSON object."), 400

    firm = leaves.get_user_key_data(user_id, "user_info.firm_name")
    if not firm:
        return jsonify(error="Firm not configured."), 400

    firm_data = leaves.get_user_key_data(user_id, f"user_leaves.{firm}")
    if not firm_data:
        return jsonify(error="Add leave structure for your firm first."), 400

    allowed_types = set(firm_data.get("leaves_given", {}).keys())
    allowed_types = [item.title() for item in allowed_types]
    if not allowed_types:
        return jsonify(error="No granted leave types found."), 400

    def valid_iso(s):
        try:
            date.fromisoformat(s)
            return True
        except Exception as e:
            print(user_id, "Wrong date in import- ", e)
            return False

    for leave_type, dates in leaves_taken.items():
        if leave_type.title() not in allowed_types:
            return jsonify(error=f"Unknown leave type: '{leave_type}'."), 400
        if not isinstance(dates, list) or not all(
                isinstance(d, str) and valid_iso(d) for d in dates
        ):
            return jsonify(error=f"Invalid dates for leave type '{leave_type}'."), 400

    count, matched = leaves.update_user_leaves_by_import(user_id, leaves_taken)
    if (count, matched) == (-1, -1):
        return jsonify(error="One or more leave types exceed available remaining leaves."), 400

    return jsonify(status="ok", updated=count, matched=matched)


@app.route('/take_leave', methods=['POST'])
@login_required
def take_leave():
    user_id = session['user_id']
    username = session['username']
    data = request.get_json(force=True)
    date_str = data.get('date')
    leave_type = data.get('type')
    days = int(data.get('days', 1))
    if not date_str or not leave_type or days < 1:
        return jsonify(error='Invalid input'), 400

    firm = leaves.get_user_key_data(user_id, 'user_info.firm_name')
    if not firm:
        return jsonify(error='Firm not configured'), 400
    firm_data = leaves.get_user_key_data(user_id, f'user_leaves.{firm}')
    if not firm_data:
        return jsonify(error='No leave structure found'), 400
    leaves_given = firm_data.get('leaves_given', {})
    leaves_remaining = firm_data.get('leaves_remaining', {})
    if leave_type not in leaves_given:
        return jsonify(error='Invalid leave type'), 400
    remaining = leaves_remaining.get(leave_type, leaves_given[leave_type])
    if days > remaining:
        return jsonify(error='Not enough leaves left'), 400

    # Update DB: add date to leaves_taken, decrement leaves_remaining
    coll = leaves.get_leaves_collection()
    taken_key = f'user_leaves.{firm}.leaves_taken.{leave_type}'
    rem_key = f'user_leaves.{firm}.leaves_remaining.{leave_type}'
    doc = coll.find_one({'user_id': user_id})
    taken = doc.get('user_leaves', {}).get(firm, {}).get('leaves_taken', {}).get(leave_type, [])
    # Prevent duplicate date
    if date_str in taken:
        return jsonify(error='Leave already taken for this date'), 400
    new_taken = taken + [date_str] * days
    new_remaining = remaining - days
    if new_remaining < 0:
        return jsonify(error='Not enough leaves left'), 400
    coll.update_one({'user_id': user_id}, {'$set': {taken_key: new_taken, rem_key: new_remaining}})
    return jsonify(status='ok')


if __name__ == '__main__':
    with app.app_context():
        auth.init_auth_db()

    app.run(debug=True)

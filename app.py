import json
import pprint
import re
import hmac
import hashlib
import base64
from os import getenv
from datetime import datetime, date
from dotenv import load_dotenv

from flask import (
    Flask, g, session, request,
    redirect, url_for, render_template, jsonify
)
from flask_session import Session
from functools import wraps
from urllib.parse import quote_plus
import auth
import leaves

load_dotenv()

# Mongo variables
USER = quote_plus(getenv('MONGO_USER'))
PASS = quote_plus(getenv('MONGO_PASS'))
CLUSTER = getenv('MONGO_CLUSTER')
COLLECTION = getenv('MONGO_COLLECTION')
HOST = getenv('MONGO_HOST')
OPTIONS = getenv('MONGO_OPTIONS')
URI = f"mongodb+srv://{USER}:{PASS}@{CLUSTER}{HOST}/?{OPTIONS}{CLUSTER}"
# URI = f"mongodb+srv://{USER}:{PASS}@{CLUSTER}.zv9v2ag.mongodb.net/?retryWrites=true&w=majority&appName=leave-tracker"

app = Flask(__name__)
app.secret_key = getenv('APP_KEY')

app.config['AUTH_DB'] = 'user_auth.db'

app.config['SESSION_PERMANENT'] = False
app.config['SESSION_TYPE'] = 'filesystem'
Session(app)

app.config['MONGO_URI'] = URI
app.config['MONGO_DB'] = CLUSTER
app.config['MONGO_Coll'] = COLLECTION

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
            leaves.init_user_info(user['id'], user['username'])
            print("User Registered! ", user['username'])
            return redirect(url_for('login'))

        return apology('Username taken!')


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

    user_leaves = leaves.get_users_leaves(session['user_id'], session['username'])
    return render_template('index.html', user_leaves=user_leaves)


@app.route('/account', methods=['GET', 'POST'])
@login_required
def account_root():
    uname = session['username']
    token = make_daily_token(uname)
    return redirect(url_for('account', username=uname, token=token), code=307)


@app.route('/<username>/account/<token>', methods=['GET', 'POST'])
@login_required
def account(username: str, token: str):
    if username != session['username'] or token != make_daily_token(username):
        return apology("Verification failed! Logout and Re-login!", 403)

    if request.method == "GET":
        user = auth.get_user_info_with_id(session['user_id'])
        pprint.pprint(dict(user))
        return render_template(
            'account.html',
            user_info=user or {}
        )

    if request.method == "POST":
        data = {}
        for k in ("name", "email", "firm_name"):
            v = request.form.get(k, "").strip()
            if v:
                data[k] = v
        age = request.form.get("age", "").strip()
        if age.isdigit():
            data["age"] = int(age)
        for k in ("date", "firm_join_date"):
            v = request.form.get(k, "").strip()
            if v and valid_date(v):
                data[k] = v
            elif v:
                return apology(f"Invalid {k}", 400)
        w = request.form.get("firm_weekend_days", "").strip()
        if w:
            if WEEKEND_RE.match(w):
                data["firm_weekend_days"] = w
            else:
                return apology("Invalid weekend days", 400)

        types = request.form.getlist('leave_type')
        counts = request.form.getlist('leave_count')

        leaves_given = {}
        for t, c in zip(types, counts):
            t = t.strip()
            try:
                n = int(c)
                if not t or n < 0:
                    raise ValueError
            except ValueError:
                return apology("Each leave type must have a non‑negative integer count.", 400)
            leaves_given[t] = n

        if leaves_given:
            firm = leaves.get_user_key_data(session['user_id'], "user_info.firm_name")
            if not firm:
                return apology("Firm not configured.", 400)

        data['leaves_type'] = leaves_given

        if auth.update_user_info(session["user_id"], data) and \
                leaves.update_user_profile(session["user_id"], data):

            user = auth.get_user_info_with_id(session["user_id"])
            return redirect(
                url_for('account',
                        username=session['username'],
                        token=make_daily_token(session['username']))
            )
        else:
            return apology("Something went wrong!", 401)


@app.route("/leaves/import", methods=["POST"])
@login_required
def import_leaves():
    user_id = session["user_id"]

    data = request.get_json(silent=True)
    if not data or "leaves_taken" not in data:
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
    coll = leaves.get_leaves_collection()
    coll.insert_one({
        'user_id': g.user['id'],
        'date': request.form['date'],
        'leave_type': request.form['type'],
        'days': int(request.form['days'])
    })
    return redirect(url_for('show_leaves'))


if __name__ == '__main__':
    with app.app_context():
        auth.init_auth_db()

    app.run(debug=True)

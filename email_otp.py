from os import getenv, environ
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

OTP_EXPIRY_MINUTES = 10
SMTP_SERVER = "smtp.zoho.in"
SMTP_PORT = 587

if environ.get("FLASK_ENV") != "production":
    load_dotenv()

ZOHO_VERIF_USER = getenv("VERIF_MAIL_USER")
ZOHO_VERIF_PASS = getenv("VERIF_MAIL_PASS")

if not ZOHO_VERIF_USER or not ZOHO_VERIF_PASS:
    raise RuntimeError("VERIF_MAIL_USER and VERIF_MAIL_PASS must be set in env")


def send_email_via_zoho(recipient: str, subject: str, html_body: str, text_body: str) -> None:
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = formataddr(("Leaves Tracker", ZOHO_VERIF_USER))
    msg['To'] = recipient
    msg.attach(MIMEText(text_body, 'plain'))
    msg.attach(MIMEText(html_body, 'html'))

    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(ZOHO_VERIF_USER, ZOHO_VERIF_PASS)
        smtp.sendmail(ZOHO_VERIF_USER, recipient, msg.as_string())


def generate_otp(length: int = 6) -> str:
    from random import SystemRandom
    return "".join(SystemRandom().choice("0123456789") for _ in range(length))


def send_otp(username: str, recipient: str, otp: str = None) -> str:
    if otp is None:
        otp = generate_otp()
    now = datetime.now(timezone.utc)
    expires = (now + timedelta(minutes=OTP_EXPIRY_MINUTES)).strftime("%H:%M UTC")

    subject = f"Leaves‑Tracker verification code: {otp}"
    text_body = (
        f"Hello {username},\n\n"
        f"Your verification code is: {otp}\n"
        f"It expires in {OTP_EXPIRY_MINUTES} minutes (at {expires}).\n\n"
        "If you didn’t request this, just ignore this email.\n"
    )
    base_url = "https://www.leavestracker.in"
    logo_url = f"{base_url}/static/images/logo.png"
    html_body = f"""
    <!DOCTYPE html>
    <html lang="en"><head><meta charset="UTF-8"><title>{subject}</title></head>
    <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif">
      <table role="presentation" width="100%" style="max-width:600px;margin:40px auto;
             background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
        <tr style="background:#1abc9c;color:white"><td style="padding:20px;text-align:center">
            <img src="{logo_url}" alt="Leaves‑Tracker" width="48"
                 style="vertical-align:middle">
            <span style="font-size:24px;font-weight:600;margin-left:8px;vertical-align:middle">
              Leaves‑Tracker
            </span>
        </td></tr>
        <tr><td style="padding:30px;color:#333">
            <h2 style="margin-top:0">Hi, {username} 👋</h2>
            <p>Your one‑time verification code is:</p>
            <p style="font-size:28px;font-weight:600;color:#1abc9c;text-align:center">{otp}</p>
            <p style="font-size:14px;color:#777;text-align:center">
              Expires in {OTP_EXPIRY_MINUTES} minutes ({expires})
            </p>
            <hr style="border:none;border-top:1px solid #eee;margin:30px 0">
            <p style="font-size:13px;color:#999;text-align:center">
              If you didn’t request this, ignore this email.
            </p>
        </td></tr>
      </table>
    </body></html>
    """

    send_email_via_zoho(recipient, subject, html_body, text_body)
    return otp

from os import getenv
import smtplib
from email.message import EmailMessage
from datetime import datetime, timedelta, timezone

# Gmail
GMAIL_ID = getenv('GMAIL_USER')
GMAIL_PASS = getenv('GMAIL_PASS')

OTP_EXPIRY_MINUTES = 10
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587


def send_email(recipient: str, subject: str, html_body: str, text_body: str) -> None:
    user = GMAIL_ID
    pw = GMAIL_PASS
    if not user or not pw:
        raise RuntimeError("EMAIL_USER and EMAIL_PASS must be set in env")

    msg = EmailMessage()
    msg["From"] = user
    msg["To"] = recipient
    msg["Subject"] = subject
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(user, pw)
        smtp.send_message(msg)


def generate_otp(length: int = 6) -> str:
    from random import SystemRandom
    return "".join(SystemRandom().choice("0123456789") for _ in range(length))


def send_otp(username: str, recipient: str, otp: str = None) -> str:
    if otp is None:
        otp = generate_otp()
    now = datetime.now(timezone.utc)
    expires = (now + timedelta(minutes=OTP_EXPIRY_MINUTES)).strftime("%H:%M UTC")

    subject = "Verify Your Leaves‑Tracker Account"
    text_body = (
        f"Hello {username},\n\n"
        f"Your verification code is: {otp}\n"
        f"It expires in {OTP_EXPIRY_MINUTES} minutes (at {expires}).\n\n"
        "If you did’t request this, just ignore this email.\n"
    )

    html_body = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>{subject}</title>
    </head>
    <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif">
      <table role="presentation" width="100%" style="max-width:600px;margin:40px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
        <tr style="background:#1abc9c;color:white">
          <td style="padding:20px;text-align:center">
            <!-- Replace src with your hosted logo URL -->
            <img src="https://yourdomain.com/static/logo.png" alt="Leaves‑Tracker" width="48" style="vertical-align:middle">
            <span style="font-size:24px;font-weight:600;margin-left:8px;vertical-align:middle">Leaves‑Tracker</span>
          </td>
        </tr>
        <tr>
          <td style="padding:30px;color:#333">
            <h2 style="margin-top:0">Hi, {username} 👋</h2>
            <p style="font-size:16px;line-height:1.5">
              Your one‑time verification code is:
            </p>
            <p style="font-size:28px;font-weight:600;color:#1abc9c;text-align:center;margin:20px 0">
              {otp}
            </p>
            <p style="font-size:14px;color:#777;text-align:center">
              Expires in {OTP_EXPIRY_MINUTES} minutes<br>
              ({expires})
            </p>
            <hr style="border:none;border-top:1px solid #eee;margin:30px 0">
            <p style="font-size:13px;color:#999;text-align:center">
              If you did’t request this, you can safely ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    send_email(recipient, subject, html_body, text_body)
    return otp

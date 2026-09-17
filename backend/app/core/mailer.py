import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

import httpx

from backend.app.config import settings

logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


class MailNotConfiguredError(RuntimeError):
    """Raised when neither Brevo API key nor SMTP credentials are provided."""


def _send_via_brevo_api(to: str, subject: str, text_body: str, html_body: str | None = None) -> None:
    headers = {
        "accept": "application/json",
        "api-key": settings.BREVO_API_KEY,
        "content-type": "application/json",
    }
    payload = {
        "sender": {
            "name": settings.MAIL_FROM_NAME,
            "email": settings.MAIL_FROM,
        },
        "to": [{"email": to}],
        "subject": subject,
        "textContent": text_body,
    }
    if html_body:
        payload["htmlContent"] = html_body
    if settings.MAIL_REPLY_TO:
        payload["replyTo"] = {"email": settings.MAIL_REPLY_TO}

    with httpx.Client(timeout=15.0) as client:
        response = client.post(BREVO_API_URL, headers=headers, json=payload)
        if response.is_error:
            logger.error("Brevo API error (%s): %s", response.status_code, response.text)
            response.raise_for_status()


def _smtp_client() -> smtplib.SMTP:
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        raise MailNotConfiguredError(
            "Neither BREVO_API_KEY nor SMTP_USER/SMTP_PASSWORD are set in .env"
        )
    context = ssl.create_default_context()
    smtp = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20)
    smtp.ehlo()
    smtp.starttls(context=context)
    smtp.ehlo()
    smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
    return smtp


def send_email(to: str, subject: str, text_body: str, html_body: str | None = None) -> None:
    """Blocking. Call from FastAPI via run_in_threadpool(...)."""
    if settings.BREVO_API_KEY:
        _send_via_brevo_api(to, subject, text_body, html_body)
        logger.info("Email sent via Brevo API to %s", to)
        return

    # Fallback to SMTP
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((settings.MAIL_FROM_NAME, settings.MAIL_FROM))
    msg["To"] = to
    msg["Message-ID"] = make_msgid(domain=settings.MAIL_FROM.split("@")[-1])
    if settings.MAIL_REPLY_TO:
        msg["Reply-To"] = settings.MAIL_REPLY_TO
    msg.set_content(text_body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    with _smtp_client() as smtp:
        smtp.send_message(msg)
    logger.info("Email sent via Brevo SMTP to %s", to)


def send_agent_invite_email(
    *,
    to: str,
    temporary_password: str,
    department_name: str,
    login_url: str | None = None,
) -> None:
    login_url = login_url or f"{settings.FRONTEND_URL.rstrip('/')}/login"
    subject = f"Your {settings.APP_NAME} agent account"

    text_body = f"""You have been added to {settings.APP_NAME} as a support agent.

Login email:        {to}
Temporary password: {temporary_password}
Department:         {department_name}
Login URL:          {login_url}

You will be asked to set your own password the first time you sign in.
Do not share this email — the temporary password is single-use in practice
and stops working once you change it.
"""

    html_body = f"""\
<!doctype html>
<html><body style="margin:0;padding:24px;background:#0a0c10;font-family:Segoe UI,Arial,sans-serif;color:#e5e7eb">
  <div style="max-width:520px;margin:0 auto;background:#11131a;border:1px solid #232632;border-radius:12px;padding:28px">
    <h1 style="margin:0 0 4px;font-size:18px;color:#ffffff">Welcome to {settings.APP_NAME}</h1>
    <p style="margin:0 0 20px;font-size:13px;color:#9ca3af">
      An administrator created a support agent account for you.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;border-collapse:collapse">
      <tr>
        <td style="padding:8px 0;color:#9ca3af;width:150px">Login email</td>
        <td style="padding:8px 0;color:#ffffff"><strong>{to}</strong></td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#9ca3af">Temporary password</td>
        <td style="padding:8px 0"><code style="background:#0a0c10;border:1px solid #232632;border-radius:6px;padding:4px 8px;color:#fbbf24;font-size:14px">{temporary_password}</code></td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#9ca3af">Department</td>
        <td style="padding:8px 0;color:#ffffff">{department_name}</td>
      </tr>
    </table>
    <p style="margin:24px 0 0">
      <a href="{login_url}" style="display:inline-block;background:#fbbf24;color:#000000;text-decoration:none;font-weight:600;font-size:13px;padding:11px 20px;border-radius:8px">Sign in</a>
    </p>
    <p style="margin:20px 0 0;font-size:12px;color:#6b7280">
      You will be asked to choose your own password on first sign-in.
      If you did not expect this email, ignore it and tell your administrator.
    </p>
  </div>
</body></html>
"""
    send_email(to=to, subject=subject, text_body=text_body, html_body=html_body)

def send_password_reset_email(
    *,
    to: str,
    reset_url: str,
) -> None:
    """Send verification email containing the 'Verify' button to reset password."""
    subject = f"Verify your password reset - {settings.APP_NAME}"

    text_body = f"""Hello,

We received a request to reset your password for your {settings.APP_NAME} account.

Please click the link below to verify your request and set a new password:
{reset_url}

This link will expire in 15 minutes.
If you did not request a password reset, you can safely ignore this email.
"""

    html_body = f"""\
<!doctype html>
<html><body style="margin:0;padding:24px;background:#0a0c10;font-family:Segoe UI,Arial,sans-serif;color:#e5e7eb">
  <div style="max-width:520px;margin:0 auto;background:#11131a;border:1px solid #232632;border-radius:12px;padding:28px">
    <h1 style="margin:0 0 8px;font-size:20px;color:#ffffff">Reset Your Password</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#9ca3af;line-height:1.5">
      We received a request to reset the password for your <strong style="color:#ffffff">{settings.APP_NAME}</strong> account ({to}).
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;line-height:1.5">
      Click the button below to verify your email and choose your new password:
    </p>
    <div style="margin:28px 0;text-align:center">
      <a href="{reset_url}" style="display:inline-block;background:#fbbf24;color:#000000;text-decoration:none;font-weight:700;font-size:14px;padding:12px 32px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.3)">Verify</a>
    </div>
    <p style="margin:24px 0 8px;font-size:12px;color:#6b7280;line-height:1.4">
      If the button does not work, copy and paste this link into your browser:
    </p>
    <p style="margin:0 0 24px;font-size:12px;word-break:break-all">
      <a href="{reset_url}" style="color:#fbbf24;text-decoration:underline">{reset_url}</a>
    </p>
    <hr style="border:none;border-top:1px solid #232632;margin:20px 0" />
    <p style="margin:0;font-size:12px;color:#6b7280">
      This link will expire in 15 minutes. If you did not request this, please disregard this email; your account remains secure.
    </p>
  </div>
</body></html>
"""
    send_email(to=to, subject=subject, text_body=text_body, html_body=html_body)

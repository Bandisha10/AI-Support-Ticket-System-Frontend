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
    """Raised when neither Brevo API key nor SMTP credentials are configured."""


def _send_via_brevo_api(to: str, subject: str, text_body: str, html_body: str | None = None) -> None:
    """
    Dispatches outbound email through Brevo's v3 HTTPS Transactional Email API.
    Preferred over SMTP on serverless and containerized platforms to avoid port 587 throttling.
    """
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
    """
    Fallback TLS SMTP client for environments without an active Brevo API key.
    """
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
    """
    Main email dispatch entry point.
    
    CRITICAL IMPLEMENTATION NOTE:
    This function performs synchronous/blocking network I/O.
    When invoked from async FastAPI endpoints or services, it MUST be wrapped with:
        await starlette.concurrency.run_in_threadpool(send_email, ...)
    to avoid blocking the main asyncio event loop.
    """
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

# ============================================================================
# Core HTML Email Layout Wrapper (Responsive & Cross-Client Compatible)
# ============================================================================

def _build_html_layout(
    *,
    badge_label: str,
    badge_color: str,
    badge_bg: str,
    headline: str,
    greeting: str,
    intro_p: str,
    table_rows: list[tuple[str, str]],
    cta_label: str | None = None,
    cta_url: str | None = None,
    footer_note: str | None = None,
) -> str:
    """Builds a responsive, dark-themed HTML email layout."""
    rows_html = ""
    for label, val in table_rows:
        rows_html += f"""
        <tr>
          <td style="padding:10px 14px;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #1e2230;width:35%;">{label}</td>
          <td style="padding:10px 14px;color:#ffffff;font-size:13px;border-bottom:1px solid #1e2230;">{val}</td>
        </tr>
        """

    cta_html = ""
    if cta_label and cta_url:
        cta_html = f"""
        <div style="margin:28px 0 16px;text-align:center;">
          <a href="{cta_url}" style="background:#fbbf24;color:#0a0c10;text-decoration:none;font-size:13px;font-weight:700;padding:12px 30px;border-radius:8px;display:inline-block;box-shadow:0 2px 6px rgba(0,0,0,0.4);">{cta_label}</a>
        </div>
        <p style="margin:0 0 16px;font-size:11px;color:#64748b;text-align:center;word-break:break-all;">
          If the button above does not work, paste this URL into your browser:<br/>
          <a href="{cta_url}" style="color:#fbbf24;text-decoration:underline;">{cta_url}</a>
        </p>
        """

    footer_content = footer_note or "This is an automated notification. Please do not reply directly to this email."

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{headline}</title>
</head>
<body style="margin:0;padding:24px 12px;background:#090b10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;line-height:1.5;">
  <div style="max-width:560px;margin:0 auto;background:#141721;border:1px solid #232736;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.5);">
    
    <!-- Header -->
    <div style="padding:22px 28px;background:#10131c;border-bottom:1px solid #1f2333;display:flex;align-items:center;">
      <span style="font-size:15px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">
        <span style="color:#fbbf24;">●</span> {settings.APP_NAME} Support Desk
      </span>
    </div>

    <!-- Main Body -->
    <div style="padding:28px;">
      <div style="margin-bottom:16px;">
        <span style="display:inline-block;padding:3px 10px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;border-radius:6px;background:{badge_bg};color:{badge_color};">
          {badge_label}
        </span>
      </div>

      <h1 style="margin:0 0 12px;font-size:19px;font-weight:700;color:#ffffff;">{headline}</h1>
      <p style="margin:0 0 8px;font-size:14px;color:#cbd5e1;">{greeting}</p>
      <p style="margin:0 0 20px;font-size:13px;color:#94a3b8;line-height:1.6;">{intro_p}</p>

      <!-- Details Table -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#0d0f17;border:1px solid #1e2230;border-radius:8px;overflow:hidden;">
        {rows_html}
      </table>

      <!-- CTA -->
      {cta_html}
    </div>

    <!-- Footer -->
    <div style="padding:18px 28px;background:#0d0f17;border-top:1px solid #1b1e2b;text-align:center;">
      <p style="margin:0;font-size:11px;color:#64748b;line-height:1.5;">
        {footer_content}<br/>
        &copy; {settings.APP_NAME}. All rights reserved.
      </p>
    </div>

  </div>
</body>
</html>"""


# ============================================================================
# Public Transactional Mail Workflows
# ============================================================================

def send_agent_invite_email(
    *,
    to: str,
    temporary_password: str,
    department_name: str,
    first_name: str | None = None,
    last_name: str | None = None,
    agent_tier: int | None = 1,
    login_url: str | None = None,
) -> None:
    """Delivers account credentials to newly provisioned agents and managers."""
    login_url = login_url or f"{settings.FRONTEND_URL.rstrip('/')}/login"
    full_name = " ".join(part for part in [first_name, last_name] if part).strip()
    tier_val = getattr(agent_tier, "value", agent_tier)
    tier_name = "Department Manager" if str(tier_val) in ("2", "manager") else "Support Agent"

    subject = f"Welcome to {settings.APP_NAME} — Agent Account Provisioned"
    greeting = f"Hello {first_name}," if first_name else f"Hello,"

    text_body = f"""{greeting}

An administrator has invited you to {settings.APP_NAME} as a {tier_name}.

Name:               {full_name or 'N/A'}
Login Email:        {to}
Temporary Password: {temporary_password}
Department:         {department_name}
Role / Tier:        {tier_name}
Login URL:          {login_url}

Please sign in and set your permanent password. Do not share your temporary password with anyone.
"""

    table_rows = []
    if full_name:
        table_rows.append(("Agent Name", f"<strong>{full_name}</strong>"))
    table_rows.append(("Login Email", f"<strong>{to}</strong>"))
    table_rows.append((
        "Temporary Password",
        f"<code style=\"background:#1b1f2e;border:1px solid #2d3348;border-radius:5px;padding:3px 8px;color:#fbbf24;font-size:13px;font-family:monospace;\">{temporary_password}</code>"
    ))
    table_rows.append(("Department", f"<span style=\"color:#ffffff;\">{department_name}</span>"))
    table_rows.append((
        "Tier / Role",
        f"<span style=\"background:#181b26;border:1px solid #2e3448;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700;color:#fbbf24;\">{tier_name}</span>"
    ))

    html_body = _build_html_layout(
        badge_label="Account Invitation",
        badge_color="#fbbf24",
        badge_bg="rgba(251, 191, 36, 0.15)",
        headline="Welcome to the Support Team",
        greeting=greeting,
        intro_p=f"Your account has been provisioned on <strong>{settings.APP_NAME}</strong> with {tier_name} privileges. Use the temporary credentials below to activate your account.",
        table_rows=table_rows,
        cta_label="Sign In to Agent Portal",
        cta_url=login_url,
        footer_note="You will be required to change your password immediately upon your first sign in. If you did not anticipate this invite, please contact your administrator.",
    )

    send_email(to=to, subject=subject, text_body=text_body, html_body=html_body)


def send_password_reset_email(
    *,
    to: str,
    reset_url: str,
) -> None:
    """Delivers 15-minute verification link to authorize password resets."""
    subject = f"Reset your password - {settings.APP_NAME}"
    greeting = "Hello,"

    text_body = f"""{greeting}

We received a request to reset the password for your {settings.APP_NAME} account ({to}).

To set a new password, verify your request by visiting the link below:
{reset_url}

This link is valid for 15 minutes. If you did not request this, you can safely ignore this email.
"""

    table_rows = [
        ("Account Email", f"<strong>{to}</strong>"),
        ("Token Validity", "<span style=\"color:#f87171;\">15 minutes</span>"),
        ("Security Status", "<span style=\"color:#34d399;\">Protected by temporary token</span>"),
    ]

    html_body = _build_html_layout(
        badge_label="Security Action Required",
        badge_color="#60a5fa",
        badge_bg="rgba(59, 130, 246, 0.15)",
        headline="Password Reset Verification",
        greeting=greeting,
        intro_p=f"A request was submitted to reset your password for <strong>{settings.APP_NAME}</strong>. Click the verification button below to set a new password.",
        table_rows=table_rows,
        cta_label="Verify & Reset Password",
        cta_url=reset_url,
        footer_note="For security reasons, this verification link will expire in 15 minutes. If you did not initiate this request, your account remains secure and no action is required.",
    )

    send_email(to=to, subject=subject, text_body=text_body, html_body=html_body)


def send_manager_ticket_escalation_email(
    *,
    manager_email: str,
    manager_name: str | None,
    ticket_id: str,
    ticket_subject: str,
    reason: str,
    priority: str,
    sentiment: str,
) -> None:
    """Alerts Department Managers when a ticket auto-escalates or requires managerial handover."""
    subject = f"[{priority.upper()}] Escalation Alert: {ticket_subject[:45]}"
    greeting = f"Hello {manager_name}," if manager_name else "Hello Department Manager,"
    portal_url = f"{settings.FRONTEND_URL.rstrip('/')}/agent/tickets/{ticket_id}"

    text_body = f"""{greeting}

A customer ticket has escalated to your Department Manager queue.

Reason:        {reason}
Ticket ID:     {ticket_id}
Subject:       {ticket_subject}
Priority:      {priority.upper()}
Sentiment:     {sentiment.capitalize()}

Review and handle this ticket here:
{portal_url}
"""

    priority_color = "#ef4444" if priority.lower() == "high" else "#f59e0b"
    sentiment_color = "#ef4444" if sentiment.lower() == "negative" else "#94a3b8"

    table_rows = [
        ("Ticket ID", f"<code style=\"color:#cbd5e1;font-size:12px;\">#{ticket_id[:8]}...</code>"),
        ("Subject", f"<strong style=\"color:#ffffff;\">{ticket_subject}</strong>"),
        ("Escalation Reason", f"<span style=\"color:#fbbf24;\">{reason}</span>"),
        ("Priority", f"<strong style=\"color:{priority_color};\">{priority.upper()}</strong>"),
        ("Customer Sentiment", f"<span style=\"color:{sentiment_color};font-weight:600;\">{sentiment.capitalize()}</span>"),
    ]

    html_body = _build_html_layout(
        badge_label="Manager Escalation",
        badge_color="#f87171",
        badge_bg="rgba(239, 68, 68, 0.15)",
        headline="Action Required: Ticket Auto-Escalated",
        greeting=greeting,
        intro_p="A ticket has been assigned directly to your Manager queue due to high priority, negative sentiment, or agent absence workload handover.",
        table_rows=table_rows,
        cta_label="Open Ticket in Queue",
        cta_url=portal_url,
        footer_note="As Department Manager, you can resolve this ticket directly or delegate it to an on-duty agent in your team panel.",
    )

    send_email(to=manager_email, subject=subject, text_body=text_body, html_body=html_body)


def send_manager_tier_assigned_email(
    *,
    manager_email: str | None = None,
    agent_email: str | None = None,
    manager_name: str | None = None,
    agent_name: str | None = None,
    ticket_id: str,
    ticket_subject: str,
    department_name: str,
    assigned_by_name: str | None = None,
    delegated_by_name: str | None = None,
    priority: str = "high",
) -> None:
    """
    Notifies a user when they are elevated to the Manager Tier (Tier 2)
    and hands over active ticket(s) to their manager queue.
    """
    target_email = manager_email or agent_email
    target_name = manager_name or agent_name
    assigned_by = assigned_by_name or delegated_by_name or "Administrator"

    if not target_email:
        return

    subject = f"[MANAGER TIER ACTIVATED] {department_name}: #{ticket_id[:8]} Assigned"
    greeting = f"Hello {target_name}," if target_name else "Hello,"
    portal_url = f"{settings.FRONTEND_URL.rstrip('/')}/agent/tickets/{ticket_id}"

    text_body = f"""{greeting}

You have been assigned the Department Manager Tier (Tier 2) for {department_name}.

The following customer ticket has been routed and assigned to your manager queue:

Role / Tier: Department Manager (Tier 2)
Department:  {department_name}
Ticket ID:   #{ticket_id[:8]} ({ticket_id})
Subject:     {ticket_subject}
Priority:    {priority.upper()}
Assigned By: {assigned_by}

Access your assigned ticket and department queue:
{portal_url}

As Department Manager, you have elevated authority to triage escalations, inspect team availability, and delegate tickets across your team.
"""

    priority_color = "#ef4444" if str(priority).lower() == "high" else "#f59e0b"

    table_rows = [
        (
            "Designated Role",
            "<span style=\"background:#181b26;border:1px solid #f59e0b;border-radius:4px;padding:3px 8px;font-size:11px;font-weight:700;color:#fbbf24;\">Department Manager (Tier 2)</span>",
        ),
        ("Department", f"<strong style=\"color:#ffffff;\">{department_name}</strong>"),
        (
            "Assigned Ticket",
            f"<strong style=\"color:#ffffff;\">{ticket_subject}</strong>",
        ),
        (
            "Ticket ID",
            f"<code style=\"color:#cbd5e1;font-size:12px;background:#141724;padding:2px 6px;border-radius:4px;border:1px solid #23283b;\">#{ticket_id[:8]}...</code>",
        ),
        (
            "Priority",
            f"<strong style=\"color:{priority_color};letter-spacing:0.5px;\">{priority.upper()}</strong>",
        ),
        (
            "Assigned By",
            f"<span style=\"color:#fbbf24;font-weight:600;\">{assigned_by}</span>",
        ),
    ]

    html_body = _build_html_layout(
        badge_label="Manager Tier Activated",
        badge_color="#f59e0b",
        badge_bg="rgba(245, 158, 11, 0.15)",
        headline="Department Manager Tier Assigned",
        greeting=greeting,
        intro_p=f"You have been assigned the <strong>Department Manager (Tier 2)</strong> role for <strong>{department_name}</strong>. The following customer support ticket has been assigned to your queue for managerial oversight.",
        table_rows=table_rows,
        cta_label="Open Ticket & Manager Queue",
        cta_url=portal_url,
        footer_note="As Department Manager, you can resolve this ticket directly or delegate it to an on-duty agent in your team panel.",
    )

    send_email(to=target_email, subject=subject, text_body=text_body, html_body=html_body)


# ============================================================================
# Delegated Agent Ticket Assignment Email
# ============================================================================

def send_agent_ticket_delegated_email(
    *,
    agent_email: str,
    agent_name: str | None,
    ticket_id: str,
    ticket_subject: str,
    department_name: str,
    delegated_by_name: str,
    priority: str = "medium",
) -> None:
    """
    Notifies a support agent when a Department Manager or Admin delegates/assigns
    a customer ticket to their queue.
    """
    if not agent_email:
        return

    subject = f"[{priority.upper()}] Ticket Delegated: {ticket_subject[:45]}"
    greeting = f"Hello {agent_name}," if agent_name else "Hello,"
    portal_url = f"{settings.FRONTEND_URL.rstrip('/')}/agent/tickets/{ticket_id}"

    text_body = f"""{greeting}

A customer support ticket has been delegated and assigned to you by {delegated_by_name}.

Ticket ID:   #{ticket_id[:8]} ({ticket_id})
Subject:     {ticket_subject}
Department:  {department_name}
Priority:    {priority.upper()}
Assigned By: {delegated_by_name}

Access and work on this ticket:
{portal_url}

Please review this ticket promptly according to department SLA guidelines.
"""

    priority_color = "#ef4444" if str(priority).lower() == "high" else "#f59e0b"

    table_rows = [
        (
            "Ticket ID",
            f'<code style="color:#cbd5e1;font-size:12px;background:#141724;padding:2px 6px;border-radius:4px;border:1px solid #23283b;">#{ticket_id[:8]}...</code>',
        ),
        (
            "Subject",
            f'<strong style="color:#ffffff;">{ticket_subject}</strong>',
        ),
        ("Department", f'<span style="color:#ffffff;">{department_name}</span>'),
        (
            "Priority",
            f'<strong style="color:{priority_color};">{priority.upper()}</strong>',
        ),
        (
            "Delegated By",
            f'<span style="color:#38bdf8;font-weight:600;">{delegated_by_name}</span>',
        ),
    ]

    html_body = _build_html_layout(
        badge_label="Ticket Delegated",
        badge_color="#38bdf8",
        badge_bg="rgba(56, 189, 248, 0.15)",
        headline="New Ticket Delegated to You",
        greeting=greeting,
        intro_p=f"A customer support ticket has been delegated to you by <strong>{delegated_by_name}</strong>. Please review and respond in accordance with your department SLA.",
        table_rows=table_rows,
        cta_label="View & Work on Ticket",
        cta_url=portal_url,
        footer_note="You received this email notification because this ticket was assigned to your agent account.",
    )

    send_email(to=agent_email, subject=subject, text_body=text_body, html_body=html_body)

# ============================================================================
# Manager Promotion & Demotion Role Change Emails
# ============================================================================

def send_manager_assigned_email(
    *,
    manager_email: str,
    manager_name: str | None,
    department_name: str,
    assigned_by_name: str = "Administrator",
    reassigned_ticket_count: int = 0,
) -> None:
    """Notifies an agent that they have been assigned / promoted to Department Manager."""
    if not manager_email:
        return

    subject = f"[ROLE UPDATE] Assigned Department Manager - {department_name}"
    greeting = f"Hello {manager_name}," if manager_name else "Hello,"
    portal_url = f"{settings.FRONTEND_URL.rstrip('/')}/agent/tickets"

    text_body = f"""{greeting}

You have been assigned the role of Department Manager for {department_name} by {assigned_by_name}.

Role:        Department Manager (Tier 2)
Department:  {department_name}
Assigned By: {assigned_by_name}
"""
    if reassigned_ticket_count > 0:
        text_body += f"\nAs part of manager succession, {reassigned_ticket_count} active ticket(s) from the previous manager have been handed over to your queue.\n"

    text_body += f"""
As Department Manager, you have elevated authority to:
- Triage high-priority customer escalations
- Inspect team SLA compliance and availability
- Delegate tickets across your on-duty department agents

Access your Manager Dashboard and department queue:
{portal_url}
"""

    table_rows = [
        (
            "New Role",
            '<span style="background:#181b26;border:1px solid #f59e0b;border-radius:4px;padding:3px 8px;font-size:11px;font-weight:700;color:#fbbf24;">Department Manager (Tier 2)</span>',
        ),
        ("Department", f'<strong style="color:#ffffff;">{department_name}</strong>'),
        ("Assigned By", f'<span style="color:#38bdf8;font-weight:600;">{assigned_by_name}</span>'),
    ]
    if reassigned_ticket_count > 0:
        table_rows.append((
            "Handover Tickets",
            f'<span style="color:#fbbf24;font-weight:600;">{reassigned_ticket_count} active ticket(s) transferred</span>',
        ))

    html_body = _build_html_layout(
        badge_label="Manager Role Assigned",
        badge_color="#f59e0b",
        badge_bg="rgba(245, 158, 11, 0.15)",
        headline="Promoted to Department Manager",
        greeting=greeting,
        intro_p=f"You have been assigned the <strong>Department Manager</strong> role for <strong>{department_name}</strong> by <strong>{assigned_by_name}</strong>. You now have elevated authority to manage team workload, triage escalations, and delegate tickets.",
        table_rows=table_rows,
        cta_label="Open Manager Dashboard",
        cta_url=portal_url,
        footer_note="You received this email because your account was promoted to Department Manager.",
    )

    send_email(to=manager_email, subject=subject, text_body=text_body, html_body=html_body)


def send_manager_demoted_email(
    *,
    agent_email: str,
    agent_name: str | None,
    department_name: str,
    new_manager_name: str | None = None,
    reassigned_ticket_count: int = 0,
) -> None:
    """Notifies a former manager that their role has been updated to Support Agent."""
    if not agent_email:
        return

    subject = f"[ROLE UPDATE] Role Changed to Support Agent - {department_name}"
    greeting = f"Hello {agent_name}," if agent_name else "Hello,"
    portal_url = f"{settings.FRONTEND_URL.rstrip('/')}/agent/tickets"

    text_body = f"""{greeting}

Your role in {department_name} has been updated from Department Manager to Support Agent (Regular Tier).

Role:        Support Agent
Department:  {department_name}
"""
    if new_manager_name:
        text_body += f"New Manager: {new_manager_name}\n"

    if reassigned_ticket_count > 0:
        text_body += f"\nYour active manager queue tickets ({reassigned_ticket_count}) have been transferred to the Department Manager.\n"

    text_body += f"""
You can continue working on your assigned customer support tickets in the agent workspace:
{portal_url}
"""

    table_rows = [
        (
            "Updated Role",
            '<span style="background:#181b26;border:1px solid #64748b;border-radius:4px;padding:3px 8px;font-size:11px;font-weight:600;color:#94a3b8;">Support Agent (Regular Tier)</span>',
        ),
        ("Department", f'<strong style="color:#ffffff;">{department_name}</strong>'),
    ]
    if new_manager_name:
        table_rows.append((
            "Department Manager",
            f'<span style="color:#38bdf8;font-weight:600;">{new_manager_name}</span>',
        ))
    if reassigned_ticket_count > 0:
        table_rows.append((
            "Ticket Transition",
            f'<span style="color:#cbd5e1;">{reassigned_ticket_count} manager ticket(s) transferred</span>',
        ))

    html_body = _build_html_layout(
        badge_label="Role Transition",
        badge_color="#94a3b8",
        badge_bg="rgba(148, 163, 184, 0.15)",
        headline="Role Updated to Support Agent",
        greeting=greeting,
        intro_p=f"Your role in <strong>{department_name}</strong> has been updated to <strong>Support Agent</strong>." + (f" Department managerial oversight has transitioned to <strong>{new_manager_name}</strong>." if new_manager_name else ""),
        table_rows=table_rows,
        cta_label="Open Agent Workspace",
        cta_url=portal_url,
        footer_note="You received this email because your account role was updated to Support Agent.",
    )

    send_email(to=agent_email, subject=subject, text_body=text_body, html_body=html_body)

# ============================================================================
# Proactive SLA Breach Warning Email to Department Manager
# ============================================================================

def send_manager_sla_breach_warning_email(
    *,
    manager_email: str,
    manager_name: str | None,
    ticket_id: str,
    ticket_subject: str,
    department_name: str,
    assigned_agent_name: str,
    priority: str,
    resolution_due_at: str,
    minutes_remaining: int,
    is_breached: bool = False,
) -> None:
    """Sends a strict, high-urgency alert to the Department Manager for at-risk or breached tickets."""
    if is_breached:
        status_label = "SLA BREACHED"
        badge_color = "#ef4444"
        badge_bg = "rgba(239, 68, 68, 0.20)"
        headline = "CRITICAL SLA CONTRACT BREACH"
        subject = f"🚨 [CRITICAL SLA BREACH] #{ticket_id[:8]} - {ticket_subject[:35]}"
        time_display = "<strong style=\"color:#ef4444;font-size:14px;\">DEADLINE VIOLATED (BREACHED)</strong>"
        action_statement = (
            "This ticket has officially <strong>EXCEEDED</strong> the agreed customer resolution deadline. "
            "Department SLA compliance has failed for this issue. <strong>Immediate managerial takeover or expedited resolution is required.</strong>"
        )
    else:
        status_label = "SLA AT RISK • 80% CONSUMED"
        badge_color = "#f59e0b"
        badge_bg = "rgba(245, 158, 11, 0.20)"
        headline = "URGENT: SLA Resolution Deadline Imminent"
        subject = f"⚠️ [SLA AT-RISK • 80% ELAPSED] #{ticket_id[:8]} - {ticket_subject[:35]}"
        time_display = f"<strong style=\"color:#f59e0b;font-size:14px;\">{minutes_remaining} minutes remaining</strong>"
        action_statement = (
            f"Over <strong>80% of the customer resolution window has elapsed</strong>. "
            f"Only <strong>{minutes_remaining} minutes</strong> remain before an official contract breach. "
            "<strong>Action Required:</strong> Review assignee progress immediately, unblock the agent, or re-delegate."
        )

    greeting = f"Hello {manager_name}," if manager_name else "Hello Department Manager,"
    portal_url = f"{settings.FRONTEND_URL.rstrip('/')}/agent/tickets/{ticket_id}"
    priority_color = "#ef4444" if str(priority).lower() == "high" else "#f59e0b"

    table_rows = [
        ("Department", f"<strong style=\"color:#ffffff;\">{department_name}</strong>"),
        ("Ticket Subject", f"<strong style=\"color:#ffffff;\">{ticket_subject}</strong>"),
        (
            "Ticket ID",
            f"<code style=\"color:#cbd5e1;font-size:12px;background:#141724;padding:2px 6px;border-radius:4px;border:1px solid #23283b;\">#{ticket_id[:8]}...</code>",
        ),
        (
            "Priority",
            f"<strong style=\"color:{priority_color};letter-spacing:0.5px;\">{priority.upper()}</strong>",
        ),
        ("Current Assignee", f"<span style=\"color:#38bdf8;font-weight:700;\">{assigned_agent_name}</span>"),
        ("Resolution Deadline", f"<span style=\"color:#ffffff;\">{resolution_due_at}</span>"),
        ("Time Status", time_display),
    ]

    text_body = f"""{greeting}

{'CRITICAL SLA CONTRACT BREACH' if is_breached else 'URGENT: SLA DEADLINE EXPIRING SOON'}

Department: {department_name}
Subject: {ticket_subject}
Ticket ID: {ticket_id}
Priority: {priority.upper()}
Current Assignee: {assigned_agent_name}
Deadline: {resolution_due_at}
Time Status: {'EXCEEDED (BREACHED)' if is_breached else f'{minutes_remaining} minutes remaining'}

Directive:
{action_statement.replace('<strong>', '').replace('</strong>', '')}

Open and triage ticket immediately:
{portal_url}
"""

    html_body = _build_html_layout(
        badge_label=status_label,
        badge_color=badge_color,
        badge_bg=badge_bg,
        headline=headline,
        greeting=greeting,
        intro_p=action_statement,
        table_rows=table_rows,
        cta_label="Open & Take Action on Ticket",
        cta_url=portal_url,
        footer_note="You received this high-priority escalation because you are the designated Department Manager. Proactive intervention prevents customer churn.",
    )

    send_email(to=manager_email, subject=subject, text_body=text_body, html_body=html_body)

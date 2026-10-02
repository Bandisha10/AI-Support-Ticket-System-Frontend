import asyncio
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from backend.app.database import AsyncSessionLocal
from backend.app.models.ticket import Ticket
from backend.app.models.sla_state import SLAState
from backend.app.models.sla_policy import SLAPolicy
from backend.app.models.department import Department
from backend.app.models.user import User
from backend.app.models.reply import Reply
from backend.app.models.enums import TicketStatus
from backend.app.services.manager_service import get_active_department_manager
from backend.app.core import mailer

logger = logging.getLogger(__name__)


async def check_and_warn_at_risk_slas(db: AsyncSession) -> int:
    """
    Two-stage SLA scanner:
    1. STAGE 1 (80% Threshold): Sends an urgent warning when a ticket consumes 80% of resolution time.
    2. STAGE 2 (100% Threshold): Sends a critical breach alert when the SLA deadline is officially violated.
    Guarantees that both events fire exactly once per ticket without duplicate spam.
    """
    now = datetime.now(timezone.utc)

    # Fetch active tickets needing either 80% warning OR 100% breach notification
    query = (
        select(Ticket, SLAState, SLAPolicy)
        .join(SLAState, SLAState.ticket_id == Ticket.id)
        .join(SLAPolicy, SLAPolicy.id == SLAState.sla_policy_id)
        .where(
            Ticket.status.notin_([TicketStatus.resolved, TicketStatus.closed]),
            (SLAState.escalated_at.is_(None)) | (SLAState.breached.is_(False)),
        )
        .with_for_update(of=SLAState, skip_locked=True)
    )

    result = await db.execute(query)
    rows = result.all()
    actions_taken = 0

    for ticket, sla_state, sla_policy in rows:
        due_at = sla_state.resolution_due_at
        if due_at.tzinfo is None:
            due_at = due_at.replace(tzinfo=timezone.utc)

        total_minutes = sla_policy.resolution_minutes
        threshold_80 = due_at - timedelta(minutes=0.20 * total_minutes)

        is_breached = now >= due_at
        is_at_risk = now >= threshold_80 and not is_breached

        # Determine which stage to execute
        should_alert_breach = is_breached and not sla_state.breached
        should_alert_warning = is_at_risk and sla_state.escalated_at is None

        if not (should_alert_breach or should_alert_warning):
            continue

        remaining_seconds = max(0, int((due_at - now).total_seconds()))
        remaining_minutes = remaining_seconds // 60
        overdue_minutes = max(0, int((now - due_at).total_seconds()) // 60) if is_breached else 0

        # Resolve Department and Manager
        manager = None
        dept_name = "General Support"
        if ticket.department_id:
            manager = await get_active_department_manager(db, ticket.department_id)
            dept_row = await db.get(Department, ticket.department_id)
            if dept_row:
                dept_name = dept_row.name

        # Resolve Assigned Agent
        assigned_agent = None
        if ticket.assigned_agent_id:
            assigned_agent = await db.get(User, ticket.assigned_agent_id)

        agent_name = (
            f"{assigned_agent.first_name} {assigned_agent.last_name}".strip() or assigned_agent.email
            if assigned_agent
            else "Unassigned"
        )
        target_mgr_text = f"Department Manager ({manager.email})" if manager else "Department (No Active Manager)"
        author_id = manager.id if manager else (assigned_agent.id if assigned_agent else None)

        # -------------------------------------------------------------
        # STAGE 2: CRITICAL SLA BREACH VIOLATION (100% Deadline Elapsed)
        # -------------------------------------------------------------
        if should_alert_breach:
            sla_state.breached = True
            if sla_state.escalated_at is None:
                sla_state.escalated_at = now

            db.add(Reply(
                ticket_id=ticket.id,
                author_id=author_id,
                body=(
                    f"🚨 [CRITICAL SLA BREACH • CONTRACT VIOLATED]\n\n"
                    f"• Deadline: {due_at.strftime('%Y-%m-%d %H:%M UTC')}\n"
                    f"• Status: BREACHED ({overdue_minutes} minutes overdue)\n"
                    f"• Current Assignee: {agent_name}\n"
                    f"• Directive: {target_mgr_text} alerted for mandatory managerial intervention or reassignment."
                ),
                is_system_log=True,
            ))

            if manager:
                try:
                    await run_in_threadpool(
                        mailer.send_manager_sla_breach_warning_email,
                        manager_email=manager.email,
                        manager_name=manager.first_name,
                        ticket_id=str(ticket.id),
                        ticket_subject=ticket.subject,
                        department_name=dept_name,
                        assigned_agent_name=agent_name,
                        priority=ticket.priority.value if hasattr(ticket.priority, "value") else str(ticket.priority),
                        resolution_due_at=due_at.strftime("%Y-%m-%d %H:%M UTC"),
                        minutes_remaining=0,
                        is_breached=True,
                    )
                except Exception as mail_err:
                    logger.warning("Failed to send SLA breach email for ticket %s: %s", ticket.id, mail_err)

            actions_taken += 1

        # -------------------------------------------------------------
        # STAGE 1: URGENT SLA AT-RISK WARNING (80% Window Elapsed)
        # -------------------------------------------------------------
        elif should_alert_warning:
            sla_state.escalated_at = now

            db.add(Reply(
                ticket_id=ticket.id,
                author_id=author_id,
                body=(
                    f"⚠️ [SLA WARNING • 80% WINDOW CONSUMED]\n\n"
                    f"• Deadline: {due_at.strftime('%Y-%m-%d %H:%M UTC')} ({remaining_minutes} min remaining)\n"
                    f"• Current Assignee: {agent_name}\n"
                    f"• Action Required: {target_mgr_text} notified to expedite resolution or re-delegate before contractual violation."
                ),
                is_system_log=True,
            ))

            if manager:
                try:
                    await run_in_threadpool(
                        mailer.send_manager_sla_breach_warning_email,
                        manager_email=manager.email,
                        manager_name=manager.first_name,
                        ticket_id=str(ticket.id),
                        ticket_subject=ticket.subject,
                        department_name=dept_name,
                        assigned_agent_name=agent_name,
                        priority=ticket.priority.value if hasattr(ticket.priority, "value") else str(ticket.priority),
                        resolution_due_at=due_at.strftime("%Y-%m-%d %H:%M UTC"),
                        minutes_remaining=remaining_minutes,
                        is_breached=False,
                    )
                except Exception as mail_err:
                    logger.warning("Failed to send SLA warning email for ticket %s: %s", ticket.id, mail_err)

            actions_taken += 1

    if actions_taken > 0:
        await db.commit()

    return actions_taken


async def sla_monitor_worker():
    """Background worker loop running periodically to check for at-risk tickets."""
    logger.info("SLA Monitor background worker started.")
    while True:
        try:
            await asyncio.sleep(60)  # Check every 60 seconds
            async with AsyncSessionLocal() as session:
                actions = await check_and_warn_at_risk_slas(session)
                if actions > 0:
                    logger.info("SLA Monitor: Processed %d SLA alert(s).", actions)
        except asyncio.CancelledError:
            logger.info("SLA Monitor background worker shutting down.")
            break
        except Exception as exc:
            logger.error("Unexpected error in SLA Monitor worker: %s", exc, exc_info=True)
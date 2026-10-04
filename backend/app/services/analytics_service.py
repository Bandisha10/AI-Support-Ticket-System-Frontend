"""
Analytics & Reporting Service.
Aggregates ticket status, department distributions, CSAT satisfaction, agent performance,
and trend metrics with in-memory caching.
"""
from datetime import datetime, timedelta, timezone
from uuid import UUID

from cachetools import TTLCache
from sqlalchemy import case, select
from sqlalchemy import func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.department import Department
from backend.app.models.enums import TicketStatus, UserRole
from backend.app.models.ticket import Ticket
from backend.app.models.ticket_rating import TicketRating
from backend.app.models.reply import Reply
from backend.app.models.user import User
from backend.app.models.sla_state import SLAState


analytics_cache = TTLCache(maxsize=100, ttl=60)


def build_date_filters(
    date_range: str | None,
    start_date: str | None,
    end_date: str | None,
    base_filters: list | None = None,
) -> list:
    """Builds SQL date filtering criteria from query parameters."""
    filters = list(base_filters) if base_filters else []
    now = datetime.now(timezone.utc)
    if date_range == "week":
        filters.append(Ticket.created_at >= now - timedelta(days=7))
    elif date_range == "month":
        filters.append(Ticket.created_at >= now - timedelta(days=30))
    elif date_range == "custom" or start_date or end_date:
        if start_date:
            try:
                s_dt = datetime.fromisoformat(start_date.replace("Z", ""))
                filters.append(
                    Ticket.created_at
                    >= datetime(s_dt.year, s_dt.month, s_dt.day, 0, 0, 0, tzinfo=timezone.utc)
                )
            except Exception:
                pass
        if end_date:
            try:
                e_dt = datetime.fromisoformat(end_date.replace("Z", ""))
                filters.append(
                    Ticket.created_at
                    <= datetime(e_dt.year, e_dt.month, e_dt.day, 23, 59, 59, tzinfo=timezone.utc)
                )
            except Exception:
                pass
    return filters

def format_seconds_to_label(seconds: float | None) -> str:
    """Formats duration in seconds into a clean human-readable label (e.g. '< 1m', '18m', '1h 25m', '2d 4h')."""
    if seconds is None or seconds < 0:
        return "N/A"
    total_seconds = int(seconds)
    if total_seconds < 60:
        return "< 1m"
    total_minutes = total_seconds // 60
    if total_minutes < 60:
        return f"{total_minutes}m"
    hours = total_minutes // 60
    minutes = total_minutes % 60
    if hours < 24:
        return f"{hours}h {minutes}m" if minutes > 0 else f"{hours}h"
    days = hours // 24
    rem_hours = hours % 24
    return f"{days}d {rem_hours}h" if rem_hours > 0 else f"{days}d"


async def calculate_avg_response_seconds(
    db: AsyncSession,
    ticket_filters: list,
    agent_id: UUID | None = None,
) -> float | None:
    """Calculates average first response time (seconds) between ticket creation and the first public human agent reply."""
    reply_conditions = [
        Reply.is_system_log.is_(False),
        Reply.author_id != Ticket.customer_id,
    ]
    if agent_id:
        reply_conditions.append(Reply.author_id == agent_id)

    first_reply_subq = (
        select(
            Reply.ticket_id,
            sa_func.min(Reply.created_at).label("first_reply_at"),
        )
        .join(Ticket, Reply.ticket_id == Ticket.id)
        .where(*reply_conditions)
        .group_by(Reply.ticket_id)
        .subquery()
    )

    query = (
        select(
            sa_func.avg(
                sa_func.extract(
                    "epoch", first_reply_subq.c.first_reply_at - Ticket.created_at
                )
            )
        )
        .select_from(Ticket)
        .join(first_reply_subq, Ticket.id == first_reply_subq.c.ticket_id)
        .where(*ticket_filters)
    )

    avg_seconds = (await db.execute(query)).scalar()
    return float(avg_seconds) if avg_seconds is not None else None


async def get_dashboard_analytics(
    db: AsyncSession,
    current_user: User,
    date_range: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    department_id: UUID | None = None,
) -> dict:
    """Calculates global or department-level analytics for managers and admins."""
    target_dept_id = None
    if current_user.role == UserRole.agent:
        target_dept_id = current_user.department_id
    elif current_user.role == UserRole.admin:
        target_dept_id = department_id

    cache_key = f"analytics_{target_dept_id}_{date_range}_{start_date}_{end_date}"
    if cache_key in analytics_cache:
        return analytics_cache[cache_key]

    now = datetime.now(timezone.utc)
    five_days_ago = now - timedelta(days=5)
    ten_days_ago = now - timedelta(days=10)

    base_filters = []
    if target_dept_id:
        base_filters.append(Ticket.department_id == target_dept_id)

    filters = build_date_filters(date_range, start_date, end_date, base_filters)

    # 1. Totals & Trend
    total_query = select(sa_func.count()).select_from(Ticket).where(*filters)
    total_tickets = (await db.execute(total_query)).scalar() or 0

    recent_filters = [Ticket.created_at >= five_days_ago]
    past_filters = [
        Ticket.created_at >= ten_days_ago,
        Ticket.created_at < five_days_ago,
    ]
    if target_dept_id:
        recent_filters.append(Ticket.department_id == target_dept_id)
        past_filters.append(Ticket.department_id == target_dept_id)

    recent_query = select(sa_func.count()).select_from(Ticket).where(*recent_filters)
    recent_tickets = (await db.execute(recent_query)).scalar() or 0

    past_query = select(sa_func.count()).select_from(Ticket).where(*past_filters)
    past_tickets = (await db.execute(past_query)).scalar() or 0

    if past_tickets > 0:
        total_tickets_trend = round(
            ((recent_tickets - past_tickets) / past_tickets) * 100, 1
        )
    else:
        total_tickets_trend = 100.0 if recent_tickets > 0 else 0.0

    # 2. Status Counts
    status_counts_query = (
        select(Ticket.status, sa_func.count())
        .select_from(Ticket)
        .where(*filters)
        .group_by(Ticket.status)
    )
    status_counts_rows = (await db.execute(status_counts_query)).all()
    status_counts = {
        k.name if hasattr(k, "name") else str(k): v for k, v in status_counts_rows
    }

    open_count = status_counts.get("open", 0)
    in_progress_count = status_counts.get("in_progress", 0)
    pending_count = status_counts.get("pending", 0)
    resolved_count = status_counts.get("resolved", 0)
    closed_count = status_counts.get("closed", 0)

    tickets_by_status = [
        {"name": "open", "count": open_count},
        {"name": "in_progress", "count": in_progress_count},
        {"name": "pending", "count": pending_count},
        {"name": "resolved", "count": resolved_count},
        {"name": "closed", "count": closed_count},
    ]

        # 2b. Priority Breakdown
    priority_query = (
        select(Ticket.priority, sa_func.count())
        .select_from(Ticket)
        .where(*filters)
        .group_by(Ticket.priority)
    )
    priority_rows = (await db.execute(priority_query)).all()
    priority_counts = {
        k.name if hasattr(k, "name") else str(k): v
        for k, v in priority_rows
        if k is not None
    }
    tickets_by_priority = [
        {"name": "high", "count": priority_counts.get("high", 0)},
        {"name": "medium", "count": priority_counts.get("medium", 0)},
        {"name": "low", "count": priority_counts.get("low", 0)},
    ]

    # 3. Department Breakdown (LEFT JOIN to include NULL-department tickets)
    dept_query = (
        select(Department.name, sa_func.count())
        .select_from(Ticket)
        .outerjoin(Department, Ticket.department_id == Department.id)
        .where(*filters)
        .group_by(Department.name)
    )
    dept_rows = (await db.execute(dept_query)).all()
    tickets_by_category = [{"name": r[0] or "Unclassified", "count": r[1]} for r in dept_rows]


    # 4. CSAT (Average Rating & Count)
    csat_query = (
        select(sa_func.avg(TicketRating.rating), sa_func.count(TicketRating.id))
        .select_from(TicketRating)
        .join(Ticket, TicketRating.ticket_id == Ticket.id)
        .where(*filters)
    )
    csat_res = (await db.execute(csat_query)).first()
    csat_val = csat_res[0] if csat_res else None
    csat_count = int(csat_res[1] or 0) if csat_res else 0
    csat = round(float(csat_val), 1) if csat_val is not None else None

    # 5. Agent Performance
    agent_where = [
        User.role == UserRole.agent,
        User.must_change_password.is_(False),
        *filters,
    ]
    if target_dept_id:
        agent_where.append(User.department_id == target_dept_id)

    agent_query = (
        select(
            User.id,
            User.email,
            User.first_name,
            User.last_name,
            sa_func.sum(
                case(
                    (
                        Ticket.status.notin_(
                            [TicketStatus.resolved, TicketStatus.closed]
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
            sa_func.sum(
                case(
                    (
                        Ticket.status.in_([TicketStatus.resolved, TicketStatus.closed]),
                        1,
                    ),
                    else_=0,
                )
            ).label("closed_count"),
            sa_func.avg(TicketRating.rating),
        )
        .select_from(Ticket)
        .join(User, Ticket.assigned_agent_id == User.id)
        .outerjoin(TicketRating, TicketRating.ticket_id == Ticket.id)
        .where(*agent_where)
        .group_by(User.id, User.email, User.first_name, User.last_name)
        .order_by(
            sa_func.sum(
                case(
                    (
                        Ticket.status.in_([TicketStatus.resolved, TicketStatus.closed]),
                        1,
                    ),
                    else_=0,
                )
            ).desc()
        )
    )

    agent_rows = (await db.execute(agent_query)).all()

        # Calculate individual average first response time per agent
    agent_frt_subq = (
        select(
            Reply.author_id,
            Reply.ticket_id,
            sa_func.min(Reply.created_at).label("first_reply_at"),
        )
        .join(Ticket, Reply.ticket_id == Ticket.id)
        .where(
            Reply.is_system_log.is_(False),
            Reply.author_id != Ticket.customer_id,
        )
        .group_by(Reply.author_id, Reply.ticket_id)
        .subquery()
    )

    agent_avg_query = (
        select(
            agent_frt_subq.c.author_id,
            sa_func.avg(
                sa_func.extract(
                    "epoch", agent_frt_subq.c.first_reply_at - Ticket.created_at
                )
            ),
        )
        .select_from(Ticket)
        .join(agent_frt_subq, Ticket.id == agent_frt_subq.c.ticket_id)
        .where(*filters)
        .group_by(agent_frt_subq.c.author_id)
    )
    agent_avg_rows = (await db.execute(agent_avg_query)).all()
    agent_avg_map = {
        str(row[0]): format_seconds_to_label(row[1])
        for row in agent_avg_rows
        if row[0] is not None
    }

    agent_performance = []
    for row in agent_rows:
        agent_rating_val = row[6]
        agent_rating = (
            round(float(agent_rating_val), 1) if agent_rating_val is not None else None
        )
        disp_name = f"{row[2] or ''} {row[3] or ''}".strip() or row[1].split("@")[0]
        agent_performance.append(
            {
                "id": str(row[0]),
                "name": disp_name,
                "email": row[1],
                "unresolved_count": int(row[4] or 0),
                "closed_count": int(row[5] or 0),
                "avg_time": agent_avg_map.get(str(row[0]), "N/A"),
                "rating": agent_rating,
            }
        )
    

    recent_where = [
        Ticket.status.in_([TicketStatus.resolved, TicketStatus.closed]),
        *filters,
    ]
    if target_dept_id:
        recent_where.append(Ticket.department_id == target_dept_id)

    resolved_ts = sa_func.coalesce(SLAState.resolved_at, Ticket.updated_at)
    recent_query = (
        select(
            Ticket.id,
            Ticket.subject,
            Ticket.status,
            resolved_ts,
            TicketRating.rating,
            TicketRating.feedback,
        )
        .select_from(Ticket)
        .outerjoin(TicketRating, TicketRating.ticket_id == Ticket.id)
        .outerjoin(SLAState, SLAState.ticket_id == Ticket.id)
        .where(*recent_where)
        .order_by(resolved_ts.desc())
        .limit(5)
    )
    recent_rows = (await db.execute(recent_query)).all()
    recent_activity = [
        {
            "id": str(r[0]),
            "subject": r[1],
            "status": r[2].name if hasattr(r[2], "name") else str(r[2]),
            "resolved_at": r[3].isoformat() if r[3] else None,
            "rating": r[4],
            "feedback": r[5],
        }
        for r in recent_rows
    ]


    target_dept_name = None
    if target_dept_id:
        target_dept_name = (
            tickets_by_category[0]["name"]
            if tickets_by_category
            else (
                await db.scalar(
                    select(Department.name).where(Department.id == target_dept_id)
                )
            )
        )

    # Calculate global dynamic average first response time
    global_avg_seconds = await calculate_avg_response_seconds(db, filters)
    avg_response_label = format_seconds_to_label(global_avg_seconds)

    resolved_and_closed = resolved_count + closed_count
    resolution_rate = (
        round((resolved_and_closed / total_tickets * 100), 1)
        if total_tickets > 0
        else 0.0
    )

    response_data = {
        "department_id": str(target_dept_id) if target_dept_id else None,
        "department_name": target_dept_name,
        "total_tickets": total_tickets,
        "total_tickets_trend": total_tickets_trend,
        "avg_response_label": avg_response_label,
        "avg_response_trend": 0.0,
        "resolved_count": resolved_count,
        "closed_count": closed_count,
        "resolution_rate": resolution_rate,
        "open_count": open_count,
        "in_progress_count": in_progress_count,
        "pending_count": pending_count,
        "sla_compliance": {
            "csat": csat,
            "ratings_count": csat_count,
        },
        "tickets_by_category": tickets_by_category,
        "tickets_by_status": tickets_by_status,
        "tickets_by_priority": tickets_by_priority,
        "agent_performance": agent_performance,
        "recent_activity": recent_activity,

    }


    analytics_cache[cache_key] = response_data
    return response_data



async def get_agent_analytics(
    db: AsyncSession,
    current_user: User,
    date_range: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    """Calculates agent performance metrics strictly for the signed-in agent."""
    agent_dept_filter = (
        [Ticket.assigned_agent_id == current_user.id, Ticket.department_id == current_user.department_id]
        if current_user.department_id
        else [Ticket.assigned_agent_id == current_user.id]
    )
    filters = build_date_filters(date_range, start_date, end_date, agent_dept_filter)


    total_query = select(sa_func.count()).select_from(Ticket).where(*filters)
    total_tickets = (await db.execute(total_query)).scalar() or 0

    status_query = (
        select(Ticket.status, sa_func.count())
        .select_from(Ticket)
        .where(*filters)
        .group_by(Ticket.status)
    )
    status_rows = (await db.execute(status_query)).all()
    status_counts = {
        k.name if hasattr(k, "name") else str(k): v for k, v in status_rows
    }

    open_count = status_counts.get("open", 0)
    in_progress_count = status_counts.get("in_progress", 0)
    pending_count = status_counts.get("pending", 0)
    resolved_count = status_counts.get("resolved", 0)
    closed_count = status_counts.get("closed", 0)

    tickets_by_status = [
        {"name": "open", "count": open_count},
        {"name": "in_progress", "count": in_progress_count},
        {"name": "pending", "count": pending_count},
        {"name": "resolved", "count": resolved_count},
        {"name": "closed", "count": closed_count},
    ]

    priority_query = (
        select(Ticket.priority, sa_func.count())
        .select_from(Ticket)
        .where(*filters)
        .group_by(Ticket.priority)
    )
    priority_rows = (await db.execute(priority_query)).all()
    priority_counts = {
        k.name if hasattr(k, "name") else str(k): v
        for k, v in priority_rows
        if k is not None
    }
    tickets_by_priority = [
        {"name": "high", "count": priority_counts.get("high", 0)},
        {"name": "medium", "count": priority_counts.get("medium", 0)},
        {"name": "low", "count": priority_counts.get("low", 0)},
    ]

    dept_query = (
        select(Department.name, sa_func.count())
        .select_from(Ticket)
        .outerjoin(Department, Ticket.department_id == Department.id)
        .where(*filters)
        .group_by(Department.name)
    )
    dept_rows = (await db.execute(dept_query)).all()
    tickets_by_category = [{"name": r[0] or "Unclassified", "count": r[1]} for r in dept_rows]


    csat_query = (
        select(sa_func.avg(TicketRating.rating), sa_func.count(TicketRating.id))
        .select_from(TicketRating)
        .join(Ticket, TicketRating.ticket_id == Ticket.id)
        .where(Ticket.assigned_agent_id == current_user.id, *filters)
    )
    csat_res = (await db.execute(csat_query)).first()
    csat_val = csat_res[0] if csat_res else None
    csat_count = csat_res[1] if csat_res else 0
    csat = round(float(csat_val), 1) if csat_val is not None else None

    resolved_and_closed = resolved_count + closed_count
    resolution_rate = (
        round((resolved_and_closed / total_tickets * 100), 1)
        if total_tickets > 0
        else 0.0
    )

    agent_resolved_ts = sa_func.coalesce(SLAState.resolved_at, Ticket.updated_at)
    recent_query = (
        select(
            Ticket.id,
            Ticket.subject,
            Ticket.status,
            agent_resolved_ts,
            TicketRating.rating,
            TicketRating.feedback,
        )
        .select_from(Ticket)
        .outerjoin(TicketRating, TicketRating.ticket_id == Ticket.id)
        .outerjoin(SLAState, SLAState.ticket_id == Ticket.id)
        .where(
            Ticket.assigned_agent_id == current_user.id,
            Ticket.status.in_([TicketStatus.resolved, TicketStatus.closed]),
        )
        .order_by(agent_resolved_ts.desc())
        .limit(5)
    )
    
    recent_rows = (await db.execute(recent_query)).all()
    recent_activity = [
        {
            "id": str(r[0]),
            "subject": r[1],
            "status": r[2].name if hasattr(r[2], "name") else str(r[2]),
            "resolved_at": r[3].isoformat() if r[3] else None,
            "rating": r[4],
            "feedback": r[5],
        }
        for r in recent_rows
    ]

        # Dynamic personal first response time for the logged-in agent
    agent_avg_seconds = await calculate_avg_response_seconds(
        db, filters, agent_id=current_user.id
    )
    avg_response_label = format_seconds_to_label(agent_avg_seconds)

    return {
        "agent_name": current_user.email.split("@")[0],
        "agent_email": current_user.email,
        "total_tickets": total_tickets,
        "open_count": open_count,
        "in_progress_count": in_progress_count,
        "pending_count": pending_count,
        "resolved_count": resolved_count,
        "closed_count": closed_count,
        "active_count": open_count + in_progress_count + pending_count,
        "resolution_rate": resolution_rate,
        "avg_response_label": avg_response_label,
        "sla_compliance": {
            "csat": csat,
            "ratings_count": csat_count,
        },
        "tickets_by_status": tickets_by_status,
        "tickets_by_priority": tickets_by_priority,
        "tickets_by_category": tickets_by_category,
        "recent_activity": recent_activity,
    }

import asyncio
from sqlalchemy import select
from backend.app.database import AsyncSessionLocal
from backend.app.core.supabase_client import supabase_admin
from backend.app.models.department import Department
from backend.app.models.category import Category
from backend.app.models.sla_policy import SLAPolicy
from backend.app.models.user import User
from backend.app.models.enums import TicketPriority, UserRole

DEPARTMENTS = [
    "Technical Operations",
    "Billing & Finance",
    "Customer Experience",
    "Sales & Growth",
    "Administration & People",
    "Product Operations",
    "Service Reliability",
]

CATEGORIES = [
    "Billing and Payments",
    "Customer Service",
    "General Inquiry",
    "Human Resources",
    "IT Support",
    "Product Support",
    "Returns and Exchanges",
    "Sales and Pre-Sales",
    "Service Outages and Maintenance",
    "Technical Support",
]


SLA_POLICIES = [
    (TicketPriority.low, 480, 4320),
    (TicketPriority.medium, 240, 1440),
    (TicketPriority.high, 60, 480),
]

ADMIN_EMAIL = "admin@test.com"
ADMIN_PASSWORD = "Admin@123456"


async def seed():
    async with AsyncSessionLocal() as db:
        # Departments
        for name in DEPARTMENTS:
            exists = await db.execute(select(Department).where(Department.name == name))
            if not exists.scalar_one_or_none():
                db.add(Department(name=name))
        await db.commit()
        
        # Categories
        for name in CATEGORIES:
            exists = await db.execute(select(Category).where(Category.name == name))
            if not exists.scalar_one_or_none():
                db.add(Category(name=name))
        await db.commit()


        # SLA Policies
        for priority, resp, resol in SLA_POLICIES:
            exists = await db.execute(select(SLAPolicy).where(SLAPolicy.priority == priority))
            if not exists.scalar_one_or_none():
                db.add(SLAPolicy(priority=priority, response_minutes=resp, resolution_minutes=resol))
        await db.commit()

        # Admin user (cross-department — no department_id)
        existing_admin = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        if not existing_admin.scalar_one_or_none():
            try:
                auth_res = supabase_admin.auth.admin.create_user({
                    "email": ADMIN_EMAIL,
                    "password": ADMIN_PASSWORD,
                    "email_confirm": True,
                })
                admin_id = auth_res.user.id
                admin_email = auth_res.user.email
            except Exception as e:
                if "already been registered" in str(e):
                    # Auth user exists from a previous run — find it and reuse its id
                    users_list = supabase_admin.auth.admin.list_users()
                    match = next((u for u in users_list if u.email == ADMIN_EMAIL), None)
                    if not match:
                        raise RuntimeError(f"Admin auth user exists but could not be found via list_users(): {e}")
                    admin_id = match.id
                    admin_email = match.email
                else:
                    raise

            if not admin_email:
                raise RuntimeError("Could not resolve an email for the admin user.")

            db.add(User(
                id=admin_id,
                email=admin_email,
                password_hash="MANAGED_BY_SUPABASE_AUTH",
                role=UserRole.admin,
                department_id=None,
            ))
            await db.commit()
            print(f"Admin user created: {ADMIN_EMAIL} / {ADMIN_PASSWORD} (cross-department)")
        else:
            print("Admin user already exists, skipping.")


if __name__ == "__main__":
    asyncio.run(seed())
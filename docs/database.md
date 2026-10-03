# Database Architecture

PostgreSQL 15+ hosted on Supabase. Asynchronous database connectivity is handled via **SQLAlchemy 2.0** with **asyncpg**. Schema revisions and DDL migrations are strictly managed through **Alembic**.

- **Connection String**: `DATABASE_URL` (`postgresql+asyncpg://...`)
- **Migration Command**: `alembic upgrade head`
- **File Storage**: Object storage is offloaded to the Supabase Storage bucket `ticket-attachments`. Only file metadata is persisted in the PostgreSQL database.

---

## 1. Table Catalog

| Table | Description | Primary Key | Foreign Keys / Targets |
|-------|-------------|-------------|------------------------|
| `departments` | Organizational divisions (Support, Technical, Billing, etc.) | `id` (UUID) | None |
| `users` | Unified profiles for customers, agents, and admins (synced with Supabase Auth) | `id` (UUID) | `department_id` -> `departments.id`, `invited_by` -> `users.id` |
| `sla_policies` | Service-Level Agreement response and resolution targets per priority | `id` (UUID) | None |
| `tickets` | Customer inquiries with PII-redacted text and AI metadata | `id` (UUID) | `customer_id` -> `users.id`, `department_id` -> `departments.id`, `assigned_agent_id` -> `users.id` |
| `sla_state` | Real-time SLA compliance tracking per ticket | `id` (UUID) | `ticket_id` -> `tickets.id`, `sla_policy_id` -> `sla_policies.id` |
| `replies` | Conversational messages and system audit logs | `id` (UUID) | `ticket_id` -> `tickets.id`, `author_id` -> `users.id` |
| `attachments` | Metadata for uploaded ticket files | `id` (UUID) | `ticket_id` -> `tickets.id` |
| `ticket_ratings` | Post-resolution Customer Satisfaction (CSAT) ratings (1 to 5) | `id` (UUID) | `ticket_id` -> `tickets.id` |

---

## 2. PostgreSQL Enums

```sql
-- Role allocation
CREATE TYPE user_role AS ENUM ('customer', 'agent', 'admin');

-- Staff hierarchy (NULL for customer and admin)
CREATE TYPE agent_tier AS ENUM ('1', '2');  -- '1' = Regular Agent, '2' = Department Manager

-- Ticket categorization & urgency
CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high');

-- Ticket resolution states
CREATE TYPE ticket_status AS ENUM (
    'open',
    'in_progress',
    'pending',
    'resolved',
    'closed',
    'human_review'
);

-- AI sentiment analysis
CREATE TYPE ticket_sentiment AS ENUM ('positive', 'neutral', 'negative');
```

---

## 3. Complete DDL Schema

```sql
-- 1. Departments
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL UNIQUE
);

-- 2. Users (synchronized with Supabase Auth auth.users)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR NOT NULL UNIQUE,
    password_hash VARCHAR NOT NULL,
    role user_role NOT NULL DEFAULT 'customer',
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    agent_tier agent_tier,                             -- '1' for Agent, '2' for Manager, NULL for customer/admin
    is_active BOOLEAN NOT NULL DEFAULT true,           -- Customer active vs. banned
    is_archive BOOLEAN NOT NULL DEFAULT false,         -- Staff active vs. deactivated/archived
    phone_number VARCHAR(20) UNIQUE,
    first_name VARCHAR,
    last_name VARCHAR,
    must_change_password BOOLEAN NOT NULL DEFAULT false,
    password_changed_at TIMESTAMPTZ,
    invited_at TIMESTAMPTZ,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. SLA Policies
CREATE TABLE sla_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    priority ticket_priority NOT NULL UNIQUE,
    response_minutes INTEGER NOT NULL,
    resolution_minutes INTEGER NOT NULL
);

-- 4. Tickets
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    assigned_agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
    priority ticket_priority,
    sentiment ticket_sentiment,
    status ticket_status NOT NULL DEFAULT 'open',
    subject VARCHAR NOT NULL,
    body_redacted VARCHAR NOT NULL,                     -- Redacted body text with PII replaced
    classification_confidence NUMERIC(4, 3),            -- Confidence score from 0.000 to 1.000
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. SLA State (Real-time tracking per ticket)
CREATE TABLE sla_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    sla_policy_id UUID NOT NULL REFERENCES sla_policies(id) ON DELETE CASCADE,
    response_due_at TIMESTAMPTZ NOT NULL,
    resolution_due_at TIMESTAMPTZ NOT NULL,
    first_response_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    breached BOOLEAN NOT NULL DEFAULT false,
    escalated_at TIMESTAMPTZ
);

-- 6. Replies & Audit Logs
CREATE TABLE replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    is_system_log BOOLEAN NOT NULL DEFAULT false,
    body VARCHAR NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Attachment Metadata (Stored in Supabase bucket 'ticket-attachments')
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100),
    file_size BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Customer Satisfaction Ratings (CSAT)
CREATE TABLE ticket_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    feedback VARCHAR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 4. Performance Indexes

The following indexes are applied to prevent table scans on high-traffic filter and query paths:

```sql
-- Customer portal ticket history listing
CREATE INDEX idx_tickets_customer_created ON tickets (customer_id, created_at DESC);

-- Agent dashboard assigned queue filtering
CREATE INDEX idx_tickets_assigned_agent_status ON tickets (assigned_agent_id, status);

-- Department triage and unassigned ticket pool
CREATE INDEX idx_tickets_department_status ON tickets (department_id, status);

-- Analytics & status filtering
CREATE INDEX idx_tickets_status ON tickets (status);

-- Analytics priority filtering
CREATE INDEX idx_tickets_priority ON tickets (priority);

-- Thread history query optimization
CREATE INDEX ix_replies_ticket_id ON replies (ticket_id);

-- Attachment listing per ticket
CREATE INDEX ix_attachments_ticket_id ON attachments (ticket_id);
```

---

## 5. Business Logic & Constraints

### PII Redaction Guarantee

Ticket text passes through regex sanitizers before persistence. Credit card numbers, phone numbers, and SSNs are replaced by `<acc_num>`, `<tel_num>`, etc.

### Customer Ban vs. Staff Archive

- **Customers:** Managed via `is_active` (`True` = Active, `False` = Banned). A banned customer is blocked from login and their active browser sessions are auto-terminated with a `403 Forbidden` response.
- **Staff (Agents & Admins):** Managed via `is_archive` (`True` = Deactivated). Staff accounts can only be provisioned by administrator invitation (`/invite-agent`).

### Single Manager per Department

Each department can have at most one Tier 2 Manager (`agent_tier = '2'`). Promoting an agent to Manager automatically demotes the department's existing manager to Tier 1 (`agent_tier = '1'`).

### AI Triage & Review Safeguards

- If AI classification confidence is `< 0.50` or classification fails, status defaults to `human_review` with `priority = 'medium'` and `sentiment = 'neutral'`.
- **High-risk ticket routing:** A ticket with `priority = 'high'` AND `sentiment = 'negative'` is automatically escalated directly to the department's Tier 2 Manager with status `in_progress`.

### Default SLA Targets

| Priority | First Response Deadline | Resolution Deadline |
|----------|-------------------------|---------------------|
| High | 60 minutes | 480 minutes (8 hours) |
| Medium | 240 minutes (4 hours) | 1,440 minutes (24 hours) |
| Low | 480 minutes (8 hours) | 4,320 minutes (72 hours) |

### Foreign Key Cascade Policy

- Deleting a ticket cascades and deletes its `sla_state`, `replies`, `attachments`, and `ticket_ratings`.
- Deleting a customer cascades and deletes their tickets.
- Deleting a staff user or department sets foreign key references on tickets/replies to `NULL`.

---

## 6. Engine & Pooler Configuration

The SQLAlchemy async engine (`backend/app/database.py`) is specially tuned for cloud PostgreSQL connection poolers (PgBouncer / Supabase Transaction Mode):

```python
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
    pool_pre_ping=True,      # Tests connection before checkout to prevent dead-socket errors
    pool_recycle=300,        # Recycles sockets every 5 minutes to prevent cloud firewall disconnects
    pool_size=10,            # Base pool connections maintained
    max_overflow=20,         # Maximum extra connections for peak burst traffic
    connect_args={
        "statement_cache_size": 0,           # Disables asyncpg statement caching for PgBouncer
        "prepared_statement_cache_size": 0,  # Required for Supabase port 6543 (transaction mode)
    },
)
```

### Environment Variables

| Variable | Description | Example / Recommended |
|----------|-------------|-----------------------|
| `DATABASE_URL` | Async PostgreSQL connection URI | `postgresql+asyncpg://postgres:[PASSWORD]@[HOST]:6543/postgres` |
| `SUPABASE_URL` | Supabase project endpoint | `https://[PROJECT_ID].supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key for auth syncing and storage buckets | `eyJhbGciOi...` |
| `SUPABASE_STORAGE_BUCKET` | Destination bucket for attachments | `ticket-attachments` |

---

## 7. Database Operations & Verification

Run pending migrations:

```bash
alembic upgrade head
```

Inspect current migration head:

```bash
alembic current
```

Create new migration after model edits:

```bash
alembic revision --autogenerate -m "describe_change"
```

**Verify PII scrubbing:** Submit a ticket with a raw phone number (`9876543210`) or credit card number in the body. Verify in the database that `body_redacted` contains `<tel_num>` or `<acc_num>`.
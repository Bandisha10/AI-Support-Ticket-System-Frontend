# Database — Deskwise

PostgreSQL 15+ on Supabase. Async access via SQLAlchemy 2.0 + asyncpg. Schema managed by Alembic.

- Connection: `DATABASE_URL` (`postgresql+asyncpg://...`)
- Migrate: `alembic upgrade head`
- Files: Supabase Storage bucket `ticket-attachments`. Only metadata is in the DB.

## Tables

| Table | Purpose |
|-------|---------|
| `departments` | Support departments |
| `users` | Customers, agents, managers, admins (synced with Supabase Auth) |
| `sla_policies` | Response/resolution minutes per priority |
| `tickets` | Tickets with redacted body and AI results |
| `sla_state` | Per-ticket SLA deadlines and breach state |
| `replies` | Public replies and internal notes |
| `attachments` | File metadata |
| `ticket_ratings` | CSAT rating (1–5) |

```text
departments ─< users ─< tickets >─ sla_state >─ sla_policies
                          ├─< replies
                          ├─< attachments
                          └── ticket_ratings (1:1)
```

## Enums

```sql
CREATE TYPE user_role AS ENUM ('customer', 'agent', 'admin');
CREATE TYPE agent_tier AS ENUM ('1', '2');  -- 1 = Regular, 2 = Manager
CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'pending', 'resolved', 'closed', 'human_review');
CREATE TYPE ticket_sentiment AS ENUM ('positive', 'neutral', 'negative');
```

## Schema

```sql
-- 1. Departments
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Users (synced with Supabase Auth)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    role user_role NOT NULL DEFAULT 'customer',
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    agent_tier agent_tier,  -- NULL for customer/admin, '1' agent, '2' manager
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_archive BOOLEAN NOT NULL DEFAULT false,
    must_change_password BOOLEAN NOT NULL DEFAULT false,
    password_changed_at TIMESTAMPTZ,
    phone_number VARCHAR(20) UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    invited_at TIMESTAMPTZ,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. SLA policies
CREATE TABLE sla_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    priority ticket_priority UNIQUE NOT NULL,
    response_minutes INT NOT NULL,
    resolution_minutes INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tickets
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    assigned_agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
    priority ticket_priority NOT NULL,
    sentiment ticket_sentiment DEFAULT 'neutral',
    status ticket_status NOT NULL DEFAULT 'open',
    subject VARCHAR(255) NOT NULL,
    body_redacted TEXT NOT NULL,
    classification_confidence NUMERIC(4,3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. SLA state (per-ticket tracking)
CREATE TABLE sla_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID UNIQUE NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    sla_policy_id UUID NOT NULL REFERENCES sla_policies(id) ON DELETE CASCADE,
    response_due_at TIMESTAMPTZ NOT NULL,
    resolution_due_at TIMESTAMPTZ NOT NULL,
    first_response_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    breached BOOLEAN NOT NULL DEFAULT false,
    escalated_at TIMESTAMPTZ
);

-- 6. Replies and internal notes
CREATE TABLE replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    is_auto_reply BOOLEAN NOT NULL DEFAULT false,
    is_internal_note BOOLEAN NOT NULL DEFAULT false,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Attachment metadata (files live in Supabase Storage)
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100),
    file_size BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. CSAT ratings
CREATE TABLE ticket_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID UNIQUE NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Indexes

```sql
CREATE INDEX idx_tickets_customer_created ON tickets (customer_id, created_at DESC);
CREATE INDEX idx_tickets_assigned_agent_status ON tickets (assigned_agent_id, status);
CREATE INDEX idx_tickets_department_status ON tickets (department_id, status);
CREATE INDEX idx_tickets_status ON tickets (status);
CREATE INDEX idx_tickets_priority ON tickets (priority);
CREATE INDEX idx_replies_ticket ON replies (ticket_id, created_at ASC);
CREATE INDEX idx_attachments_ticket ON attachments (ticket_id);
```

## Data Rules

- **No raw PII stored.** `body_redacted` holds text after regex scrubbing.
- **One Manager per department.** Enforced in code by `validate_single_department_manager()`. Promoting a new Manager demotes the old one.
- **Low confidence goes to review.** If `classification_confidence < 0.50`, status is `human_review`.
- **High-risk ticket** = `priority = high` AND `sentiment = negative`. It is assigned to the Department Manager with status `in_progress`.
- **AI failure fallback:** `status = human_review`, `department_id = NULL`, `priority = medium`, `sentiment = neutral`, `classification_confidence = 0.50`.
- **SLA times** are UTC timestamp math on `sla_policies` values. Alert dedup uses `sla_state.escalated_at` and `sla_state.breached`.
- **Default SLA policy:**

| Priority | Response | Resolution |
|----------|----------|------------|
| High | 60 min | 480 min |
| Medium | 240 min | 1,440 min |
| Low | 480 min | 4,320 min |

- **Cascades:** deleting a ticket removes its SLA state, replies, attachments, and rating. Deleting a user or department sets references to `NULL`, except `tickets.customer_id`, which cascades.

## DB-Related Settings

| Variable | Required | Purpose |
|----------|:-:|---------|
| `DATABASE_URL` | Yes | Async PostgreSQL URI |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | User management and storage |
| `SUPABASE_STORAGE_BUCKET` | No | Attachment bucket (default `ticket-attachments`) |

## Verify

- `alembic upgrade head` runs with zero errors.
- Submit a ticket with a raw phone number or card. DB must show `<tel_num>` or `<acc_num>`.
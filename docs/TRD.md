# Technical Requirements Document — Deskwise

AI-based customer support ticket system. Version 1.0.0.
Database details are in [database.md](database.md). Roles are in [ROLES.md](ROLES.md).

| Attribute | Value |
|-----------|-------|
| Runtime | Python 3.10+, Node.js 18+ |
| Deployment | Container (FastAPI + ONNX Runtime on CPU) + Vite/React SPA |
| API docs | https://ai-based-customer-support-ticket-system.onrender.com/docs |

## 1. Architecture

Single-process FastAPI backend plus a React SPA. Ticket triage runs local INT8 ONNX models. No external LLM API. Total container memory stays under 512MB.

```text
React 18 + Vite SPA (Customer / Agent / Manager / Admin portals)
        │  HTTPS, Axios with mutex JWT refresh
        ▼
FastAPI worker
  ├─ Middleware: CORS whitelist, ForceHTTPS (HSTS), security headers, SlowAPI,
  │              dual JWT check, first-login password gate
  ├─ Services:   ticket, reply, auth, user, manager, storage, analytics, sla
  ├─ NLP:        PII redaction → ONNX inference → threshold routing → high-risk escalation
  └─ Workers:    SLA monitor (60s loop), mailer (Brevo API + SMTP fallback)
        │  SQLAlchemy 2.0 (asyncpg)
        ▼
Supabase PostgreSQL + Storage
```

### Core Rules

1. **Lightweight inference.** `onnxruntime` on CPU with `intra_op_num_threads = 1`. No PyTorch. Prevents out-of-memory on free container tiers such as Render.
2. **Model preloading.** Models are preloaded at startup via `preload_models()` to eliminate cold-start inference lag.
3. **Model vs. deterministic split.**
   - Model: department, priority, sentiment.
   - Deterministic: department mapping (SQL lookup), SLA deadlines, RBAC, Manager escalation.
4. **No raw PII stored or logged.** Text is scrubbed before tokenization and before any database write.
5. **Human review gate.** Confidence below 0.50 sets status `human_review` and `needs_triage = True`.
6. **High-risk ticket** = High priority AND Negative sentiment. It goes to the Department Manager and regular agents cannot claim it.
7. **One Manager per department**, enforced by `validate_single_department_manager()`.

## 2. Tech Stack

### Backend

| Component | Technology | Version |
|-----------|-----------|---------
| Framework | FastAPI / Starlette | ^0.115.0 / ^0.38.0 |
| Server | Uvicorn | ^0.30.0 |
| DB driver / ORM | asyncpg / SQLAlchemy async | ^0.29.0 / ^2.0.0 |
| Migrations | Alembic | ^1.13.0 |
| Security | cryptography, pyjwt, argon2-cffi | ^43.0.0, ^2.9.0, ^23.1.0 |
| Rate limiting | slowapi | ^0.1.9 |
| Error tracking | sentry-sdk | ^2.0.0 |

### ML / Inference

| Component | Technology | Purpose |
|-----------|-----------|---------
| Engine | onnxruntime (CPU) | Fast, low-memory INT8 inference |
| Tokenizer | `transformers.AutoTokenizer` | Truncates at `max_length=512` |
| Model download | `huggingface_hub.hf_hub_download` | Downloads and caches ONNX files |
| Format | `model_quantized.onnx` | ~60MB per model vs ~260MB fp32 |

### Frontend

| Component | Technology | Version |
|-----------|-----------|---------
| Framework / build | React + Vite | 18.3.1 / ^5.4.0 |
| Styling | Tailwind CSS, PostCSS | ^3.4.0 / ^8.4.0 |
| Icons | lucide-react | ^0.446.0 |
| HTTP | Axios (mutex interceptors) | ^1.7.0 |
| Routing | React Router DOM | ^6.26.0 |
| Dates | date-fns | ^3.6.0 |

### External Services

- Supabase: PostgreSQL 15+, GoTrue Auth, Storage
- Brevo API v3 for email, with SMTP fallback (port 587, StartTLS)
- Hugging Face Hub: `pratik14212/*` models

## 3. NLP Pipeline

1. **PII redaction** (regex, synchronous).
2. **Tokenize** (max 512 tokens, int64 NumPy tensors).
3. **ONNX inference**, three models. Softmax gives top class and confidence.
4. **Threshold routing.**
   - Confidence >= 0.50: status `open`, department from SQL lookup of the label.
   - Otherwise: status `human_review`, `needs_triage = True`.
5. **High-risk check.** If High + Negative and the department has an active Manager: assign to Manager, status `in_progress`, add internal audit note, send alert email.

```python
def _is_high_risk(priority: TicketPriority, sentiment: TicketSentiment) -> bool:
    """A ticket is high-risk iff it is BOTH high priority AND negative sentiment."""
    return priority == TicketPriority.high and sentiment == TicketSentiment.negative
```

### PII Patterns

| Type | Regex | Replacement |
|------|-------|-------------|
| Email | standard email pattern | `<email>` |
| Card | `(?<!\w)(?:\d[ -]*?){13,19}(?!\w)` | `<acc_num>` |
| Phone | `(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)` | `<tel_num>` |

### Models

| Task | Model | Classes |
|------|-------|---------|
| Department | `pratik14212/deskwise-departments` | Administration & People, Billing & Finance, Customer Experience, Product Operations, Sales & Growth, Service Reliability, Technical Operations |
| Priority | `pratik14212/deskwise-priorities` | low, medium, high |
| Sentiment | `pratik14212/deskwise-sentiments` | positive, neutral, negative |

## 4. Security

### JWT Verification
- **Primary:** RS256/ES256 tokens, verified with public keys from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Keys are cached 600s with thread locks.
- **Fallback:** HS256 tokens, verified with `SUPABASE_JWT_SECRET`.
- **Expired token:** HTTP 401 with header `Token-Expired: true`.

### Frontend Token Refresh (Axios)
1. Interceptor catches HTTP 401.
2. If `isRefreshing` is true, queue the request in `failedQueue`.
3. Otherwise set `isRefreshing = true` and call `POST /auth/refresh`.
4. On success, replay queued requests with the new token.
5. On failure, clear auth state and redirect to `/login`.

### Passwords and Invites
- Invites are limited to `@ritgoa.ac.in`, `@aiemgoa.ac.in`, `@pccegoa.edu.in`.
- New invitees have `must_change_password = True`. Every endpoint except `/auth/change-password`, `/auth/me`, `/auth/logout` returns 403 until they change it.
- Password reset tokens issued before `password_changed_at` are rejected.

### File Uploads
- Max 5MB (5,242,880 bytes).
- Allowed: `.png`, `.jpg`, `.jpeg`, `.webp`, `.pdf`, `.doc`, `.docx`, `.txt`.
- Filenames sanitized with `re.sub(r"[^a-zA-Z0-9_.-]", "_", base_name)` to block path traversal.
- Delivery through signed URLs or authenticated backend streaming.

## 5. Services and API

### Services (`backend/app/services/`)

| File | Job |
|------|-----|
| `ticket_service.py` | Create tickets, run AI, escalate, update lifecycle |
| `reply_service.py` | Replies, auto-replies, internal notes |
| `auth_service.py` | Login, JWT, profile, password reset |
| `user_service.py` | Invites, domain whitelist, availability, archiving |
| `manager_service.py` | Manager lookup, succession, reassignment on absence |
| `storage_service.py` | Sanitize files, upload, signed URLs, streaming |
| `analytics_service.py` | Response times, resolution rates, distributions, agent KPIs |
| `sla_service.py` | SLA monitor worker, breach detection, escalation alerts |

### Endpoints

| Method | Path | Access | Summary |
|--------|------|--------|---------|
| POST | `/auth/signup` | Public | Customer registration |
| POST | `/auth/login` | Public | Login (JWT + refresh cookie) |
| POST | `/auth/refresh` | Public | New JWT from refresh cookie |
| POST | `/auth/logout` | Authenticated | Logout and revoke session |
| GET | `/auth/me` | Authenticated | Current user profile |
| PUT | `/auth/me` | Authenticated | Update own profile |
| POST | `/auth/change-password` | Authenticated | Mandatory first-login change |
| POST | `/auth/forgot-password` | Public | Request reset link |
| GET | `/auth/verify-reset-token` | Public | Verify reset token |
| POST | `/auth/reset-password` | Public | Reset password with token |
| POST | `/tickets/` | Authenticated | Create ticket: scrub, infer, escalate |
| GET | `/tickets/` | Role-filtered | List by status, priority, department, triage, date |
| GET | `/tickets/{id}` | Role-gated | Detail with replies, attachments, SLA |
| PUT | `/tickets/{id}` | Agent / Admin | Update status or reassign |
| DELETE | `/tickets/{id}` | Admin | Delete ticket |
| POST | `/tickets/{id}/attachments` | Role-gated | Upload files (max 5MB) |
| GET | `/tickets/{id}/attachments` | Role-gated | List ticket attachments |
| GET | `/tickets/{id}/attachments/{filename}` | Role-gated | Download attachment |
| POST | `/tickets/{id}/rate` | Customer | CSAT 1–5 on resolved ticket |
| GET | `/tickets/analytics` | Agent / Admin | SLA, volume, response metrics |
| GET | `/tickets/analytics/agent` | Agent / Admin | Agent KPIs |
| POST | `/replies/` | Role-gated | Public reply or internal note |
| GET | `/replies/ticket/{ticket_id}` | Role-gated | List replies for a ticket |
| GET | `/replies/{id}` | Authenticated | Get a single reply |
| DELETE | `/replies/{id}` | Admin | Delete a reply |
| POST | `/users/invite-agent` | Admin | Whitelisted invite with tier |
| GET | `/users/` | Admin | List all users |
| GET | `/users/{id}` | Admin | Get user details |
| PUT | `/users/{id}` | Admin | Update user |
| DELETE | `/users/{id}` | Admin | Archive user |
| POST | `/users/{id}/archive` | Admin | Archive user |
| POST | `/users/{id}/unarchive` | Admin | Unarchive user |
| PATCH | `/users/{id}/availability` | Admin / Manager | Toggle active, reroute tickets |
| GET | `/users/department/team` | Admin / Manager | Team with workload counts |
| POST | `/departments/` | Admin | Create department |
| GET | `/departments/` | Authenticated | Departments and ticket counts |
| GET | `/departments/{id}` | Authenticated | Get department |
| PUT | `/departments/{id}` | Admin | Update department |
| DELETE | `/departments/{id}` | Admin | Delete department |
| POST | `/sla-policies/` | Admin | Create SLA policy |
| GET | `/sla-policies/` | Authenticated | SLA thresholds |
| GET | `/sla-policies/{id}` | Authenticated | Get SLA policy |
| PUT | `/sla-policies/{id}` | Admin | Update SLA policy |
| DELETE | `/sla-policies/{id}` | Admin | Delete SLA policy |
| GET | `/health` | Public | Liveness probe |

## 6. Workflows

### SLA Monitor (`sla_monitor_worker`)
Runs as `asyncio.create_task()` every 60 seconds.
- **Stage 1 (80% elapsed):** add internal warning note, email Department Manager.
- **Stage 2 (100%, breached):** set `breached = True`, add critical note, email Department Manager.
- Deduplicated with `escalated_at` and `breached` in `sla_state`.

### Escalation and Delegation
- **At ingestion:** High + Negative goes to the Manager, `in_progress`, with note and email.
- **Mid-lifecycle:** a ticket that becomes High + Negative is reassigned to the Manager.
- **Agent absence:** deactivating an agent moves their open tickets to the Manager.
- **Succession:** promoting a new Manager demotes the old one and moves tickets to the new one.
- **Delegation:** Managers and Admins assign tickets to department agents. This adds an audit note and sends an email.

### Frontend Notifications
- Stored per user: `localStorage["deskwise_notifications_${userId}"]` via `NotificationContext.jsx`. Prevents cross-account leaks.
- Polls every 30 seconds and diffs for new tickets, status changes, assignments, activity, and SLA breaches.

## 7. Non-Functional Requirements

| Area | Requirement |
|------|-------------|
| Memory | Peak under 512MB on single-dyno/free platforms |
| Inference | Under 100ms per classification on CPU |
| Boot | Models preloaded at startup via `preload_models()`. |
| REST latency | p95 under 200ms for core ticket and conversation endpoints |
| AI failure | Ticket falls back to `human_review`, no department, `medium` priority, `neutral` sentiment, confidence 0.50 |
| Mail failure | Log a warning. Do not abort the transaction or return HTTP 500. |
| Health | `GET /health` for uptime monitors and liveness probes |

## 8. Environment Variables

| Variable | Required | Description |
|----------|:-:|-------------|
| `DATABASE_URL` | Yes | Async PostgreSQL URI |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | User management and storage |
| `SUPABASE_JWT_SECRET` | Yes | HS256 fallback secret |
| `SUPABASE_STORAGE_BUCKET` | No | Default `ticket-attachments` |
| `FRONTEND_URL` | Yes | Allowed CORS origin, e.g. `http://localhost:5173` |
| `FORCE_HTTPS` | No | SSL redirect and HSTS (default `False`) |
| `DEBUG` | No | Debug mode (default `False`) |
| `APP_NAME` | No | Application name (default `Deskwise`) |
| `ALLOW_PUBLIC_SIGNUP` | No | Allow public customer registration (default `True`) |
| `ENFORCE_PASSWORD_CHANGE` | No | Require first-login password change (default `True`) |
| `MIN_PASSWORD_LENGTH` | No | Minimum password length (default `8`) |
| `MAX_PASSWORD_LENGTH` | No | Maximum password length (default `16`) |
| `BREVO_API_KEY` | No | Brevo REST key |
| `SMTP_HOST` / `SMTP_PORT` | No | Relay `smtp-relay.brevo.com` / `587` |
| `SMTP_USER` / `SMTP_PASSWORD` | No | SMTP credentials |
| `MAIL_FROM` | No | Sender (default `deskwise.support@gmail.com`) |
| `MAIL_FROM_NAME` | No | Sender display name (default `Deskwise Support`) |
| `MAIL_REPLY_TO` | No | Reply-to address |
| `HF_TOKEN` | No | Hugging Face download token |
| `SENTRY_DSN` | No | Sentry error tracking |
| `SENTRY_ENVIRONMENT` | No | Sentry environment tag (default `development`) |
| `SENTRY_TRACES_SAMPLE_RATE` | No | Sentry trace sample rate (default `1.0`) |
| `VITE_SUPABASE_URL` | Yes* | Frontend Supabase URL (*frontend .env) |
| `VITE_SUPABASE_ANON_KEY` | Yes* | Frontend Supabase anon key (*frontend .env) |

## 9. Test Plan

| Scope | Command / Step | Pass Criteria |
|-------|----------------|---------------|
| Smoke | `python smoke_test.py` | `/health` and endpoints registered |
| Inference | `python backend/app/ai/classify_ticket.py` | ONNX runs on CPU, PII redacted, under 100ms |
| Migrations | `alembic upgrade head` | No errors |
| Unit/integration | `pytest backend/tests` | All pass |
| PII | Submit ticket with raw phone/card | DB shows `<tel_num>` / `<acc_num>` |
| High-risk | Submit High + Negative ticket | Assigned to Manager with audit note |
| SLA | Simulate SLA expiry | Note created, Manager alerted at 80% and 100% |
| Attachments | `POST /tickets/{id}/attachments` | Stored in Supabase, signed URL works |

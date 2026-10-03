# Technical Requirements Document

- Database details: [database.md](database.md)
- Roles: [ROLES.md](ROLES.md)

| Attribute | Value |
|-----------|-------|
| Runtime | Python 3.10+, Node.js 18+ |
| Deployment | Container (FastAPI + ONNX Runtime on CPU) + Vite/React SPA |
| API docs | https://ai-based-customer-support-ticket-system.onrender.com/docs |

---

## 1. Architecture

Single-process FastAPI backend coupled with a React SPA. Ticket triage runs local INT8 ONNX models without external LLM dependencies, keeping container memory usage strictly below 512MB.

```text
React 18 + Vite SPA (Customer / Agent / Manager / Admin portals)
        │  HTTPS, Axios with mutex JWT refresh & 403 auto-ejection
        ▼
FastAPI worker
  ├─ Middleware: CORS whitelist, ForceHTTPS (HSTS), security headers, SlowAPI,
  │              dual JWT check (RS256 JWKS / HS256), first-login password gate
  ├─ Services:   ticket, reply, auth, user, manager, storage, analytics, sla
  ├─ JIT Auth:   OAuth provisioning + staff domain shielding with Supabase cleanup
  ├─ NLP:        PII redaction → ONNX inference → threshold routing → high-risk escalation
  └─ Workers:    SLA monitor (60s loop), mailer (Brevo API + SMTP fallback)
        │  SQLAlchemy 2.0 (asyncpg)
        ▼
Supabase PostgreSQL + Storage
```

### Core Invariants

- **Lightweight inference.** `onnxruntime` runs on CPU with `intra_op_num_threads = 1`. No PyTorch dependencies, which prevents out-of-memory errors on containers with 512MB RAM caps.
- **Model preloading.** Classification models are preloaded at application startup via `preload_models()` to ensure zero cold-start latency on incoming tickets.
- **Model vs. deterministic boundary.**
  - Model: department (7 classes), priority (3 classes), sentiment (3 classes).
  - Deterministic: department mapping (SQL lookup), SLA computation, RBAC, Manager escalation, state transitions.
- **Zero raw PII storage.** Sensitive data is scrubbed before tokenization and database persistence.
- **Human review gate.** Predictions with confidence < 0.50 assign status `human_review` and `needs_triage = True`.
- **High-risk ticket escalation.** High Priority AND Negative Sentiment automatically routes to the Department Manager. Standard agents are prohibited from claiming it.
- **One Manager per department.** Enforced by `validate_single_department_manager()`.
- **App shell persistence.** Synchronous `localStorage` hydration in `AuthContext.jsx` and `<Outlet />` nesting in `ProtectedRoute.jsx` keep the Sidebar and Header mounted across transitions without loading flickers.
- **Route ordering safety.** Static route definitions (`/users/customers/summary`, `/users/department/team`) must precede parameter paths (`/users/{id}`) to prevent 422 UUID conversion errors.

---

## 2. Tech Stack

### Backend

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | FastAPI / Starlette | ^0.115.0 / ^0.38.0 |
| Server | Uvicorn | ^0.30.0 |
| DB driver / ORM | asyncpg / SQLAlchemy async | ^0.29.0 / ^2.0.0 |
| Migrations | Alembic | ^1.13.0 |
| Security | cryptography, pyjwt, argon2-cffi | ^43.0.0, ^2.9.0, ^23.1.0 |
| Rate limiting | slowapi | ^0.1.9 |
| Error tracking | sentry-sdk | ^2.0.0 |

### ML / Inference

| Component | Technology | Purpose |
|-----------|------------|---------|
| Engine | onnxruntime (CPU) | Sub-100ms INT8 inference without GPU |
| Tokenizer | `transformers.AutoTokenizer` | Fast tokenization truncated to `max_length=512` |
| Distribution | `huggingface_hub.hf_hub_download` | Downloads and caches quantized models |
| Artifacts | `model_quantized.onnx` | ~60MB per model (approx. 75% memory reduction vs fp32) |

### Frontend

| Component | Technology | Version |
|-----------|------------|---------|
| Framework / build | React + Vite | 18.3.1 / ^5.4.0 |
| Styling | Tailwind CSS, PostCSS | ^3.4.0 / ^8.4.0 |
| Icons | lucide-react | ^0.446.0 |
| HTTP client | Axios (mutex token refresh & 403 handler) | ^1.7.0 |
| Routing | React Router DOM | ^6.26.0 |
| Dates | date-fns | ^3.6.0 |

### External Services

- **Supabase:** PostgreSQL 15+, GoTrue Auth, Storage (`ticket-attachments`).
- **Brevo API v3:** Transactional emails with SMTP fallback (port 587, StartTLS).
- **Hugging Face Hub:** Host repository for `pratik14212/*` quantized models.

---

## 3. NLP Pipeline

1. **PII redaction** (synchronous regex pass).
2. **Tokenization** (capped at 512 tokens, int64 NumPy arrays).
3. **ONNX inference** (three concurrent models; softmax calculates distribution and confidence).
4. **Threshold routing:**
   - Confidence >= 0.50: status `open`, department resolved via database lookup.
   - Confidence < 0.50: status `human_review`, `needs_triage = True`.
5. **High-risk evaluation:** If High Priority AND Negative Sentiment with an active Manager: auto-assign to Manager, status `in_progress`, write internal audit note, dispatch alert email.

```python
def _is_high_risk(priority: TicketPriority, sentiment: TicketSentiment) -> bool:
    """A ticket is high-risk iff it is BOTH high priority AND negative sentiment."""
    return priority == TicketPriority.high and sentiment == TicketSentiment.negative
```

### PII Sanitization Patterns

| Type | Pattern | Replacement |
|------|---------|-------------|
| Email | `[\w.+-]+@[\w-]+\.[\w.-]+` | `<email>` |
| Card | `(?<!\w)(?:\d[ -]*?){13,19}(?!\w)` | `<acc_num>` |
| Phone | `(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)` | `<tel_num>` |

### Inference Models

| Task | Repository | Classes |
|------|------------|---------|
| Department | `pratik14212/deskwise-departments` | Administration & People, Billing & Finance, Customer Experience, Product Operations, Sales & Growth, Service Reliability, Technical Operations |
| Priority | `pratik14212/deskwise-priorities` | low, medium, high |
| Sentiment | `pratik14212/deskwise-sentiments` | positive, neutral, negative |

---

## 4. Security & Authentication Architecture

### 4.1 Dual JWT Verification

- **Primary:** RS256/ES256 asymmetric tokens verified against `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Public keys cached in memory for 600s with thread locks.
- **Fallback:** Symmetric HS256 tokens verified using `SUPABASE_JWT_SECRET`.
- **Expiration:** Returns HTTP 401 with `Token-Expired: true` header.

### 4.2 OAuth JIT Provisioning & Institutional Domain Shielding

Configured in `dependencies.py` via `get_current_user`:

1. When an OAuth token arrives without a matching record in `public.users`, JIT provisioning executes.
2. The email domain is checked against `COMPANY_DOMAINS` (`ritgoa.ac.in`, `aiemgoa.ac.in`, `pccegoa.edu.in`).
3. **If company domain:**
   - Immediately purge the raw user from Supabase Auth (`supabase_admin.auth.admin.delete_user(str(user_id))`) to avoid account collision during formal invites.
   - Raise HTTP 403 Forbidden ("Agent accounts must be created by an administrator").
4. **If standard public domain:** Provision the user with `role = customer`, `is_active = True`.

### 4.3 Account Deactivation & Ban Enforcement

- **Database:** Account status is represented by `is_active: bool`.
- **Backend gateways:** `login_user_workflow`, `refresh_session_workflow`, and `get_current_user` verify `profile.is_active`. Deactivated/banned accounts return HTTP 403 Forbidden.
- **Frontend interceptor (`api.js`):** Catches HTTP 403 errors containing deactivation/ban messages, invokes `clearSessionAndRedirect()`, purges `localStorage`, invalidates the Supabase session, and redirects to `/login`.

### 4.4 Token Refresh Mutex (Axios)

1. Request interceptor catches HTTP 401.
2. If `isRefreshing` is active, the failed request is queued in `failedQueue`.
3. Otherwise set `isRefreshing = true` and invoke `POST /auth/refresh`.
4. On success, resolve `failedQueue` with the new access token.
5. On failure, clear local auth state and redirect to `/login`.

### 4.5 File Upload Safeguards

- **Maximum file size:** 5MB (5,242,880 bytes).
- **Permitted extensions:** `.png`, `.jpg`, `.jpeg`, `.webp`, `.pdf`, `.doc`, `.docx`, `.txt`.
- **Filename sanitization:** `re.sub(r"[^a-zA-Z0-9_.-]", "_", base_name)` to prevent path traversal.
- **Delivery:** Signed URLs or authenticated streaming.

---

## 5. Services & API Catalog

### Service Modules (`backend/app/services/`)

| File | Responsibilities |
|------|------------------|
| `ticket_service.py` | Ingestion, PII scrub, ONNX inference, status machine, escalation |
| `reply_service.py` | Customer/agent replies, internal audit notes, automated triggers |
| `auth_service.py` | Login, token issuance, profile updates, password reset, ban verification |
| `user_service.py` | Member invites, customer ban/unban toggles, team workloads |
| `manager_service.py` | Department manager lookup, absence reassignment, promotion |
| `storage_service.py` | File upload validation, signed URL generation, authenticated streaming |
| `analytics_service.py` | Response/resolution metrics, SLA compliance, KPI tracking |
| `sla_service.py` | Background SLA monitoring worker, warning notes, escalation dispatch |

### Core Endpoints

| Method | Path | Access | Summary |
|--------|------|--------|---------|
| POST | `/auth/signup` | Public | Register customer account |
| POST | `/auth/login` | Public | Authenticate user, return JWT tokens |
| POST | `/auth/refresh` | Public | Rotate access token via refresh token |
| POST | `/auth/logout` | Authenticated | Revoke session and tokens |
| GET | `/auth/me` | Authenticated | Current user profile |
| PUT | `/auth/me` | Authenticated | Update user profile & contact info |
| POST | `/auth/change-password` | Authenticated | First-login password change |
| POST | `/auth/forgot-password` | Public | Send password reset email |
| GET | `/auth/verify-reset-token` | Public | Validate password reset token |
| POST | `/auth/reset-password` | Public | Complete password reset |
| POST | `/tickets/` | Authenticated | Submit ticket (sanitizes PII, runs AI) |
| GET | `/tickets/` | Role-filtered | List tickets with filters & pagination |
| GET | `/tickets/{id}` | Role-gated | Detailed ticket view with replies & SLA |
| PUT | `/tickets/{id}` | Agent / Admin | Update ticket status or assignee |
| DELETE | `/tickets/{id}` | Admin | Delete ticket |
| POST | `/tickets/{id}/attachments` | Role-gated | Upload attachment (max 5MB) |
| GET | `/tickets/{id}/attachments` | Role-gated | List ticket attachments |
| GET | `/tickets/{id}/attachments/{filename}` | Role-gated | Download attachment |
| POST | `/tickets/{id}/rate` | Customer | Submit CSAT rating (1–5★) |
| GET | `/tickets/analytics` | Agent / Admin | Aggregate SLA, volume, and resolution metrics |
| GET | `/tickets/analytics/agent` | Agent / Admin | Individual agent KPI tracking |
| POST | `/replies/` | Role-gated | Post public reply or internal note |
| GET | `/replies/ticket/{ticket_id}` | Role-gated | List thread replies |
| GET | `/replies/{id}` | Authenticated | Retrieve single reply |
| DELETE | `/replies/{id}` | Admin | Delete reply |
| POST | `/users/invite-agent` | Admin | Invite staff agent with tier & department |
| GET | `/users/` | Admin | List all registered users |
| GET | `/users/customers/summary` | Admin | Customer KPI counts (total, active, banned) |
| GET | `/users/department/team` | Admin / Manager | Department team with workload metrics |
| GET | `/users/{id}` | Admin | Retrieve user profile by ID |
| PUT | `/users/{id}` | Admin | Update user attributes |
| PATCH | `/users/{id}/status` | Admin | Toggle customer active / banned status |
| PATCH | `/users/{id}/availability` | Admin / Manager | Toggle agent active status; reroutes open tickets |
| DELETE | `/users/{id}` | Admin | Archive user account |
| POST | `/departments/` | Admin | Create department |
| GET | `/departments/` | Authenticated | List departments with open ticket metrics |
| GET | `/departments/{id}` | Authenticated | Get department details |
| PUT | `/departments/{id}` | Admin | Update department name/description |
| DELETE | `/departments/{id}` | Admin | Delete department |
| POST | `/sla-policies/` | Admin | Create SLA policy |
| GET | `/sla-policies/` | Authenticated | List active SLA thresholds |
| GET | `/sla-policies/{id}` | Authenticated | Get SLA policy details |
| PUT | `/sla-policies/{id}` | Admin | Update SLA thresholds |
| DELETE | `/sla-policies/{id}` | Admin | Delete SLA policy |
| GET | `/health` | Public | Container health & liveness probe |

---

## 6. Workflows & State Machines

### 6.1 SLA Monitor Worker (`sla_monitor_worker`)

Runs continuously as an async background task (`asyncio.create_task()`) on a 60-second cycle:

- **Stage 1 (Warning at 80% elapsed time):** Appends an internal audit note and dispatches an email alert to the Department Manager.
- **Stage 2 (Breached at 100% elapsed time):** Marks the ticket `breached = True`, appends a critical audit note, and sends a breach escalation email to the Manager.
- **Idempotency:** State is tracked via `escalated_at` and `breached` in `sla_state`.

### 6.2 Escalation & Assignment Routing

- **Ingestion escalation:** High Priority + Negative Sentiment immediately assigns the ticket to the active Department Manager with status `in_progress`.
- **Mid-lifecycle escalation:** If priority or sentiment shifts to High + Negative, the ticket is reassigned to the Manager with an audit note.
- **Agent absence:** Deactivating an agent reassigns their open tickets to the Department Manager.
- **Manager succession:** Promoting a new Manager demotes the existing Manager and migrates pending escalations.

### 6.3 Customer Ban / Unban Lifecycle

1. Admin toggles status in `/admin/customers` with modal confirmation.
2. `PATCH /users/{id}/status` updates `is_active` in PostgreSQL.
3. If banned (`is_active = False`):
   - Login attempts immediately fail with HTTP 403.
   - Any ongoing session triggers an HTTP 403 on the next API call, executing `clearSessionAndRedirect()` to log out the customer.
4. If unbanned (`is_active = True`), customer credentials and past ticket associations are restored without data loss.

### 6.4 Client Notification Poller

- Notifications are isolated per user via `localStorage["deskwise_notifications_${userId}"]`.
- Polling runs every 30 seconds with an initial 2000ms delay to prioritize page-critical rendering.
- State diffing detects new assignments, ticket status transitions, replies, and SLA alerts.

---

## 7. Non-Functional Specifications

| Dimension | Benchmark / Requirement |
|-----------|-------------------------|
| Memory footprint | Peak container usage < 512MB RAM |
| Inference latency | < 100ms per classification pass on modern CPU |
| Cold starts | Eliminated via startup model preloading (`preload_models()`) |
| API latency | p95 < 200ms on primary ticket and reply endpoints |
| Fault tolerance (AI) | Gracefully falls back to `human_review`, medium priority, neutral sentiment, confidence 0.50 |
| Fault tolerance (Mail) | Failures logged as warnings; transactional workflows complete without HTTP 500 errors |
| Liveness monitoring | Dedicated `/health` endpoint for uptime probes |

---

## 8. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Async PostgreSQL connection URI (asyncpg) |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase public anonymous API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Privileged service key for user administration and storage |
| `SUPABASE_JWT_SECRET` | Yes | Secret key for HS256 JWT signature verification |
| `SUPABASE_STORAGE_BUCKET` | No | Storage bucket name (default `ticket-attachments`) |
| `FRONTEND_URL` | Yes | Allowed CORS origin (e.g. `http://localhost:5173`) |
| `FORCE_HTTPS` | No | Enforces SSL redirect and HSTS headers (default `False`) |
| `DEBUG` | No | Toggles verbose logging (default `False`) |
| `APP_NAME` | No | Application branding name (default `Deskwise`) |
| `ALLOW_PUBLIC_SIGNUP` | No | Controls customer self-registration portal (default `True`) |
| `ENFORCE_PASSWORD_CHANGE` | No | Demands password rotation on first agent login (default `True`) |
| `MIN_PASSWORD_LENGTH` | No | Minimum allowed password length (default `8`) |
| `MAX_PASSWORD_LENGTH` | No | Maximum allowed password length (default `16`) |
| `BREVO_API_KEY` | No | API key for Brevo transactional email engine |
| `SMTP_HOST` / `SMTP_PORT` | No | SMTP relay settings (`smtp-relay.brevo.com` / `587`) |
| `SMTP_USER` / `SMTP_PASSWORD` | No | Credentials for SMTP transport |
| `MAIL_FROM` | No | Sender email address (default `deskwise.support@gmail.com`) |
| `MAIL_FROM_NAME` | No | Sender display name (default `Deskwise Support`) |
| `MAIL_REPLY_TO` | No | Reply-To address for outbound notifications |
| `HF_TOKEN` | No | Optional token for downloading gated Hugging Face models |
| `SENTRY_DSN` | No | Sentry monitoring connection string |
| `SENTRY_ENVIRONMENT` | No | Environment identifier (default `development`) |
| `SENTRY_TRACES_SAMPLE_RATE` | No | Transaction sample rate for performance monitoring (default `1.0`) |
| `VITE_SUPABASE_URL` | Yes* | Frontend Supabase URL (*frontend `.env`) |
| `VITE_SUPABASE_ANON_KEY` | Yes* | Frontend Supabase anonymous key (*frontend `.env`) |

---

## 9. Verification & Test Plan

| Verification Area | Execution Command / Procedure | Acceptance Criteria |
|-------------------|-------------------------------|---------------------|
| Smoke test | `python smoke_test.py` | Status 200 on `/health`, all route handlers mounted |
| Inference validation | `python backend/app/ai/classify_ticket.py` | Models evaluate on CPU, redact PII, latency < 100ms |
| Database migrations | `alembic upgrade head` | Schema executes without syntax or migration errors |
| Test suite | `pytest backend/tests` | All tests pass (regression, auth, roles, tickets) |
| OAuth security | Submit Google token with `@ritgoa.ac.in` | Returns 403 Forbidden; cleans up auth user in Supabase |
| Customer ban enforcement | Admin bans user; banned user calls API | Returns 403 Forbidden; client auto-logs out to `/login` |
| PII redaction | Submit ticket with raw phone and credit card | Stored payload persists `<tel_num>` and `<acc_num>` |
| High-risk routing | Submit ticket with High Priority + Negative Sentiment | Auto-assigned to Department Manager with audit note |
| SLA alerting | Advance ticket clock past 80% and 100% | Generates warning and breach notes; dispatches emails |
| Attachment storage | Upload valid file via `POST /tickets/{id}/attachments` | Stored in Supabase; signed URL download succeeds |

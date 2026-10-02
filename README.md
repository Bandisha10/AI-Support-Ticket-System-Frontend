# Deskwise — AI-Based Customer Support Ticket System

Deskwise is an enterprise-ready, privacy-first customer support platform uniting **local NLP inference (DistilBERT via ONNX Runtime)** with **deterministic relational business logic and PostgreSQL (Supabase)**. It automates ticket triage, sanitizes sensitive customer data (PII) before model ingestion or storage, routes tickets deterministically to specialized departments, and enforces strict, real-time SLA tracking across customer, support agent, and administrative workflows.

---

## 🏛 System Architecture

Deskwise runs as a single-service FastAPI backend integrated with quantized ONNX models loaded from Hugging Face — eliminating external LLM latency, cost, and third-party data leakage risks.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          React 18 + Vite SPA                            │
│   (Customer Portal │ Agent / Manager Queue │ Admin Analytics)           │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │  JSON API (CORS / HTTP-only Cookies)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          FastAPI Backend                                │
│                                                                         │
│  ┌───────────────────────────┐      ┌───────────────────────────┐       │
│  │   Auth & RBAC Guards      │      │   SlowAPI Rate Limiter    │       │
│  └─────────────┬─────────────┘      └─────────────┬─────────────┘       │
│                ▼                                  ▼                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    PII Redaction Pipeline                       │    │
│  │        (Scrubs emails, phone numbers, payment cards)            │    │
│  └─────────────────────────────┬───────────────────────────────────┘    │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │          ONNX Runtime INT8 Quantized NLP Classifiers            │    │
│  │   - Department Classification   - Priority Prediction           │    │
│  │   - Sentiment Analysis          - Human Review Gate (<0.50)     │    │
│  └─────────────────────────────┬───────────────────────────────────┘    │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │         Deterministic SLA, Routing & Escalation Engine          │    │
│  │  - Maps category to department  - Computes target SLAs          │    │
│  │  - High-risk auto-escalation to Department Manager              │    │
│  └─────────────────────────────┬───────────────────────────────────┘    │
└────────────────────────────────┼────────────────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  Supabase PostgreSQL (Async SQLAlchemy)                 │
│    Users • Tickets • Replies • Attachments • SLAs • Departments         │
│    + Supabase Storage (ticket-attachments bucket)                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Core Invariants & Features

1. **Single-Service Execution:** Business logic, deterministic database routing, and ONNX model inference run inside the same FastAPI Python runtime without external LLM API dependencies.
2. **Zero-PII Storage Policy:** All incoming ticket subjects and bodies pass through regex-based scrubbing (`backend/app/ai/redact_pii.py`) removing emails, telephone numbers, and payment card numbers before model inference or database persistence.
3. **Human-in-the-Loop Triage Gate:** Classifications with confidence scores `< 0.50` automatically receive the `human_review` status and are routed to the Admin Triage Panel.
4. **High-Risk Auto-Escalation:** Tickets with both High Priority AND Negative Sentiment auto-assign to the Department Manager with audit notes and email alerts.
5. **Deterministic SLA Tracking:** Response and resolution deadlines are calculated deterministically via priority-specific policies (High, Medium, Low) and monitored with a 60-second background poller and two-stage alerting (80% warning, 100% breach).
6. **Secure Attachments:** Multipart file uploads up to 5 MB supporting images (`png`, `jpg`, `jpeg`, `webp`), documents (`pdf`, `doc`, `docx`), and text (`txt`).
7. **Customer Feedback (CSAT):** 1–5 star rating and feedback on resolved tickets stored in `ticket_ratings`.

---

## 👥 User Roles & RBAC

| Role | Dashboard Route | Key Capabilities |
| :--- | :--- | :--- |
| **Customer** | `/tickets`, `/tickets/new` | Create tickets, upload attachments, track live progress, reply, submit CSAT ratings on resolution. |
| **Agent (Tier 1)** | `/agent/ticket-panel`, `/agent/analytics` | View department queue, claim tickets, post public replies or internal notes, use canned replies, view SLA countdowns. Cannot claim high-risk tickets. |
| **Manager (Tier 2)** | `/agent/ticket-panel`, `/agent/analytics` | All Agent capabilities + delegate/unassign/transfer tickets, toggle agent availability, handle high-risk tickets. |
| **Administrator** | `/admin/analytics`, `/admin/ticket-panel`, `/admin/member-invite` | Triage low-confidence tickets, manage users & invitations, configure departments and SLA policies, review system analytics. |

---

## 🛠 Tech Stack

- **Backend:** Python 3.10+, FastAPI, SQLAlchemy 2.0 (asyncio + asyncpg), Alembic, Pydantic v2, SlowAPI, Sentry SDK, Brevo (API + SMTP).
- **Frontend:** React 18, Vite 5, Tailwind CSS 3, React Router v6, Lucide React, Axios, Supabase JS.
- **AI & NLP:** ONNX Runtime (CPU, INT8 quantized), Hugging Face Transformers (AutoTokenizer), huggingface_hub.
- **Database & Auth:** PostgreSQL (Supabase), Supabase Auth / JWT, Supabase Storage.

---

## 🚀 Getting Started & Local Setup

### Prerequisites

- **Python:** 3.10 or higher
- **Node.js:** 18.x or higher (with npm)
- **Database:** Supabase project or PostgreSQL instance

### 1. Git Hooks Configuration

Activate the pre-push hook to prevent accidental direct pushes to `main`:

```bash
git config core.hooksPath .githooks
```

### 2. Environment Configuration

Copy the example configuration file to `.env`:

```bash
cp .env.example .env
```

### 3. Backend Setup & Virtual Environment

Create and activate a virtual environment, then install the Python dependencies.

**On Windows (PowerShell):**

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**On Linux / macOS:**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 4. Database Migrations & Seeding

Run Alembic migrations to construct database tables and enum types, then run the seeder:

```bash
# Apply migrations to Supabase PostgreSQL
alembic upgrade head

# Seed initial departments, categories, SLA policies, and admin user
python -m backend.scripts.seed
```

> **Note:** If you executed SQL manually in Supabase's SQL editor, run `alembic stamp head` instead.

### 5. Frontend Setup

Install the frontend dependencies:

```bash
cd frontend
npm install
```

---

## 💻 Running the Application

Start both the backend server and frontend development server in separate terminals.

**Terminal 1: Backend Server**

```bash
uvicorn backend.app.main:app --reload --port 8000
```

- Interactive Swagger API docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health check: [http://localhost:8000/health](http://localhost:8000/health)

**Terminal 2: Frontend Server**

```bash
cd frontend
npm run dev
```

- Web Application: [http://localhost:5173](http://localhost:5173)

---

## 🧠 AI & Machine Learning Pipeline

**PII Masking:** Raw ticket inputs are sanitized with `backend/app/ai/redact_pii.py`:

- Emails → `<email>`
- Telephone numbers → `<tel_num>`
- Credit card / Account numbers → `<acc_num>`

**Model Architecture:** Three quantized ONNX DistilBERT models loaded from Hugging Face:

- Department Classification: `pratik14212/deskwise-departments` (7 classes)
- Priority Classification: `pratik14212/deskwise-priorities` (low/medium/high)
- Sentiment Analysis: `pratik14212/deskwise-sentiments` (positive/neutral/negative)

**Inference & Decision Logic:**

1. Softmax yields predicted class probabilities and a confidence score.
2. If confidence `< 0.50`, the ticket is assigned `status="human_review"`.
3. If confidence `>= 0.50`, the ticket is routed to the corresponding department with `status="open"`.
4. If the ticket is High Priority + Negative Sentiment (high-risk), it auto-assigns to the Department Manager.

---

## 📡 Key API Endpoints

| Method | Endpoint | Description | Access Control |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/signup` | Register a new customer account | Public |
| `POST` | `/auth/login` | Authenticate and obtain JWT token | Public |
| `POST` | `/auth/refresh` | Refresh expired session | Public |
| `POST` | `/auth/logout` | Logout and revoke session | Authenticated |
| `GET` | `/auth/me` | Get current user profile | Authenticated |
| `PUT` | `/auth/me` | Update own profile | Authenticated |
| `POST` | `/auth/change-password` | Change password (mandatory on first login) | Authenticated |
| `POST` | `/auth/forgot-password` | Request password reset email | Public |
| `GET` | `/auth/verify-reset-token` | Verify reset token validity | Public |
| `POST` | `/auth/reset-password` | Reset password with token | Public |
| `POST` | `/tickets/` | Create ticket (triggers PII scrub & AI classification) | Authenticated |
| `GET` | `/tickets/` | List tickets with role-specific scoping and filters | Authenticated |
| `GET` | `/tickets/{id}` | Retrieve ticket details, SLA countdown, and attachments | Role-gated |
| `PUT` | `/tickets/{id}` | Update ticket (status, assign agent, priority) | Agent / Admin |
| `DELETE` | `/tickets/{id}` | Delete a ticket | Admin |
| `POST` | `/tickets/{id}/attachments` | Upload file attachments (max 5 MB) | Authenticated |
| `GET` | `/tickets/{id}/attachments` | List ticket attachments | Role-gated |
| `GET` | `/tickets/{id}/attachments/{filename}` | Download a specific attachment | Role-gated |
| `POST` | `/tickets/{id}/rate` | Submit customer CSAT rating and review | Ticket Owner |
| `GET` | `/tickets/analytics` | Dashboard analytics (SLA, volume, response metrics) | Agent / Admin |
| `GET` | `/tickets/analytics/agent` | Agent-specific KPIs | Agent / Admin |
| `POST` | `/replies/` | Post message or internal agent note | Authenticated |
| `GET` | `/replies/ticket/{ticket_id}` | List replies for a ticket | Role-gated |
| `GET` | `/replies/{id}` | Get a single reply | Authenticated |
| `DELETE` | `/replies/{id}` | Delete a reply | Admin |
| `POST` | `/users/invite-agent` | Invite and provision a new agent | Admin |
| `GET` | `/users/` | List all users | Admin |
| `GET` | `/users/{id}` | Get user details | Admin |
| `PUT` | `/users/{id}` | Update user | Admin |
| `DELETE` | `/users/{id}` | Archive a user | Admin |
| `POST` | `/users/{id}/archive` | Archive a user | Admin |
| `POST` | `/users/{id}/unarchive` | Unarchive a user | Admin |
| `PATCH` | `/users/{id}/availability` | Toggle agent availability | Admin / Manager |
| `GET` | `/users/department/team` | List department team with workload counts | Admin / Manager |
| `POST` | `/departments/` | Create a department | Admin |
| `GET` | `/departments/` | List departments with ticket counts | Authenticated |
| `GET` | `/departments/{id}` | Get a department | Authenticated |
| `PUT` | `/departments/{id}` | Update a department | Admin |
| `DELETE` | `/departments/{id}` | Delete a department | Admin |
| `POST` | `/sla-policies/` | Create an SLA policy | Admin |
| `GET` | `/sla-policies/` | List SLA policies | Authenticated |
| `GET` | `/sla-policies/{id}` | Get an SLA policy | Authenticated |
| `PUT` | `/sla-policies/{id}` | Update an SLA policy | Admin |
| `DELETE` | `/sla-policies/{id}` | Delete an SLA policy | Admin |
| `GET` | `/health` | Liveness probe | Public |

---

## 🧪 Testing & Quality Assurance

Run the automated backend test suite and frontend checks:

```bash
# Run all unit and regression tests
pytest backend/tests

# Run frontend linter
cd frontend
npm run lint

# Build frontend production bundle
npm run build
```

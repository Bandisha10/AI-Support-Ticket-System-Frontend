# Deskwise — AI-Based Customer Support Ticket System

Deskwise is an enterprise-ready, privacy-first customer support platform uniting **local NLP inference (DistilBERT)** with **deterministic relational business logic and PostgreSQL (Supabase)**. It automates ticket triage, sanitizes sensitive customer data (PII) before model ingestion or storage, routes tickets deterministically to specialized departments, and enforces strict, real-time SLA tracking across customer, support agent, and administrative workflows.

---

## 🏛 System Architecture

Deskwise runs as a single-service FastAPI backend integrated directly with local Hugging Face transformer models—eliminating external LLM latency, cost, and third-party data leakage risks.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          React 18 + Vite SPA                            │
│   (Customer Portal │ Support Agent Queue │ Admin Analytics)             │
└────────────────────────────────────┬────────────────────────────────────┘
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
│  │            In-Process DistilBERT NLP Classifiers                │    │
│  │   - Department Classification   - Priority Prediction           │    │
│  │   - Confidence Scoring Engine   - Human Review Gate (<0.50)     │    │
│  └─────────────────────────────┬───────────────────────────────────┘    │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              Deterministic SLA & Routing Engine                 │    │
│  │    - Maps category to department  - Computes target SLAs        │    │
│  └─────────────────────────────┬───────────────────────────────────┘    │
└────────────────────────────────┼────────────────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  Supabase PostgreSQL (Async SQLAlchemy)                 │
│         Users • Tickets • Replies • Attachments • SLAs • Departments    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Core Invariants & Features

1. **Single-Service Execution:** Business logic, deterministic database routing, and DistilBERT model inference run inside the same FastAPI Python runtime without external LLM API dependencies.
2. **Zero-PII Storage Policy:** All incoming ticket subjects and bodies pass through regex-based scrubbing (`backend/app/ai/redact_pii.py`) removing emails, telephone numbers, and payment card numbers before model inference or database persistence.
3. **Human-in-the-Loop Triage Gate:** Classifications with confidence scores `< 0.50` automatically receive the `human_review` status and are routed to the Admin Triage Panel.
4. **Deterministic SLA Tracking:** Response and resolution deadlines are calculated deterministically via priority-specific policies (High, Medium, Low) and monitored with real-time countdowns (`sla_state`).
5. **Secure Attachments:** Multipart file uploads up to 5 MB supporting images (`png`, `jpg`, `jpeg`, `gif`, `webp`), documents (`pdf`, `doc`, `docx`), and text (`txt`).
6. **Customer Feedback (CSAT):** Rating and feedback modals for resolved tickets stored in `ticket_ratings`.

---

## 👥 User Roles & RBAC

| Role | Dashboard Route | Key Capabilities |
| :--- | :--- | :--- |
| **Customer** | `/tickets`, `/tickets/new` | Create tickets, upload attachments, track live progress, reply, submit CSAT ratings on resolution. |
| **Support Agent** | `/agent/tickets`, `/agent/analytics` | View department queue, claim tickets, post public replies or internal notes, use canned replies, view SLA countdowns. |
| **Administrator** | `/admin/analytics`, `/admin/settings` | Triage low-confidence tickets, manage users & invitations, configure departments and SLA policies, review system analytics. |

---

## 🛠 Tech Stack

- **Backend:** Python 3.10+, FastAPI, SQLAlchemy 2.0 (asyncio + asyncpg), Alembic, Pydantic v2, SlowAPI, Sentry SDK, Brevo SMTP.
- **Frontend:** React 18, Vite 5, Tailwind CSS 3, React Router v6, Lucide React, Axios, Supabase JS.
- **AI & NLP:** PyTorch, Hugging Face Transformers (`DistilBertForSequenceClassification`), Tokenizers.
- **Database & Auth:** PostgreSQL (Supabase), Supabase Auth / JWT.

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
npm run dev
```

- Web Application: [http://localhost:5173](http://localhost:5173)

---

## 🧠 AI & Machine Learning Pipeline

**PII Masking:** Raw ticket inputs are sanitized with `backend/app/ai/redact_pii.py`:

- Emails ➔ `<email>`
- Telephone numbers ➔ `<tel_num>`
- Credit card / Account numbers ➔ `<acc_num>`

**Model Architecture:** Two fine-tuned DistilBERT models loaded directly from Hugging Face:

- Category / Department: `pratik14212/deskwise-departments`
- Priority Classification: `pratik14212/deskwise-priorities`

**Inference & Decision Logic:**

1. Softmax yields predicted class probabilities and a confidence score.
2. If confidence `< 0.50`, the ticket is assigned `status="human_review"`.
3. If confidence `≥ 0.50`, the ticket is routed to the corresponding department with `status="open"`.

---

## 📡 Key API Endpoints

| Method | Endpoint | Description | Access Control |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/signup` | Register a new customer account | Public |
| `POST` | `/auth/login` | Authenticate and obtain JWT token | Public |
| `POST` | `/auth/refresh` | Refresh expired session | Authenticated |
| `POST` | `/tickets/` | Create ticket (triggers PII scrub & AI classification) | Customer |
| `GET` | `/tickets/` | List tickets with role-specific scoping | Customer / Agent / Admin |
| `GET` | `/tickets/{id}` | Retrieve ticket details, SLA countdown, and attachments | Permitted Users |
| `PATCH` | `/tickets/{id}` | Update ticket (status, assign agent, priority) | Agent / Admin |
| `POST` | `/tickets/{id}/attachments` | Upload file attachment (max 5 MB) | Customer / Agent |
| `POST` | `/tickets/{id}/rating` | Submit customer CSAT rating and review | Ticket Owner |
| `POST` | `/replies/` | Post message or internal agent note | Ticket Owner / Agent / Admin |
| `GET` | `/departments/` | List active support departments | Authenticated |
| `GET` | `/sla-policies/` | List priority SLA response & resolution terms | Authenticated |

---

## 🧪 Testing & Quality Assurance

Run the automated backend test suite and frontend checks:

```bash
# Run all unit and regression tests
pytest backend/tests

# Run frontend linter
npm run lint

# Build frontend production bundle
npm run build
```
# PRD.md

# Product Requirements Document
## Deskwise — AI-Based Customer Support Ticket System

| Property | Details |
|---|---|
| Product Name | Deskwise |
| Version | 2.1.0 |
| Status | Production-Hardened |
| Platform | Web (Desktop & Mobile-Responsive) |
| Stack | FastAPI Backend + React (Vite) Frontend + Supabase PostgreSQL |

---

## 1. Overview

### 1.1 Problem
Support teams face high ticket volumes causing triage delays, misrouted tickets, and missed SLAs. Sending raw customer text (often containing PII) to external LLM APIs also creates compliance and privacy risk.

### 1.2 Vision
Deskwise is a privacy-first support platform combining **local quantized NLP inference (ONNX Runtime)** with **deterministic business rules (PostgreSQL)**. PII is redacted before inference, classification runs in under 100ms using <512MB RAM, and routing/SLA logic is fully deterministic — enabling fast resolution without compromising data security.

### 1.3 Core Architectural Invariants
1. **In-process AI inference** — CPU-quantized ONNX models loaded on-demand; no PyTorch dependency (keeps memory < 512MB).
2. **Strict AI vs. deterministic boundary**:
   - AI-driven: PII redaction, department/priority/sentiment classification.
   - Deterministic: department routing (SQL lookup), SLA timers (arithmetic), RBAC.
3. **Zero raw PII persistence** — emails, phone numbers, and card numbers are scrubbed before model ingestion and storage.
4. **Human review gate** — predictions with confidence < 0.50 route to `human_review` for manual admin resolution.
5. **High-risk auto-escalation** — a ticket is high-risk **iff** it has both High Priority and Negative Sentiment; it auto-assigns to the Department Manager.

---

## 2. User Roles & RBAC

| Role | Scope | Key Permissions | Routes |
|---|---|---|---|
| **Customer** | Own tickets | File tickets, attach files, view history, submit 1–5★ CSAT | `/tickets/new`, `/tickets`, `/tickets/:id`, `/faq` |
| **Agent (Tier 1)** | Assigned department | Claim unassigned tickets, reply/add notes, monitor SLA. Cannot claim high-risk tickets if a Manager exists. | `/agent/ticket-panel`, `/agent/tickets/:id`, `/agent/analytics` |
| **Manager (Tier 2)** | Department | All Tier 1 + delegate/unassign/transfer tickets, toggle agent availability, receives auto-escalated high-risk tickets | same as Agent |
| **Admin** | System-wide | Reclassify low-confidence tickets, configure SLA policies, invite agents, manage users, global analytics | `/admin/analytics`, `/admin/ticket-panel`, `/admin/member-invite` |

---

## 3. System Architecture

**Client (React 18 + Vite):** Customer portal, Agent/Manager workstation, Admin console, real-time notification polling.

**Backend (FastAPI):**
- Security layer: CORS, security headers, rate limiting, dual JWT verification.
- Service layer: `ticket_service`, `auth_service`, `analytics_service`, `reply_service`, `storage_service`, `user_service`.
- AI pipeline: PII sanitization → ONNX inference → deterministic routing/SLA → high-risk escalation.
- Background workers: SLA poller (60s loop), mailer (Brevo API + SMTP fallback).

**Data (Supabase):** PostgreSQL (users, departments, tickets, replies, sla_state, etc.) + Storage bucket (`ticket-attachments`) with signed URL delivery.

Communication: Client ↔ Backend via HTTPS/Axios (dual JWT interceptors); Backend ↔ DB via async SQLAlchemy 2.0 (asyncpg).

---

## 4. Functional Requirements

### 4.1 Authentication & Security
- **FR-AUTH-01:** Dual JWT verification — Supabase JWKS (RS256/ES256) cached in-memory, falling back to HS256.
- **FR-AUTH-02:** Token refresh mutex — Axios interceptor locks on 401, refreshes via `POST /auth/refresh`, replays queued requests.
- **FR-AUTH-03:** Agent invitation restricted to whitelisted domains (`ritgoa.ac.in`, `aiemgoa.ac.in`, `pccegoa.edu.in`).
- **FR-AUTH-04:** Invited users flagged `must_change_password = True`; operational endpoints return 403 until password changed.
- **FR-AUTH-05:** Password reset tokens validated against `password_changed_at` to prevent replay after update.

### 4.2 Ticket Ingestion & AI Pipeline
- **FR-INGEST-01 (PII Sanitization):** Applied before storage and inference — emails → `<email>`, cards (13–19 digits) → `<acc_num>`, phone numbers (7+ digits) → `<tel_num>`.
- **FR-INGEST-02 (Classification):** Redacted text classified via quantized ONNX models for department (7 classes), priority (low/medium/high), and sentiment (positive/neutral/negative).
- **FR-INGEST-03 (Triage Gate):** Confidence < 0.50 → status `human_review`, `needs_triage = True`.
- **FR-INGEST-04 (Routing & SLA):** Predicted category maps deterministically to department via SQL lookup; response/resolution deadlines computed from `sla_policies`.
- **FR-INGEST-05 (High-Risk Escalation):** High Priority + Negative Sentiment → auto-assign to active Department Manager, status `in_progress`, internal audit note, email alert.

### 4.3 Ticket Lifecycle
- **FR-LIFE-01 (State Transitions):**
  `open → in_progress` (claim/auto-assign) → `pending` (awaiting customer) → `in_progress` (customer replies) → `resolved` (agent marks done) → `closed`. `human_review → open` (admin resolves triage).
- **FR-LIFE-02:** Regular agents cannot claim high-risk tickets if a Manager is already assigned.
- **FR-LIFE-03:** Mid-lifecycle escalation to high priority + negative sentiment auto-reassigns to Manager with audit note and email alert.
- **FR-LIFE-04:** Manager/Admin reassignment generates an audit note and email notification to the assignee.
- **FR-LIFE-05:** Customers submit 1–5★ CSAT rating + feedback on resolved tickets via `POST /tickets/{id}/rate`.

### 4.4 Agent & Manager Workstation
- **FR-WORK-01:** Queue views — "Assigned to Me", "Unassigned Department Queue", "All Department Tickets".
- **FR-WORK-02 (SLA Watcher):** Color-coded countdown — Green (>50% remaining), Yellow (10–50%), Red/pulsing (<10% or breached).
- **FR-WORK-03:** Managers view department workloads, delegate tickets, toggle agent availability.

### 4.5 SLA Monitor
- **FR-SLA-01:** Async 60-second poller checks open tickets against resolution deadlines.
- **FR-SLA-02 (Two-Stage Alerting):** Stage 1 (80% elapsed) — internal warning note + manager email. Stage 2 (breached) — `breached = True`, critical note + manager email.
- **FR-SLA-03:** Each stage fires exactly once per ticket, tracked via `escalated_at`/`breached`.

### 4.6 File Storage
- **FR-STOR-01:** Attachments uploaded to Supabase Storage (`ticket-attachments`).
- **FR-STOR-02:** Served via signed URLs or backend streaming with role-based checks.
- **FR-STOR-03:** Max 5MB; allowed types: `.png .jpg .jpeg .webp .pdf .doc .docx .txt`; filenames sanitized against path traversal.

### 4.7 Real-Time Notifications
- **FR-NOTIF-01:** Notification state scoped per user ID (no cross-account leakage).
- **FR-NOTIF-02:** 30s polling diff engine detects new tickets, status changes, assignments, activity, and SLA breaches.

---

## 5. ML & Inference Specifications

### 5.1 ONNX Model Architecture
- Runtime: `onnxruntime` (CPU execution provider, `intra_op_num_threads = 1`)
- Quantization: INT8 (`model_quantized.onnx`, ~60MB/model)
- Memory: lazy on-demand loading; startup RAM < 250MB, peak inference < 500MB
- Models (Hugging Face):
  - Department: `pratik14212/deskwise-departments` (7 classes)
  - Priority: `pratik14212/deskwise-priorities` (low/medium/high)
  - Sentiment: `pratik14212/deskwise-sentiments` (positive/neutral/negative)

### 5.2 Default SLA Matrix

| Priority | First Response | Resolution |
|---|---|---|
| High | 60 min | 480 min (8 hr) |
| Medium | 240 min (4 hr) | 1,440 min (24 hr) |
| Low | 480 min (8 hr) | 4,320 min (72 hr) |

---

## 6. API Endpoint Catalog
Visit api doc: https://ai-based-customer-support-ticket-system.onrender.com/docs 

---

## 7. Non-Functional Requirements

### 7.1 Security & Compliance
- Zero raw PII storage (redacted before persistence).
- Security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`.
- Rate limiting on sensitive endpoints (auth, password reset) via SlowAPI.

### 7.2 Performance
- Peak container memory < 512MB.
- Inference latency < 100ms per classification (quantized ONNX, CPU).
- Instant boot via on-demand model loading (no startup timeout).

### 7.3 Reliability & Observability
- Sentry integration (backend + frontend) with PII sanitization.
- `GET /health` endpoint for uptime/liveness monitoring.
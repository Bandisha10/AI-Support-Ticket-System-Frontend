# Product Requirements Document

## 1. Overview

### 1.1 Problem
Support teams face high ticket volumes causing triage delays, misrouted tickets, and missed SLAs. Sending raw customer text (often containing PII) to external LLM APIs also creates compliance, data sovereignty, and privacy risks.

### 1.2 Vision
Deskwise is a privacy-first support platform combining **local quantized NLP inference (ONNX Runtime)** with **deterministic business rules (PostgreSQL)**. PII is scrubbed before inference, classification runs in under 100ms using <512MB RAM, models are preloaded at startup for zero cold-start latency, and routing/SLA logic is fully deterministic — enabling fast resolution without compromising data security.

### 1.3 Core Architectural Invariants
1. **In-process AI inference** — CPU-quantized INT8 ONNX models preloaded at startup; no PyTorch runtime dependency (keeps memory footprint < 512MB).
2. **Strict AI vs. deterministic boundary**:
   - AI-driven: PII sanitization/redaction, department/priority/sentiment classification.
   - Deterministic: department routing (SQL lookup), SLA timers (arithmetic), RBAC, status transitions.
3. **Zero raw PII persistence** — emails, phone numbers, and payment card numbers are scrubbed prior to model ingestion and database persistence.
4. **Human review gate** — predictions with confidence < 0.50 automatically route to `human_review` for manual admin resolution.
5. **High-risk auto-escalation** — a ticket is high-risk **iff** it has both High Priority and Negative Sentiment; it auto-assigns to the Department Manager.
6. **Zero-Lag App Shell** — UI state hydrates synchronously from local storage, preventing blocking reloads, screen flashes, or table unmounts during queue navigation.

---

## 2. User Roles & RBAC

| Role | Scope | Key Permissions | Routes |
|---|---|---|---|
| **Customer** | Own tickets | File tickets, attach files, view history, submit 1–5★ CSAT, complete profile. Banned accounts are locked out immediately. | `/tickets/new`, `/tickets`, `/tickets/:id`, `/complete-profile`, `/faq` |
| **Agent (Tier 1)** | Assigned department | Claim unassigned tickets, post public replies & internal notes, use canned responses, monitor SLA. Cannot claim high-risk tickets assigned to a Manager. | `/agent/ticket-panel`, `/agent/tickets/:id`, `/agent/analytics` |
| **Manager (Tier 2)** | Department | All Tier 1 + delegate/unassign/transfer tickets, toggle agent availability, receive auto-escalated high-risk tickets. | `/agent/ticket-panel`, `/agent/tickets/:id`, `/agent/analytics` |
| **Admin** | System-wide | Customer management (ban/unban, sorting), invite staff agents, reclassify low-confidence tickets, configure SLA policies, global analytics. | `/admin/analytics`, `/admin/ticket-panel`, `/admin/customers`, `/admin/member-invite` |

---

## 3. System Architecture

**Client (React 18 + Vite + Tailwind CSS):**
- **App Shell:** Persistent `<Sidebar />` and `<Header />` nested within `<ProtectedRoute>` to eliminate layout remounting during page navigation.
- **Cache Management:** SWR/React Query caching (`staleTime: 30000`, `refetchInterval: 20000`, `refetchOnWindowFocus: false`) ensures instantaneous tab switching without database thrashing.
- **Synchronous Hydration:** Immediate authentication resolution via cached `localStorage` state removes full-screen loading flickers on hard reloads.

**Backend (FastAPI + Async SQLAlchemy 2.0):**
- **Security Layer:** CORS configuration, HTTP security headers, SlowAPI rate limiting, dual JWT verification.
- **Service Layer:** Modular domain services (`ticket_service`, `auth_service`, `analytics_service`, `reply_service`, `storage_service`, `user_service`, `manager_service`, `sla_service`).
- **AI Pipeline:** PII sanitization → ONNX inference → deterministic routing/SLA → high-risk escalation.
- **Background Workers:** Async SLA monitor (60s loop), notification poller, Brevo transactional emailer with SMTP fallback.

**Data & Authentication (Supabase):**
- **PostgreSQL:** `users`, `departments`, `tickets`, `replies`, `sla_policies`, `sla_state`, `ticket_views`.
- **Supabase Auth:** Manages credential identity, OAuth provider handshakes, and token issuance.
- **Storage:** S3-compatible `ticket-attachments` bucket with signed URL delivery.

---

## 4. Functional Requirements

### 4.1 Authentication & Security
- **FR-AUTH-01 (Dual JWT Verification):** Supabase JWKS (RS256/ES256) cached in-memory with fallback to symmetric HS256 verification.
- **FR-AUTH-02 (Token Refresh Mutex):** Axios response interceptor intercepts 401 errors, acquires a refresh lock, calls `POST /auth/refresh`, and replays queued requests.
- **FR-AUTH-03 (Deactivated/Banned Account Ejection):** When any endpoint returns `403 Forbidden` due to account deactivation (`is_active = False`) or archiving, the client immediately invalidates `localStorage`, terminates the Supabase session, and redirects to `/login`.
- **FR-AUTH-04 (Institutional Domain Shielding):**
  - Whitelisted staff domains: `ritgoa.ac.in`, `aiemgoa.ac.in`, `pccegoa.edu.in`.
  - Self-service registration via public signup or Google OAuth is **strictly blocked** for these domains.
  - Uninvited OAuth registrations trigger automatic Supabase user deletion to prevent identity conflicts during subsequent formal admin invitations.
- **FR-AUTH-05 (Staff Invitation Workflow):** Agents/Managers are provisioned exclusively by Administrators with assigned tier and department; temporary passwords require mandatory update (`must_change_password = True`) before operational endpoints can be accessed.
- **FR-AUTH-06 (Password Token Invalidation):** Password reset tokens are validated against `password_changed_at` to prevent reuse after a successful update.

### 4.2 Customer & User Management
- **FR-USER-01 (Customer Management Console):** Dedicated Admin panel (`/admin/customers`) displaying comprehensive customer profiles, registration timestamps, and current account statuses.
- **FR-USER-02 (Ban & Unban Enforcement):**
  - Administrators can toggle customer access via confirmation modals.
  - Banning sets `is_active = False` in the database.
  - Banned users cannot log in (returns 403) and are ejected from active sessions on their next request.
  - Unbanning restores access without destroying credentials or ticket history.
- **FR-USER-03 (Search & Alphabetical Sorting):** Real-time customer search by name or email, accompanied by sorting controls: Alphabetical Ascending (A to Z), Alphabetical Descending (Z to A), and Registration Date.
- **FR-USER-04 (Profile Completion):** Customers registering via Google OAuth without phone numbers are guided through `/complete-profile` prior to accessing customer features.

### 4.3 Ticket Ingestion & AI Pipeline
- **FR-INGEST-01 (PII Sanitization):** Applied before storage and inference:
  - Email addresses → `<email>`
  - Payment cards (13–19 digits) → `<acc_num>`
  - Phone numbers (7+ digits) → `<tel_num>`
- **FR-INGEST-02 (ONNX Classification):** Redacted text classified via quantized ONNX models:
  - Department (7 classes)
  - Priority (low, medium, high)
  - Sentiment (positive, neutral, negative)
- **FR-INGEST-03 (Triage Gate):** Confidence < 0.50 → status set to `human_review` with `needs_triage = True`.
- **FR-INGEST-04 (Deterministic Routing & SLA):** Predicted category deterministically maps to department IDs; response and resolution deadlines are calculated using active `sla_policies`.
- **FR-INGEST-05 (High-Risk Escalation):** High Priority + Negative Sentiment triggers automatic assignment to the active Department Manager, status `in_progress`, internal audit note, and instant email dispatch.

### 4.4 Ticket Lifecycle & Workstation
- **FR-LIFE-01 (State Machine):**
  - `open` → `in_progress` (claim or auto-assign)
  - `in_progress` → `pending` (awaiting customer response)
  - `pending` → `in_progress` (customer replies)
  - `in_progress` → `resolved` (agent resolves ticket)
  - `resolved` → `closed`
  - `human_review` → `open` (admin completes triage)
- **FR-LIFE-02 (Claim Guards):** Regular agents cannot claim high-risk tickets if assigned to a Department Manager.
- **FR-LIFE-03 (Agent Workstation Productivity):**
  - Canned response library for standardized replies.
  - Internal audit notes (visible only to agents and admins).
  - Ticket view tracking to alert agents when multiple staff members view the same ticket.
- **FR-LIFE-04 (Customer Satisfaction):** Customers submit 1–5★ CSAT ratings and optional written feedback on resolved tickets via `POST /tickets/{id}/rate`.

### 4.5 SLA Monitoring & Alerts
- **FR-SLA-01 (Background Evaluation):** Async background task scans open tickets every 60 seconds against target resolution deadlines.
- **FR-SLA-02 (Two-Stage Alerting):**
  - Stage 1 (Warning at 80% elapsed time): Internal warning note added + notification sent to department manager.
  - Stage 2 (Breached at 100% elapsed time): `breached = True`, critical audit note added, and emergency escalation alert dispatched.
- **FR-SLA-03 (Idempotent Execution):** Alerts fire exactly once per ticket lifecycle phase, enforced through database timestamps and boolean flags.

### 4.6 File Storage & Attachments
- **FR-STOR-01:** Attachments uploaded directly to Supabase Storage (`ticket-attachments`).
- **FR-STOR-02:** File delivery via signed URLs or backend streaming with strict ownership/RBAC validation.
- **FR-STOR-03:** 5MB upload ceiling; allowed MIME types: `.png`, `.jpg`, `.jpeg`, `.webp`, `.pdf`, `.doc`, `.docx`, `.txt`; filenames sanitized to prevent directory traversal.

---

## 5. ML & Inference Specifications

### 5.1 ONNX Runtime Configuration
- Runtime: `onnxruntime` (CPU execution provider, `intra_op_num_threads = 1`)
- Quantization: INT8 (`model_quantized.onnx`, ~60MB per model)
- Preloading: Models loaded at application startup via `preload_models()` for zero initial request latency.
- Models (Hugging Face Repository):
  - Department: `pratik14212/deskwise-departments` (7 classes)
  - Priority: `pratik14212/deskwise-priorities` (low, medium, high)
  - Sentiment: `pratik14212/deskwise-sentiments` (positive, neutral, negative)

### 5.2 Default SLA Matrix

| Priority | First Response Target | Resolution Target |
|---|---|---|
| **High** | 60 minutes | 480 minutes (8 hours) |
| **Medium** | 240 minutes (4 hours) | 1,440 minutes (24 hours) |
| **Low** | 480 minutes (8 hours) | 4,320 minutes (72 hours) |

---

## 6. Non-Functional Requirements

### 6.1 Security & Compliance
- **Zero Raw PII Persistence:** Redaction occurs before database storage and before ML inference.
- **HTTP Hardening:** Headers include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`.
- **Abuse Prevention:** Rate limiting on authentication, ticket submission, and password recovery endpoints via SlowAPI.

### 6.2 Performance & UI Responsiveness
- Server memory footprint maintained under 512MB RAM.
- Inference execution time under 100ms per classification on modern CPU cores.
- Frontend route switching latency 0ms for warm caches via SWR query retention.
- Elimination of layout shift and table flickering on ticket list refresh.

### 6.3 Observability & Monitoring
- Sentry integration across backend and frontend environments with automated PII scrubbing.
- Health inspection endpoint (`GET /health`) for automated container liveness and database connection probes.

---

## 7. Interactive API Documentation
- Swagger UI: `https://ai-based-customer-support-ticket-system.onrender.com/docs`
- ReDoc: `https://ai-based-customer-support-ticket-system.onrender.com/redoc`

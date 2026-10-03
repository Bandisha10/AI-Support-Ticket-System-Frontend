# Roles & Access Control

Deskwise implements Role-Based Access Control (RBAC) paired with a Tiered Staff Hierarchy. Every authenticated user belongs to exactly one role (`customer`, `agent`, or `admin`). Agents are further partitioned into operational tiers (`tier_1` Regular Agent or `tier_2` Department Manager).

---

## 1. Role & Hierarchy Overview

| Role | Database Enum | Agent Tier | Primary Scope | Onboarding Method |
| :--- | :--- | :--- | :--- | :--- |
| **Customer** | `customer` | *None* | Own tickets and profile only | Self-service (Email or Google OAuth) |
| **Agent (Tier 1)** | `agent` | `1` (Regular) | Assigned department queue | Formal Admin Invite |
| **Manager (Tier 2)** | `agent` | `2` (Manager) | Department-wide oversight & routing | Formal Admin Invite / Promotion |
| **Admin** | `admin` | *None* | Global system configuration & all data | System Provisioning / Super Admin Seed |

> **Super Admin Protection:** The root system administrator account is protected at the database and application levels. It cannot be edited, deactivated, archived, or deleted by any API endpoint.

---

## 2. Onboarding & Registration Lifecycles

### A. Customer Onboarding
- **Public Registration:** End users register freely via the public signup portal (Email + Password) or **Google Single Sign-On (OAuth)**.
- **Just-In-Time (JIT) Provisioning:** When signing in through Google OAuth for the first time, an authenticated profile is automatically provisioned in PostgreSQL (`public.users`).
- **Profile Completion:** First-time OAuth signups are redirected to `/complete-profile` to provide their full name and unique phone number.
- **Company Domain Protection:**
  - Self-service signups using company staff domains (`ritgoa.ac.in`, `aiemgoa.ac.in`, `pccegoa.edu.in`) are **strictly blocked** with `403 Forbidden`.
  - Uninvited Google OAuth sessions matching these domains are purged from Supabase Auth immediately to prevent account collision and require formal admin invitations.

### B. Staff Onboarding (Agents & Managers)
- **Admin Invite Only:** Staff accounts cannot self-register. Administrators invite agents via `POST /api/v1/users/invite-agent`.
- **Automated Provisioning:** An invitation email is sent via Brevo containing an auto-generated temporary password, assigned department, and assigned tier.
- **Forced Password Reset:** Invited staff are flagged with `must_change_password = True`. All standard operational endpoints block access until the staff member completes `POST /api/v1/auth/change-password`.

---

## 3. Account Lifecycle: Ban vs. Deactivate vs. Archive

| Target | Mechanism | Behavior | Reversibility |
| :--- | :--- | :--- | :--- |
| **Customer** | **Ban / Unban**<br>`is_active = False/True` | Instantly invalidates active sessions (API returns `403 Forbidden`, triggering auto-logout). Prevents login attempts. Preserves all tickets, replies, and CSAT history. | **1-Click Unban** via Admin Customer Management panel. |
| **Agent / Manager** | **Deactivate**<br>`is_active = False/True` | Prevents agent from claiming tickets or logging in. Open tickets are automatically rerouted to the Department Manager. | Reversible by Department Manager or Admin. |
| **Agent / Manager** | **Archive**<br>`is_archive = True` | Permanently deletes credentials from Supabase Auth (`delete_user_quietly`). Reroutes all open tickets. Preserves historical audit notes, replies, and attribution in database. | Irreversible (requires new admin invitation). |

---

## 4. Role Capabilities & Operational Boundaries

### Customer
- **Ticket Creation:** Submit inquiries with file attachments (up to 5MB). Text is automatically sanitized with PII masking, followed by AI department routing, priority scoring, and sentiment analysis.
- **Ticket Interaction:** View own tickets and submit public replies. Sending a reply shifts status from `pending` back to `in_progress`.
- **Follow-up Rate Limiting:** Must wait for an agent response before posting consecutive replies.
- **Satisfaction Rating (CSAT):** Submit a 1 to 5 star rating once a ticket reaches `resolved` or `closed`.
- **Boundaries:** Zero visibility into internal system log notes, audit trails, other customer tickets, or department analytics.

### Agent (Tier 1 — Frontline Support)
- **Department Queues:** Access assigned department tickets filtered by: *Assigned to Me*, *Unassigned Queue*, or *All Department Tickets*.
- **Ticket Lifecycle:** Claim unassigned tickets (`open` → `in_progress`) and transition statuses (`open` → `in_progress` → `pending` → `resolved` → `closed`).
- **Communication:** Post public replies and use predefined canned response templates. Replies are always customer-visible.
- **SLA Oversight:** Real-time visibility into response and resolution SLA countdown timers and breach warnings.
- **Analytics:** View personal performance metrics (first response time, resolution time, CSAT) and department summaries.
- **Boundaries:**
  - Cannot claim **High-Risk tickets** (High Priority + Negative Sentiment) when an active Department Manager exists.
  - Cannot reassign tickets, unassign tickets, or transfer tickets across departments.
  - Cannot invite staff, modify SLA policies, triage unassigned tickets, or delete records.

### Manager (Tier 2 — Department Lead)
*Includes all Tier 1 capabilities, plus:*
- **Department Leadership:** Maximum of **one active Manager** per department. Promoting a new manager demotes the predecessor to Tier 1 and reallocates open tickets.
- **Ticket Routing & Delegation:** Reassign, delegate, or unassign any ticket within the department.
- **Department Transfers:** Transfer misplaced tickets to another department or escalate back to Admin Triage.
- **High-Risk Ticket Handling:** Exclusive authority to claim and manage high-risk escalated tickets.
- **Staff Oversight:** Monitor team workload and toggle agent availability/active status.

### Administrator (System Owner)
- **AI Triage Queue:** Inspect and resolve edge-case tickets where AI routing confidence is below 0.50 or classification failed.
- **Global Ticket Oversight:** View, search, edit, reassign, or delete any ticket or reply across the entire system.
- **User Management:**
  - Staff: Invite agents, promote/demote managers, deactivate, or archive staff.
  - Customers: Monitor customer list (sorted A → Z or Z → A), inspect ticket histories, and Ban / Unban accounts.
- **System Configuration:** Configure SLA response and resolution policies per priority; create and manage departments.
- **Audit Trails:** Publish internal system log entries and audit notes.
- **Global Analytics:** Access organization-wide metrics, SLA compliance rates, and agent leaderboards.

---

## 5. Automated Routing & Escalation Engine

| Trigger Event | Automated Action | Target / Notification |
| :--- | :--- | :--- |
| **New Ticket: High Priority + Negative Sentiment** | AI flags high-risk. Ticket is automatically assigned directly to Department Manager in `in_progress` state. | System audit note logged; immediate email alert to Manager. |
| **Sentiment Drops to Negative Mid-Conversation** | Customer reply expresses acute dissatisfaction. Ticket is escalated to Manager. | System note logged; Manager notified. |
| **Low AI Confidence (< 0.50)** | Department or priority cannot be verified with high confidence. | Ticket moves to `human_review` status in Admin Triage Queue. |
| **Agent Deactivated or Archived** | Open tickets assigned to the departed agent are detached. | Rerouted directly to Department Manager (or department unassigned queue if no manager). |
| **SLA Warning (80% Elapsed)** | Ticket response or resolution target is approaching deadline. | Yellow alert flag raised; notification dispatched to assigned agent and Manager. |
| **SLA Breach (100% Elapsed)** | Target SLA breached. | Red breach badge logged in database; escalation alert dispatched to Manager. |

---

## 6. Comprehensive Permission Matrix

| Feature / Action | Customer | Agent (Tier 1) | Manager (Tier 2) | Admin |
| :--- | :---: | :---: | :---: | :---: |
| **Create Ticket** | ✅ | ❌ | ❌ | ❌ |
| **View Own Tickets Only** | ✅ | ❌ | ❌ | ❌ |
| **View Department Tickets** | ❌ | ✅ | ✅ | ✅ |
| **View Global Tickets (All Departments)** | ❌ | ❌ | ❌ | ✅ |
| **Claim Unassigned Normal Ticket** | ❌ | ✅ | ✅ | ✅ |
| **Claim / Handle High-Risk Ticket** | ❌ | ❌ | ✅ | ✅ |
| **Reassign / Delegate / Unassign Ticket** | ❌ | ❌ | ✅ | ✅ |
| **Transfer Ticket to Another Department** | ❌ | ❌ | ✅ | ✅ |
| **Access AI Triage Queue** | ❌ | ❌ | ❌ | ✅ |
| **Post Public Reply** | ✅ | ✅ | ✅ | ✅ |
| **View Internal System Log Notes** | ❌ | ✅ | ✅ | ✅ |
| **Submit CSAT Rating (1 to 5)** | ✅ | ❌ | ❌ | ❌ |
| **Toggle Department Agent Status** | ❌ | ❌ | ✅ (Own dept) | ✅ (All) |
| **Invite Staff & Enforce Password Reset** | ❌ | ❌ | ❌ | ✅ |
| **Ban / Unban Customers** | ❌ | ❌ | ❌ | ✅ |
| **Archive Staff Accounts** | ❌ | ❌ | ❌ | ✅ |
| **Configure SLA Policies & Departments** | ❌ | ❌ | ❌ | ✅ |
| **Delete Tickets or Messages** | ❌ | ❌ | ❌ | ✅ |
| **Performance Analytics** | ❌ | Personal + Dept | Personal + Dept | Organization-Wide |

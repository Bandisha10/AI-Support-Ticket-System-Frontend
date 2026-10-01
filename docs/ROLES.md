# Roles & Access — Deskwise

Four roles. Each user has exactly one. Agents also have a tier.

| Role | Who | Scope |
|------|-----|-------|
| Customer | External user who files tickets | Own tickets only |
| Agent (Tier 1) | Frontline support | Own department |
| Manager (Tier 2) | Senior agent, one per department | Own department + team control |
| Admin | System owner | Everything |

A protected Super Admin seed account cannot be edited, archived, or deleted.

## Customer
- Create tickets. AI classifies department, priority, and sentiment, and redacts PII.
- View and reply to own tickets. A reply moves `pending` back to `in_progress`.
- Upload attachments (max 5MB).
- Rate resolved tickets 1–5 (CSAT).
- Cannot see internal notes, other customers' tickets, or admin/analytics pages.

## Agent (Tier 1)
- View department tickets: assigned to me, unassigned queue, or all.
- Claim unassigned tickets. Status moves `open` → `in_progress`.
- Update status: `open` → `in_progress` → `pending` → `resolved` → `closed`.
- Post replies and internal notes. Watch SLA timers.
- View personal and department analytics.
- Cannot claim high-risk tickets (High priority + Negative sentiment) when a Manager exists.
- Cannot reassign, unassign, or transfer tickets.
- Cannot invite users, edit SLA, use triage, or delete anything.

## Manager (Tier 2)
Everything an Agent does, plus:
- Delegate, reassign, or unassign tickets in the department.
- Transfer tickets to another department or back to Admin triage.
- Activate or deactivate agents. Deactivating reroutes their open tickets to the Manager.
- View team workload.
- Handle high-risk tickets.
- Only one Manager per department. Promoting a new one demotes the old one and moves their open tickets.

## Admin
- Triage queue: fix tickets with AI confidence below 0.50.
- Invite, promote, demote, archive, and delete users.
- Set SLA times per priority. Manage departments.
- View global analytics.
- Edit, reassign, or delete any ticket or message.

## Auto-Escalation
| Trigger | Action |
|---------|--------|
| New ticket is High + Negative | Assigned to Manager, `in_progress`, note + email |
| Existing ticket becomes High + Negative | Reassigned to Manager, audit note + alert |
| Agent deactivated or archived | Open tickets go to Manager (or queue if none) |
| SLA 80% elapsed / 100% breached | Email to Manager |

## Permission Matrix
| Capability | Customer | Agent | Manager | Admin |
|------------|:-:|:-:|:-:|:-:|
| Create tickets | ✅ | - | - | - |
| View own tickets only | ✅ | — | — | — |
| View department tickets | ❌ | ✅ | ✅ | ✅ |
| View all tickets | ❌ | ❌ | ❌ | ✅ |
| Claim normal ticket | ❌ | ✅ | ✅ | ✅ |
| Claim high-risk ticket | ❌ | ❌ | ✅ | ✅ |
| Delegate / unassign / transfer | ❌ | ❌ | ✅ | ✅ |
| Triage queue | ❌ | ❌ | ❌ | ✅ |
| Public replies | ✅ | ✅ | ✅ | ✅ |
| Internal notes | ❌ | ✅ | ✅ | ✅ |
| Submit CSAT | ✅ | ❌ | ❌ | ❌ |
| Toggle agent availability | ❌ | ❌ | ✅ (own dept) | ✅ (all) |
| Invite users, SLA, departments | ❌ | ❌ | ❌ | ✅ |
| Delete tickets or replies | ❌ | ❌ | ❌ | ✅ |
| Analytics | ❌ | Personal + dept | Personal + dept | Global |
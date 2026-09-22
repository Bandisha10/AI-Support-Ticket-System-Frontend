# Project Structure

```
├── alembic
│   ├── versions/
│   ├── env.py
│   ├── README
│   └── script.py.mako
├── backend
│   ├── app
│   │   ├── ai
│   │   │   ├── classify_ticket.py
│   │   │   ├── label_mappings.json
│   │   │   └── redact_pii.py
│   │   ├── core
│   │   │   ├── limiter.py
│   │   │   ├── mailer.py
│   │   │   ├── observability.py
│   │   │   ├── roles.py
│   │   │   ├── security.py
│   │   │   └── supabase_client.py
│   │   ├── crud
│   │   │   └── base.py
│   │   ├── models
│   │   │   ├── attachment.py
│   │   │   ├── category.py
│   │   │   ├── department.py
│   │   │   ├── enums.py
│   │   │   ├── reply.py
│   │   │   ├── sla_policy.py
│   │   │   ├── sla_state.py
│   │   │   ├── ticket_rating.py
│   │   │   ├── ticket.py
│   │   │   └── user.py
│   │   ├── routers
│   │   │   ├── auth.py
│   │   │   ├── categories.py
│   │   │   ├── departments.py
│   │   │   ├── replies.py
│   │   │   ├── sla_policies.py
│   │   │   ├── sla_state.py
│   │   │   ├── tickets.py
│   │   │   └── users.py
│   │   ├── schemas
│   │   │   ├── auth.py
│   │   │   ├── category.py
│   │   │   ├── department.py
│   │   │   ├── reply.py
│   │   │   ├── sla_policy.py
│   │   │   ├── sla_state.py
│   │   │   ├── ticket_rating.py
│   │   │   ├── ticket.py
│   │   │   └── user.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── dependencies.py
│   │   └── main.py
│   ├── scripts
│   │   └── seed.py
│   └── tests
│       ├── regression
│       │   ├── test_auth.py
│       │   ├── test_oauth.py
│       │   ├── test_rbac.py
│       │   ├── test_replies.py
│       │   └── test_tickets.py
│       ├── unit
│       │   ├── test_crud_base.py
│       │   ├── test_roles.py
│       │   ├── test_schema.py
│       │   ├── test_security.py
│       │   └── test_user_heplers.py
│       └── conftest.py
├── docs
│   ├── BRAIN.md
│   ├── PRD.md
│   └── TRD.md
├── frontend
│   ├── public
│   │   └── favicon.svg
│   ├── src
│   │   ├── components
│   │   │   ├── admin
│   │   │   │   ├── AgentInvite.jsx
│   │   │   │   ├── DepartmentMgmt.jsx
│   │   │   │   ├── SLAConfig.jsx
│   │   │   │   └── UserMgmt.jsx
│   │   │   ├── agent
│   │   │   │   ├── ReplyBox.jsx
│   │   │   │   ├── SLAWatcher.jsx
│   │   │   │   └── TicketTable.jsx
│   │   │   ├── common
│   │   │   │   ├── Button.jsx
│   │   │   │   ├── DotGrid.jsx
│   │   │   │   ├── Layout.jsx
│   │   │   │   ├── Loader.jsx
│   │   │   │   ├── Logo.jsx
│   │   │   │   ├── Modal.jsx
│   │   │   │   ├── Navbar.jsx
│   │   │   │   ├── ProtectedRoute.jsx
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   └── Toast.jsx
│   │   │   └── customer
│   │   │       ├── RatingModal.jsx
│   │   │       ├── TicketForm.jsx
│   │   │       └── TicketStatus.jsx
│   │   ├── context
│   │   │   ├── AuthContext.jsx
│   │   │   ├── NotificationContext.jsx
│   │   │   └── RoleContext.jsx
│   │   ├── hooks
│   │   │   ├── useAuth.js
│   │   │   ├── useSLA.js
│   │   │   └── useTickets.js
│   │   ├── pages
│   │   │   ├── admin
│   │   │   │   ├── Analytics.jsx
│   │   │   │   ├── Settings.jsx
│   │   │   │   └── TicketPanel.jsx
│   │   │   ├── agent
│   │   │   │   ├── Analytics.jsx
│   │   │   │   ├── TicketDetail.jsx
│   │   │   │   └── TicketPanel.jsx
│   │   │   ├── customer
│   │   │   │   ├── MyTickets.jsx
│   │   │   │   ├── NewTicket.jsx
│   │   │   │   ├── TicketDetail.jsx
│   │   │   │   └── TicketHistory.jsx
│   │   │   ├── AuthCallback.jsx
│   │   │   ├── ChangePassword.jsx
│   │   │   ├── CompleteProfile.jsx
│   │   │   ├── FAQ.jsx
│   │   │   ├── ForgotPassword.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── NotFound.jsx
│   │   │   ├── ResetPassword.jsx
│   │   │   ├── Signup.jsx
│   │   │   └── Terms.jsx
│   │   ├── services
│   │   │   ├── adminService.js
│   │   │   ├── api.js
│   │   │   ├── authService.js
│   │   │   └── ticketService.js
│   │   ├── utils
│   │   │   ├── attachments.js
│   │   │   ├── cannedReplies.js
│   │   │   ├── constants.js
│   │   │   ├── formatters.js
│   │   │   ├── passwordRules.js
│   │   │   ├── phoneFormat.js
│   │   │   └── supabase.js
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   └── index.html
├── alembic.ini
├── config.json
├── Dockerfile
├── package-lock.json
├── package.json
├── postcss.config.js
├── PRODUCTION_HANDOFF.md
├── pyrightconfig.json
├── README.md
├── requirements.txt
├── tailwind.config.js
└── vite.config.js
```
# Project Structure

```
AI---Based-Customer-Support-Ticket-System
├── alembic
│ ├── versions/
│ ├── env.py
│ └── script.py.mako
├── backend
│ ├── app
│ │ ├── ai
│ │ │ ├── classify_ticket.py
│ │ │ ├── label_mappings.json
│ │ │ └── redact_pii.py
│ │ ├── core
│ │ │ ├── limiter.py
│ │ │ ├── mailer.py
│ │ │ ├── observability.py
│ │ │ ├── roles.py
│ │ │ ├── security.py
│ │ │ └── supabase_client.py
│ │ ├── crud
│ │ │ └── base.py
│ │ ├── models
│ │ │ ├── category.py
│ │ │ ├── department.py
│ │ │ ├── enums.py
│ │ │ ├── reply.py
│ │ │ ├── routing_rule.py
│ │ │ ├── sla_policy.py
│ │ │ ├── sla_state.py
│ │ │ ├── ticket_rating.py
│ │ │ ├── ticket.py
│ │ │ └── user.py
│ │ ├── routers
│ │ │ ├── auth.py
│ │ │ ├── categories.py
│ │ │ ├── departments.py
│ │ │ ├── replies.py
│ │ │ ├── routing_rules.py
│ │ │ ├── sla_policies.py
│ │ │ ├── sla_state.py
│ │ │ ├── tickets.py
│ │ │ └── users.py
│ │ ├── schemas
│ │ │ ├── auth.py
│ │ │ ├── category.py
│ │ │ ├── department.py
│ │ │ ├── reply.py
│ │ │ ├── routing_rule.py
│ │ │ ├── sla_policy.py
│ │ │ ├── sla_state.py
│ │ │ ├── ticket_rating.py
│ │ │ ├── ticket.py
│ │ │ └── user.py
│ │ ├── config.py
│ │ ├── database.py
│ │ ├── dependencies.py
│ │ └── main.py
│ └── scripts
│ └── seed.py
├── docs
│ ├── architecture.md
│ └── FolderStructure.md
├── frontend
│ ├── src
│ │ ├── components
│ │ │ ├── admin
│ │ │ │ ├── AgentInvite.jsx
│ │ │ │ ├── DepartmentMgmt.jsx
│ │ │ │ ├── SLAConfig.jsx
│ │ │ │ └── UserMgmt.jsx
│ │ │ ├── agent
│ │ │ │ ├── ReplyBox.jsx
│ │ │ │ ├── SLAWatcher.jsx
│ │ │ │ └── TicketTable.jsx
│ │ │ ├── common
│ │ │ │ ├── Button.jsx
│ │ │ │ ├── DotGrid.jsx
│ │ │ │ ├── Layout.jsx
│ │ │ │ ├── Loader.jsx
│ │ │ │ ├── Logo.jsx
│ │ │ │ ├── Modal.jsx
│ │ │ │ ├── Navbar.jsx
│ │ │ │ ├── ProtectedRoute.jsx
│ │ │ │ ├── Sidebar.jsx
│ │ │ │ └── Toast.jsx
│ │ │ └── customer
│ │ │ ├── RatingModal.jsx
│ │ │ ├── TicketForm.jsx
│ │ │ └── TicketStatus.jsx
│ │ ├── context
│ │ │ ├── AuthContext.jsx
│ │ │ ├── NotificationContext.jsx
│ │ │ └── RoleContext.jsx
│ │ ├── hooks
│ │ │ ├── useAuth.js
│ │ │ ├── useSLA.js
│ │ │ └── useTickets.js
│ │ ├── pages
│ │ │ ├── admin
│ │ │ │ ├── Analytics.jsx
│ │ │ │ ├── Settings.jsx
│ │ │ │ └── TicketPanel.jsx
│ │ │ ├── agent
│ │ │ │ ├── Analytics.jsx
│ │ │ │ ├── TicketDetail.jsx
│ │ │ │ └── TicketPanel.jsx
│ │ │ ├── customer
│ │ │ │ ├── MyTickets.jsx
│ │ │ │ ├── NewTicket.jsx
│ │ │ │ └── TicketDetail.jsx
│ │ │ ├── ChangePassword.jsx
│ │ │ ├── FAQ.jsx
│ │ │ ├── ForgotPassword.jsx
│ │ │ ├── Login.jsx
│ │ │ ├── ResetPassword.jsx
│ │ │ └── Signup.jsx
│ │ ├── services
│ │ │ ├── adminService.js
│ │ │ ├── api.js
│ │ │ ├── authService.js
│ │ │ └── ticketService.js
│ │ ├── utils
│ │ │ ├── cannedReplies.js
│ │ │ ├── constants.js
│ │ │ └── formatters.js
│ │ ├── App.jsx
│ │ ├── index.css
│ │ └── main.jsx
│ └── index.html
├── alembic.ini
├── package-lock.json
├── package.json
├── postcss.config.js
├── pyrightconfig.json
├── README_RUN.md
├── README.md
├── requirements.txt
├── tailwind.config.js
└── vite.config.js


```

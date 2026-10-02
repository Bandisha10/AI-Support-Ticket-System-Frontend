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
│   │   │   ├── __init__.py
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
│   │   │   ├── departments.py
│   │   │   ├── replies.py
│   │   │   ├── sla_policies.py
│   │   │   ├── tickets.py
│   │   │   └── users.py
│   │   ├── schemas
│   │   │   ├── auth.py
│   │   │   ├── department.py
│   │   │   ├── reply.py
│   │   │   ├── sla_policy.py
│   │   │   ├── ticket_rating.py
│   │   │   ├── ticket.py
│   │   │   └── user.py
│   │   ├── services
│   │   │   ├── analytics_service.py
│   │   │   ├── auth_service.py
│   │   │   ├── manager_service.py
│   │   │   ├── reply_service.py
│   │   │   ├── sla_service.py
│   │   │   ├── storage_service.py
│   │   │   ├── ticket_service.py
│   │   │   └── user_service.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── dependencies.py
│   │   └── main.py
│   ├── scripts
│   │   ├── convert_and_upload_onnx.py
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
│   ├── database.md
│   ├── FolderStructure.md
│   ├── PRD.md
│   ├── ROLES.md
│   └── TRD.md
├── frontend
│   ├── public
│   │   └── favicon.svg
│   ├── src
│   │   ├── components
│   │   │   ├── admin
│   │   │   │   └── AgentInvite.jsx
│   │   │   ├── agent
│   │   │   │   ├── ReplyBox.jsx
│   │   │   │   ├── SLAWatcher.jsx
│   │   │   │   └── TicketTable.jsx
│   │   │   ├── common
│   │   │   │   ├── Button.jsx
│   │   │   │   ├── DotGrid.jsx
│   │   │   │   ├── ErrorBoundary.jsx
│   │   │   │   ├── ImageLightbox.jsx
│   │   │   │   ├── Layout.jsx
│   │   │   │   ├── Loader.jsx
│   │   │   │   ├── Logo.jsx
│   │   │   │   ├── Modal.jsx
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
│   │   │   ├── useNotifications.js
│   │   │   ├── useReplyRealtime.js
│   │   │   ├── useSLA.js
│   │   │   └── useTickets.js
│   │   ├── pages
│   │   │   ├── admin
│   │   │   │   ├── Analytics.jsx
│   │   │   │   ├── MemberInvite.jsx
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
├── .env.example
├── alembic.ini
├── Dockerfile
├── package-lock.json
├── package.json
├── postcss.config.js
├── pyrightconfig.json
├── README.md
├── requirements.txt
├── tailwind.config.js
├── vercel.json
└── vite.config.js
```

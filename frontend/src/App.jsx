// frontend/src/App.jsx
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { ToastProvider } from "./components/common/Toast";
import { NotificationProvider } from "./context/NotificationContext";
import ProtectedRoute from "./components/common/ProtectedRoute";
import Layout from "./components/common/Layout";
import Loader from "./components/common/Loader";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { useAuth } from "./hooks/useAuth";

// Lazy-load routes
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Terms = lazy(() => import("./pages/Terms"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const CompleteProfile = lazy(() => import("./pages/CompleteProfile"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Customer
const NewTicket = lazy(() => import("./pages/customer/NewTicket"));
const CustomerTicketDetail = lazy(() => import("./pages/customer/TicketDetail"));
const MyTickets = lazy(() => import("./pages/customer/MyTickets"));
const TicketHistory = lazy(() => import("./pages/customer/TicketHistory"));

// Agent
const AgentTicketPanel = lazy(() => import("./pages/agent/TicketPanel"));
const AgentAnalytics = lazy(() => import("./pages/agent/Analytics"));
const TicketDetail = lazy(() => import("./pages/agent/TicketDetail"));

// Admin
const Analytics = lazy(() => import("./pages/admin/Analytics"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const AdminTicketPanel = lazy(() => import("./pages/admin/TicketPanel"));

function HomeRedirect() {
  const { homeRoute } = useAuth();
  return <Navigate to={homeRoute} replace />;
}

function SmartTicketDetailRedirect() {
  const { ticketId } = useParams();
  const { role, loading } = useAuth();
  if (loading) return <Loader fullScreen />;
  if (role === "agent" || role === "admin") {
    return <Navigate to={`/agent/tickets/${ticketId}`} replace />;
  }
  return <Layout><CustomerTicketDetail /></Layout>;
}

function SmartTicketsRedirect() {
  const { role, loading } = useAuth();
  if (loading) return <Loader fullScreen />;
  if (role === "admin") {
    return <Navigate to="/admin/ticket-panel" replace />;
  }
  if (role === "agent") {
    return <Navigate to="/agent/ticket-panel" replace />;
  }
  return <Layout><MyTickets /></Layout>;
}

export default function App() {
  return (
    <div className="bg-gray-900">
      <ToastProvider>
        <NotificationProvider>
          <ErrorBoundary>
            <Suspense fallback={<Loader fullScreen />}>
              <Routes>
                {/* Public Routes */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/complete-profile" element={<CompleteProfile />} />
                </Route>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/terms-and-conditions" element={<Terms />} />
                <Route path="/faq" element={<FAQ />} />

                <Route element={<ProtectedRoute bypassPasswordGate />}>
                  <Route path="/change-password" element={<ChangePassword />} />
                </Route>

                {/* General Ticket routes (Smart Role Redirection) */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/tickets/new" element={<Layout><NewTicket /></Layout>} />
                  <Route path="/tickets/history" element={<Layout><TicketHistory /></Layout>} />
                  <Route path="/tickets/:ticketId" element={<SmartTicketDetailRedirect />} />
                  <Route path="/tickets" element={<SmartTicketsRedirect />} />
                </Route>

                {/* Agent routes */}
                <Route element={<ProtectedRoute allowedRoles={["agent", "admin"]} />}>
                  <Route path="/agent/analytics" element={<Layout><AgentAnalytics /></Layout>} />
                  <Route path="/agent/ticket-panel" element={<Layout><AgentTicketPanel /></Layout>} />
                  <Route path="/agent/tickets/:ticketId" element={<Layout><TicketDetail /></Layout>} />
                  <Route path="/agent/dashboard" element={<Navigate to="/agent/ticket-panel" replace />} />
                </Route>

                {/* Admin routes */}
                <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
                  <Route path="/admin/analytics" element={<Layout><Analytics /></Layout>} />
                  <Route path="/admin/settings" element={<Layout><Settings /></Layout>} />
                  <Route path="/admin/ticket-panel" element={<Layout><AdminTicketPanel /></Layout>} />
                  <Route path="/admin/triage" element={<Navigate to="/admin/ticket-panel" replace />} />
                </Route>

                <Route path="/404" element={<NotFound />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/" element={<HomeRedirect />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </NotificationProvider>
      </ToastProvider>
    </div>
  );
}
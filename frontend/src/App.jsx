import { Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/common/Toast";
import { NotificationProvider } from "./context/NotificationContext";
import ProtectedRoute from "./components/common/ProtectedRoute";
import Layout from "./components/common/Layout";
import { useAuth } from "./hooks/useAuth";
import AuthCallback from "./pages/AuthCallback";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ChangePassword from "./pages/ChangePassword";
import ResetPassword from "./pages/ResetPassword";
import FAQ from "./pages/FAQ";
import Terms from "./pages/Terms";
import NewTicket from "./pages/customer/NewTicket";
import CustomerTicketDetail from "./pages/customer/TicketDetail";
import MyTickets from "./pages/customer/MyTickets";
import AgentTicketPanel from "./pages/agent/TicketPanel";
import AgentAnalytics from "./pages/agent/Analytics";
import TicketDetail from "./pages/agent/TicketDetail";
import Analytics from "./pages/admin/Analytics";
import Settings from "./pages/admin/Settings";
import AdminTicketPanel from "./pages/admin/TicketPanel";
import TicketHistory from "./pages/customer/TicketHistory";
import CompleteProfile from "./pages/CompleteProfile";
import NotFound from "./pages/NotFound";

function HomeRedirect() {
  const { homeRoute } = useAuth();
  return <Navigate to={homeRoute} replace />;
}

export default function App() {
  return (
    <div className="bg-gray-900">
      <ToastProvider>
        <NotificationProvider>
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

            {/* Signed in, but still on temporary password */}
            <Route element={<ProtectedRoute bypassPasswordGate />}>
              <Route path="/change-password" element={<ChangePassword />} />
            </Route>

            {/* Customer routes */}
            <Route element={<ProtectedRoute allowedRoles={["customer"]} />}>
              <Route
                path="/tickets/new"
                element={
                  <Layout>
                    <NewTicket />
                  </Layout>
                }
              />
              <Route
                path="/tickets/history"
                element={
                  <Layout>
                    <TicketHistory />
                  </Layout>
                }
              />
              <Route
                path="/tickets/:ticketId"
                element={
                  <Layout>
                    <CustomerTicketDetail />
                  </Layout>
                }
              />
              <Route
                path="/tickets"
                element={
                  <Layout>
                    <MyTickets />
                  </Layout>
                }
              />
            </Route>

            {/* Agent routes */}
            <Route
              element={<ProtectedRoute allowedRoles={["agent", "admin"]} />}
            >
              <Route
                path="/agent/analytics"
                element={
                  <Layout>
                    <AgentAnalytics />
                  </Layout>
                }
              />
              <Route
                path="/agent/ticket-panel"
                element={
                  <Layout>
                    <AgentTicketPanel />
                  </Layout>
                }
              />
              <Route
                path="/agent/tickets/:ticketId"
                element={
                  <Layout>
                    <TicketDetail />
                  </Layout>
                }
              />
              {/* Alias for legacy /agent/dashboard */}
              <Route
                path="/agent/dashboard"
                element={<Navigate to="/agent/ticket-panel" replace />}
              />
            </Route>

            {/* Admin routes */}
            <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
              <Route
                path="/admin/analytics"
                element={
                  <Layout>
                    <Analytics />
                  </Layout>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <Layout>
                    <Settings />
                  </Layout>
                }
              />
              <Route
                path="/admin/ticket-panel"
                element={
                  <Layout>
                    <AdminTicketPanel />
                  </Layout>
                }
              />
              {/* Alias for legacy /admin/triage */}
              <Route
                path="/admin/triage"
                element={<Navigate to="/admin/ticket-panel" replace />}
              />
            </Route>

            {/* Fallback */}
            {/* Fallback and 404 Routes */}
            <Route path="/404" element={<NotFound />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<HomeRedirect />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </NotificationProvider>
      </ToastProvider>
    </div>
  );
}

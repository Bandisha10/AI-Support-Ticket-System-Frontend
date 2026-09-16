import { Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/common/Toast";
import { NotificationProvider } from "./context/NotificationContext";
import ProtectedRoute from "./components/common/ProtectedRoute";
import Navbar from "./components/common/Navbar";
import Layout from "./components/common/Layout";
import { useAuth } from "./hooks/useAuth";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ChangePassword from "./pages/ChangePassword";
import ResetPassword from "./pages/ResetPassword";
import FAQ from "./pages/FAQ";
import NewTicket from "./pages/customer/NewTicket";
import CustomerTicketDetail from "./pages/customer/TicketDetail";
import MyTickets from "./pages/customer/MyTickets";
import AgentTicketPanel from "./pages/agent/TicketPanel";
import AgentAnalytics from "./pages/agent/Analytics";
import TicketDetail from "./pages/agent/TicketDetail";
import Analytics from "./pages/admin/Analytics";
import Settings from "./pages/admin/Settings";
import AdminTicketPanel from "./pages/admin/TicketPanel";

function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#0B0D13]">
      <Navbar />
      <main>{children}</main>
    </div>
  );
}

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
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
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
                  <AppLayout>
                    <NewTicket />
                  </AppLayout>
                }
              />
              <Route
                path="/tickets/:ticketId"
                element={
                  <AppLayout>
                    <CustomerTicketDetail />
                  </AppLayout>
                }
              />
              <Route
                path="/tickets"
                element={
                  <AppLayout>
                    <MyTickets />
                  </AppLayout>
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
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<HomeRedirect />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </NotificationProvider>
      </ToastProvider>
    </div>
  );
}

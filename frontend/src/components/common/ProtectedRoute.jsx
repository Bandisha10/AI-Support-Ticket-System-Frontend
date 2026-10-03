import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import Loader from "./Loader";

/**
 * Wrap a set of routes with this. Optionally restrict to specific roles:
 *   <Route element={<ProtectedRoute allowedRoles={["agent"]} />}>...</Route>
 *
 * Invited agents still on their temporary password are pushed to
 * /change-password until they set their own. Pass bypassPasswordGate on the
 * change-password route itself, or it would redirect to itself forever.
 */
export default function ProtectedRoute({ children, allowedRoles, bypassPasswordGate = false }) {
  const { isAuthenticated, loading, role, mustChangePassword } = useAuth();
  if (loading) return <Loader fullScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (mustChangePassword && !bypassPasswordGate)
    return <Navigate to="/change-password" replace />;
  if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/" replace />;
  return children ? children : <Outlet />;
}

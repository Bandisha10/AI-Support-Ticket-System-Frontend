import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/common/Toast";
import Loader from "../components/common/Loader";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    async function handleAuth() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const session = data?.session;
        if (!session?.access_token) {
          throw new Error("No session found in callback.");
        }

        // Store tokens for API requests
        localStorage.setItem("access_token", session.access_token);
        if (session.refresh_token) {
          localStorage.setItem("refresh_token", session.refresh_token);
        }

        // Fetch user profile from FastAPI backend (/auth/me)
        const profile = await refreshUser();

        // If newly signed up with Google (no phone number yet), redirect to complete profile
        if (profile.role === "customer" && !profile.phone_number) {
          navigate("/complete-profile", { replace: true });
          return;
        }

        // Otherwise route user according to existing role
        const dest =
          profile.role === "admin"
            ? "/admin/analytics"
            : profile.role === "agent"
              ? "/agent/analytics"
              : "/tickets";

        navigate(dest, { replace: true });
      } catch (err) {
        showToast(err.message || "Failed to complete Google login", "error");
        navigate("/login", { replace: true });
      }
    }

    handleAuth();
  }, [navigate, refreshUser, showToast]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-bg text-white">
      <div className="text-center">
        <Loader size="lg" />
        <p className="mt-4 text-sm text-gray-400">Completing sign in...</p>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Zap, Star } from "lucide-react";
import Logo from "../components/common/Logo";
import DotGrid from "../components/common/DotGrid";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/common/Toast";

export default function Login() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const user = await login(form.email.trim(), form.password.trim());
      if (user.must_change_password) {
        navigate("/change-password", { replace: true });
        return;
      }
      const dest =
        user.role === "admin"
          ? "/admin/analytics"
          : user.role === "agent"
            ? "/agent/analytics"
            : "/tickets";
      navigate(dest);
    } catch (err) {
      showToast(
        err.response?.data?.detail?.[0]?.msg ||
          err.response?.data?.detail ||
          "Invalid email or password",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-bg p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-surface-border bg-surface-card md:grid-cols-2">
        {/* Left panel — branding */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-surface-sidebar p-10 md:flex">
          <DotGrid className="absolute left-6 top-6" />
          <DotGrid className="absolute bottom-6 left-6" />

          <div>
            <Logo size={64} className="mb-4" />
            <h1 className="text-2xl font-bold text-white">
              Desk<span className="text-accent">wise</span>
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              AI-Powered Customer Support Ticket System
            </p>

            <div className="my-6 h-0.5 w-10 bg-accent" />

            <p className="text-lg font-semibold text-white">
              Smarter support.
              <br />
              Faster resolution.
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Let AI handle the tickets while you focus on what matters.
            </p>
          </div>

          <div className="flex gap-8">
            <div className="flex flex-col items-center gap-1.5">
              <ShieldCheck className="h-5 w-5 text-gray-400" />
              <span className="text-xs text-gray-500">Secure</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Zap className="h-5 w-5 text-gray-400" />
              <span className="text-xs text-gray-500">Reliable</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Star className="h-5 w-5 text-gray-400" />
              <span className="text-xs text-gray-500">Intelligent</span>
            </div>
          </div>
        </div>

        {/* Right panel — form */}
        <div className="p-8 sm:p-10">
          <h2 className="text-xl font-bold text-white">Welcome Back 👋</h2>
          <p className="mt-1 text-sm text-gray-500">
            Sign in to continue to your dashboard
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Email Address <span className="text-accent">*</span>
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  type="email"
                  required
                  placeholder="Enter your email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-surface-border bg-surface-bg py-2.5 pl-10 pr-3 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Password <span className="text-accent">*</span>
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  className="w-full rounded-lg border border-surface-border bg-surface-bg py-2.5 pl-10 pr-10 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold text-black transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign In →"}
            </button>

            <p className="pt-1 text-center text-sm text-gray-500">
              <Link
                to="/forgot-password"
                className="font-medium text-accent hover:text-accent-hover"
              >
                Forgot password
              </Link>
            </p>

            <p className="text-center text-xs text-gray-600">
              Support agents do not sign up - an administrator invites you and
              emails your temporary password.{" "}
              <Link
                to="/signup"
                className="font-medium text-accent hover:text-accent-hover"
              >
                Create a customer account
              </Link>
            </p>

            <div className="pt-2 text-center">
              <Link
                to="/faq"
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-accent transition-colors"
              >
                <span>Need help? Browse our Self-Service FAQ →</span>
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

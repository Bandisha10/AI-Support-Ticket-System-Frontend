import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Zap, Star } from "lucide-react";
import Logo from "../components/common/Logo";
import DotGrid from "../components/common/DotGrid";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/common/Toast";
import { supabase } from "../utils/supabase";

export default function Login() {
  const { login, homeRoute } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleGoogleSignIn() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err) {
      showToast(err.message || "Failed to initiate Google sign in", "error");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const user = await login(form.email.trim(), form.password); 
      if (user.must_change_password) {
        navigate("/change-password", { replace: true });
        return;
      }
      navigate(homeRoute || "/tickets");
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
            {/* 1. Google Sign-In Button (Top) */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-surface-border bg-surface-bg py-2.5 text-sm font-medium text-white transition-colors hover:border-gray-600 hover:bg-surface-card"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Continue with Google
            </button>

            {/* 2. Divider */}
            <div className="relative my-4 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-surface-border"></div>
              </div>
              <span className="relative bg-surface-card px-2 text-xs uppercase text-gray-500">
                Or sign in with email
              </span>
            </div>

            {/* 3. Email & Password Fields */}
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
                  autoComplete="email"
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
                  autoComplete="current-password"
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

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Phone,
  Check,
  X,
  ShieldCheck,
  Zap,
  Star,
} from "lucide-react";
import Logo from "../components/common/Logo";
import DotGrid from "../components/common/DotGrid";
import * as authService from "../services/authService";
import { useToast } from "../components/common/Toast";
import { supabase } from "../utils/supabase";
import {
  MIN_PASSWORD_LENGTH as MIN_LENGTH,
  MAX_PASSWORD_LENGTH as MAX_LENGTH,
  PASSWORD_REQUIREMENTS,
} from "../utils/passwordRules";
import { formatIndianPhone } from "../utils/phoneFormat";

export default function Signup() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    password: "",
  });

  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleGoogleSignUp() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err) {
      showToast(err.message || "Failed to initiate Google sign up", "error");
    }
  }

  function handlePhoneChange(e) {
    setForm((prev) => ({
      ...prev,
      phone_number: formatIndianPhone(e.target.value),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.first_name.trim() || !form.last_name.trim()) {
      showToast("First name and last name are required", "error");
      return;
    }

    if (!form.email.trim()) {
      showToast("Email address is required", "error");
      return;
    }

    const unmetRule = PASSWORD_REQUIREMENTS.find((r) => !r.test(form.password));
    if (unmetRule) {
      showToast(
        `Password must satisfy: ${unmetRule.label.toLowerCase()}`,
        "error",
      );
      return;
    }

    if (form.password !== confirmPassword) {
      showToast("Passwords do not match", "error");
      return;
    }

    setSubmitting(true);
    try {
      await authService.register({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone_number: form.phone_number.trim() || null,
        password: form.password,
      });

      showToast("Account created successfully! Please sign in", "success");
      navigate("/login");
    } catch (err) {
      const msg =
        err.response?.data?.detail?.[0]?.msg ||
        err.response?.data?.detail ||
        "Registration failed";
      showToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-bg p-4 py-8">
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
              Create your customer account to start raising and tracking
              tickets.
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

        {/* Right panel — Single Registration Form */}
        <div className="p-8 sm:p-10">
          <h2 className="text-xl font-bold text-white">Create an Account 🚀</h2>
          <p className="mt-1 text-sm text-gray-500">
            Sign up to submit and track support tickets
          </p>

          <div className="mt-6 space-y-4">
            {/* Google Sign-Up Button */}
            <button
              type="button"
              onClick={handleGoogleSignUp}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-surface-border bg-surface-bg py-2.5 text-sm font-medium text-white transition-colors hover:border-gray-600 hover:bg-surface-border/50"
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
              Sign up with Google
            </button>

            {/* Divider */}
            <div className="relative my-4 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-surface-border"></div>
              </div>
              <span className="relative bg-surface-card px-2 text-xs uppercase text-gray-500">
                Or sign up with email
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* First Name & Last Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-300">
                    First Name <span className="text-accent">*</span>
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                    <input
                      type="text"
                      required
                      placeholder="John"
                      value={form.first_name}
                      onChange={(e) =>
                        setForm({ ...form, first_name: e.target.value })
                      }
                      className="w-full rounded-lg border border-surface-border bg-surface-bg py-2 pl-9 pr-3 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-300">
                    Last Name <span className="text-accent">*</span>
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                    <input
                      type="text"
                      required
                      placeholder="Doe"
                      value={form.last_name}
                      onChange={(e) =>
                        setForm({ ...form, last_name: e.target.value })
                      }
                      className="w-full rounded-lg border border-surface-border bg-surface-bg py-2 pl-9 pr-3 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-300">
                  Email Address <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    className="w-full rounded-lg border border-surface-border bg-surface-bg py-2 pl-9 pr-3 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-300">
                  Phone Number{" "}
                  <span className="text-gray-500 text-[11px]">(Optional)</span>
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    maxLength={15}
                    value={form.phone_number}
                    onChange={handlePhoneChange}
                    className="w-full rounded-lg border border-surface-border bg-surface-bg py-2 pl-9 pr-3 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-300">
                  Password <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Create password"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    className="w-full rounded-lg border border-surface-border bg-surface-bg py-2 pl-9 pr-9 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                {/* Requirements checklist */}
                {form.password && (
                  <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-surface-border/60 bg-surface-bg/50 p-2">
                    {PASSWORD_REQUIREMENTS.map((req) => {
                      const met = req.test(form.password);
                      return (
                        <div
                          key={req.id}
                          className={`flex items-center gap-1.5 text-[11px] ${
                            met ? "text-emerald-400" : "text-gray-500"
                          }`}
                        >
                          {met ? (
                            <Check className="h-3 w-3 shrink-0" />
                          ) : (
                            <X className="h-3 w-3 shrink-0 text-gray-600" />
                          )}
                          <span>{req.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-300">
                  Confirm Password <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-lg border border-surface-border bg-surface-bg py-2 pl-9 pr-9 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                {confirmPassword && (
                  <div
                    className={`mt-1 text-[11px] ${
                      form.password === confirmPassword
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {form.password === confirmPassword
                      ? "✓ Passwords match"
                      : "✕ Passwords do not match"}
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold text-black transition-colors hover:bg-accent-hover disabled:opacity-60"
                >
                  {submitting ? "Creating account…" : "Create Account →"}
                </button>
              </div>
            </form>

            <p className="pt-2 text-center text-sm text-gray-500">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-medium text-accent hover:text-accent-hover"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

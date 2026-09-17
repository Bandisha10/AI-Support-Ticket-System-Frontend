import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, Check, X } from "lucide-react";
import Logo from "../components/common/Logo";
import * as authService from "../services/authService";
import { useToast } from "../components/common/Toast";

const MIN_LENGTH = 8;
const MAX_LENGTH = 16;

const PASSWORD_REQUIREMENTS = [
  {
    id: "length",
    label: "8 to 16 characters",
    test: (p) => p.length >= MIN_LENGTH && p.length <= MAX_LENGTH,
  },
  { id: "lower", label: "One lowercase (a-z)", test: (p) => /[a-z]/.test(p) },
  { id: "upper", label: "One uppercase (A-Z)", test: (p) => /[A-Z]/.test(p) },
  { id: "number", label: "One number (0-9)", test: (p) => /[0-9]/.test(p) },
];

export default function Signup() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();

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
      await authService.register(form);
      showToast("Account created — please sign in", "success");
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
    <div className="flex min-h-screen items-center justify-center bg-surface-bg p-4">
      <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-card p-8">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={44} />
          <div>
            <h1 className="text-lg font-bold text-white">
              Desk<span className="text-accent">wise</span>
            </h1>
            <p className="text-xs text-gray-500">Create your account</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                First Name <span className="text-accent">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="John"
                value={form.first_name}
                onChange={(e) =>
                  setForm({ ...form, first_name: e.target.value })
                }
                className="w-full rounded-lg border border-surface-border bg-surface-bg py-2.5 px-3 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Last Name <span className="text-accent">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Doe"
                value={form.last_name}
                onChange={(e) =>
                  setForm({ ...form, last_name: e.target.value })
                }
                className="w-full rounded-lg border border-surface-border bg-surface-bg py-2.5 px-3 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Email Address <span className="text-accent">*</span>
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-surface-border bg-surface-bg py-2.5 pl-10 pr-3 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Password <span className="text-accent">*</span>
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type={showPassword ? "text" : "password"}
                required
                maxLength={MAX_LENGTH}
                placeholder={`${MIN_LENGTH}–${MAX_LENGTH} characters`}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
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

          {/* Confirm Password */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Confirm Password <span className="text-accent">*</span>
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                required
                maxLength={MAX_LENGTH}
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-bg py-2.5 pl-10 pr-10 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
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
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Password Requirements Checklist & Match Status */}
          <div className="rounded-lg border border-surface-border/70 bg-surface-bg/60 p-3 space-y-2.5">
            <p className="text-xs font-semibold text-gray-400">
              Password requirements:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {PASSWORD_REQUIREMENTS.map((req) => {
                const met = req.test(form.password);
                return (
                  <div
                    key={req.id}
                    className={`flex items-center gap-2 transition-colors ${
                      met ? "text-emerald-400" : "text-gray-500"
                    }`}
                  >
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors ${
                        met
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-surface-border text-gray-600"
                      }`}
                    >
                      <Check className="h-2.5 w-2.5 stroke-[2.5]" />
                    </div>
                    <span>{req.label}</span>
                  </div>
                );
              })}
            </div>

            {confirmPassword.length > 0 && (
              <div
                className={`flex items-center gap-2 pt-2 border-t border-surface-border/50 text-xs transition-colors ${
                  form.password === confirmPassword
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}
              >
                <div
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                    form.password === confirmPassword
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-rose-500/20 text-rose-400"
                  }`}
                >
                  {form.password === confirmPassword ? (
                    <Check className="h-2.5 w-2.5 stroke-[2.5]" />
                  ) : (
                    <X className="h-2.5 w-2.5 stroke-[2.5]" />
                  )}
                </div>
                <span>
                  {form.password === confirmPassword
                    ? "Passwords match"
                    : "Passwords do not match"}
                </span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-black hover:bg-accent-hover disabled:opacity-60"
          >
            {submitting ? "Creating account…" : "Register"}
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-accent hover:text-accent-hover"
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

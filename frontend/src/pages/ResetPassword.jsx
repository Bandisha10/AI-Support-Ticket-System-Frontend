import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Check,
  X,
} from "lucide-react";
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

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const token = searchParams.get("token");

  const [form, setForm] = useState({ next: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const allRulesMet = PASSWORD_REQUIREMENTS.every((r) => r.test(form.next));
  const canSubmit = allRulesMet && form.next === form.confirm && !submitting;

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setTokenValid(false);
      setErrorMessage(
        "No verification token provided. Please use the link sent to your email.",
      );
      return;
    }

    async function checkToken() {
      try {
        const res = await authService.verifyResetToken(token);
        setTokenValid(true);
        setVerifiedEmail(res.email || "");
      } catch (err) {
        setTokenValid(false);
        setErrorMessage(
          err.response?.data?.detail?.[0]?.msg ||
            err.response?.data?.detail ||
            "This verification link is invalid or has expired.",
        );
      } finally {
        setVerifying(false);
      }
    }

    checkToken();
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();

    const unmetRule = PASSWORD_REQUIREMENTS.find((r) => !r.test(form.next));
    if (unmetRule || form.next !== form.confirm) {
      return; // Checklist already shows the requirements visually
    }

    setSubmitting(true);
    try {
      await authService.resetPassword(token, form.next);
      showToast(
        "Password updated successfully! Sign in with your new password.",
        "success",
      );
      navigate("/login", { replace: true });
    } catch (err) {
      showToast(
        err.response?.data?.detail ||
          "Could not reset password. The link may have expired.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    navigate("/login");
  }

  if (verifying) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-bg p-4">
        <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-card p-8 text-center text-gray-400">
          <p className="text-sm">Verifying reset link…</p>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-bg p-4">
        <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <AlertCircle className="h-6 w-6 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white">
            Invalid or Expired Link
          </h1>
          <p className="mt-2 text-sm text-gray-400">{errorMessage}</p>
          <div className="mt-6 space-y-3">
            <Link
              to="/forgot-password"
              className="block w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-black hover:bg-accent-hover transition-colors"
            >
              Request a new link
            </Link>
            <Link
              to="/login"
              className="block text-sm font-medium text-gray-400 hover:text-gray-200"
            >
              Cancel and back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-bg p-4">
      <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-card p-8">
        <h1 className="text-xl font-bold text-white">Set New Password</h1>
        {verifiedEmail && (
          <p className="mt-1 text-xs text-accent">
            Resetting password for: {verifiedEmail}
          </p>
        )}
        <p className="mt-1 text-sm text-gray-400">
          Enter your new password and confirm it below.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field
            label="New password"
            placeholder={`${MIN_LENGTH}–${MAX_LENGTH} characters`}
            value={form.next}
            onChange={set("next")}
            visible={show}
            maxLength={MAX_LENGTH}
          />
          <Field
            label="Confirm password"
            placeholder="Confirm new password"
            value={form.confirm}
            onChange={set("confirm")}
            visible={show}
            maxLength={MAX_LENGTH}
          />

          {/* Password Requirements Checklist & Match Status */}
          <div className="rounded-lg border border-surface-border/70 bg-surface-bg/60 p-3 space-y-2.5">
            <p className="text-xs font-semibold text-gray-400">
              Password requirements:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {PASSWORD_REQUIREMENTS.map((req) => {
                const met = req.test(form.next);
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

            {form.confirm.length > 0 && (
              <div
                className={`flex items-center gap-2 pt-2 border-t border-surface-border/50 text-xs transition-colors ${
                  form.next === form.confirm
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}
              >
                <div
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                    form.next === form.confirm
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-rose-500/20 text-rose-400"
                  }`}
                >
                  {form.next === form.confirm ? (
                    <Check className="h-2.5 w-2.5 stroke-[2.5]" />
                  ) : (
                    <X className="h-2.5 w-2.5 stroke-[2.5]" />
                  )}
                </div>
                <span>
                  {form.next === form.confirm
                    ? "Passwords match"
                    : "Passwords do not match"}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-semibold text-black hover:bg-accent-hover disabled:opacity-60 transition-colors"
            >
              {submitting ? "Updating…" : "Submit"}
            </button>

            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 rounded-lg border border-surface-border bg-surface-bg py-2.5 text-sm font-semibold text-gray-300 hover:bg-surface-border transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, placeholder, value, onChange, visible, maxLength }) {
  const [reveal, setReveal] = useState(false);
  const shown = visible || reveal;

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-300">
        {label} <span className="text-accent">*</span>
      </label>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type={shown ? "text" : "password"}
          required
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoComplete="new-password"
          className="w-full rounded-lg border border-surface-border bg-surface-bg py-2.5 pl-10 pr-10 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          aria-label={shown ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
        >
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

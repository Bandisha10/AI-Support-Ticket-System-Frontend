import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import * as authService from "../services/authService";
import { useToast } from "../components/common/Toast";

const MIN_LENGTH = 8;

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
    if (form.next.length < MIN_LENGTH) {
      showToast(
        `New password must be at least ${MIN_LENGTH} characters`,
        "error",
      );
      return;
    }
    if (form.next !== form.confirm) {
      showToast(
        err.response?.data?.detail?.[0]?.msg ||
          err.response?.data?.detail ||
          "Could not reset password. The link may have expired.",
        "error",
      );
      return;
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
            placeholder={`Minimum ${MIN_LENGTH} characters`}
            value={form.next}
            onChange={set("next")}
            visible={show}
          />
          <Field
            label="Confirm password"
            placeholder="Confirm new password"
            value={form.confirm}
            onChange={set("confirm")}
            visible={show}
          />

          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
              className="rounded border-surface-border bg-surface-bg text-accent focus:ring-0"
            />
            Show passwords
          </label>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
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

function Field({ label, placeholder, value, onChange, visible }) {
  const [reveal, setReveal] = useState(false);
  const shown = visible || reveal;

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-300">
        {label}
      </label>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type={shown ? "text" : "password"}
          required
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

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import Logo from "../components/common/Logo";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/common/Toast";

const MIN_LENGTH = 8;

export default function ChangePassword() {
  const { user, changePassword, mustChangePassword, homeRoute } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

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
      showToast("New passwords do not match", "error");
      return;
    }
    if (form.next === form.current) {
      showToast("New password must differ from the current one", "error");
      return;
    }
    setSubmitting(true);
    try {
      const profile = await changePassword(form.current, form.next);
      showToast("Password updated", "success");
      const dest =
        profile?.role === "admin"
          ? "/admin/analytics"
          : profile?.role === "agent"
            ? "/agent/analytics"
            : "/tickets";
      navigate(dest, {
        replace: true,
      });
    } catch (err) {
      showToast(
        err.response?.data?.detail?.[0]?.msg ||
          err.response?.data?.detail ||
          "Could not update password",
        "error",
      );
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
              {mustChangePassword ? "Set your password" : "Change password"}
            </h1>
            <p className="text-xs text-gray-500">{user?.email}</p>
          </div>
        </div>

        {mustChangePassword && (
          <div className="mb-5 flex gap-2 rounded-lg border border-surface-border bg-surface-bg p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p className="text-xs text-gray-400">
              You are signed in with the temporary password from your invitation
              email. Choose your own password to continue.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordField
            label={
              mustChangePassword ? "Temporary password" : "Current password"
            }
            value={form.current}
            onChange={set("current")}
            show={show}
          />
          <PasswordField
            label="New password"
            value={form.next}
            onChange={set("next")}
            show={show}
            hint={`At least ${MIN_LENGTH} characters`}
          />
          <PasswordField
            label="Confirm new password"
            value={form.confirm}
            onChange={set("confirm")}
            show={show}
          />

          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
              className="rounded border-surface-border bg-surface-bg"
            />
            Show passwords
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-black hover:bg-accent-hover disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, show, hint }) {
  const [reveal, setReveal] = useState(false);
  const visible = show || reveal;
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-300">
        {label} <span className="text-accent">*</span>
      </label>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type={visible ? "text" : "password"}
          required
          value={value}
          onChange={onChange}
          autoComplete="new-password"
          className="w-full rounded-lg border border-surface-border bg-surface-bg py-2.5 pl-10 pr-10 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
      {hint && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

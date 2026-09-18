import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Eye, EyeOff, ShieldCheck, Check, X } from "lucide-react";
import Logo from "../components/common/Logo";
import { useAuth } from "../hooks/useAuth";
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

export default function ChangePassword({ isModal = false, isOpen = true, onClose }) {
  const { user, changePassword, mustChangePassword } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (isModal && !isOpen) return null;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const allRulesMet = PASSWORD_REQUIREMENTS.every((r) => r.test(form.next));
  const canSubmit =
    Boolean(form.current) &&
    allRulesMet &&
    form.next === form.confirm &&
    form.next !== form.current &&
    !submitting;

  const handleClose = () => {
    if (submitting) return;
    setForm({ current: "", next: "", confirm: "" });
    onClose?.();
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    try {
      const profile = await changePassword(form.current, form.next);
      showToast("Password updated", "success");
      if (isModal) {
        handleClose();
      } else {
        const dest =
          profile?.role === "admin"
            ? "/admin/analytics"
            : profile?.role === "agent"
              ? "/agent/analytics"
              : "/tickets";
        navigate(dest, { replace: true });
      }
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

  const containerClasses = isModal
    ? "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
    : "flex min-h-screen items-center justify-center bg-surface-bg p-4";

  return (
    <div className={containerClasses}>
      <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-card p-8 shadow-2xl relative">
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Logo size={44} />
            <div>
              <h1 className="text-lg font-bold text-white">
                {mustChangePassword ? "Set your password" : "Change password"}
              </h1>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>
          {isModal && (
            <button
              type="button"
              onClick={handleClose}
              className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-surface-hover transition-colors cursor-pointer"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
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
            maxLength={MAX_LENGTH}
          />
          <PasswordField
            label="Confirm new password"
            value={form.confirm}
            onChange={set("confirm")}
            show={show}
            maxLength={MAX_LENGTH}
          />

          {/* Password Requirements Checklist & Match Status */}
          <div className="rounded-lg border border-surface-border/70 bg-surface-bg/60 p-3 space-y-2.5">
            <p className="text-xs font-semibold text-gray-400">
              New password requirements:
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

            {form.current && form.next && form.current === form.next && (
              <p className="text-[11px] text-rose-400 pt-1">
                New password must be different from current password
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {isModal && (
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-300 hover:text-white bg-surface-hover border border-surface-border transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              className={`${
                isModal ? "flex-1" : "w-full"
              } rounded-lg bg-accent py-2.5 text-sm font-semibold text-black hover:bg-accent-hover disabled:opacity-60 transition-colors cursor-pointer disabled:cursor-not-allowed`}
            >
              {submitting ? "Saving…" : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, show, maxLength }) {
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
          maxLength={maxLength}
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
    </div>
  );
}

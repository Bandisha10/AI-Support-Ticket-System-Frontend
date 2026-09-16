import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, CheckCircle2, ArrowLeft } from "lucide-react";
import * as authService from "../services/authService";
import { useToast } from "../components/common/Toast";

export default function ForgotPassword() {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await authService.forgotPassword(email);
      setSubmitted(true);
      showToast("Verification email sent!", "success");
    } catch (err) {
      const msg =
        err.response?.data?.detail?.[0]?.msg ||
        err.response?.data?.detail ||
        "Could not send verification email";
      showToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-bg p-4">
      <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-card p-8">
        {submitted ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
              <CheckCircle2 className="h-6 w-6 text-accent" />
            </div>
            <h1 className="text-xl font-bold text-white">Check your email</h1>
            <p className="mt-2 text-sm text-gray-400">
              We sent a verification link to{" "}
              <strong className="text-white">{email}</strong>.
            </p>
            <p className="mt-3 text-xs text-gray-500">
              Open your email and click the verification button to set your new
              password. The link expires in 15 minutes.
            </p>
            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="w-full rounded-lg border border-surface-border py-2 text-sm text-gray-300 hover:bg-surface-border transition-colors"
              >
                Resend with different email
              </button>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover"
              >
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold text-white">Forgot password</h1>
            <p className="mt-1 text-sm text-gray-400">
              Enter your email address and we will send you a verification link
              to reset your password.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full rounded-lg border border-surface-border bg-surface-bg py-2.5 pl-10 pr-3 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-black hover:bg-accent-hover disabled:opacity-60 transition-colors"
              >
                {submitting
                  ? "Sending verification email…"
                  : "Send verification link"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
              <Link
                to="/login"
                className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover"
              >
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

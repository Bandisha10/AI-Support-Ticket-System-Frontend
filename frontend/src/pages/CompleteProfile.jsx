// frontend/src/pages/CompleteProfile.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Phone, ShieldCheck, Zap, Star } from "lucide-react";
import Logo from "../components/common/Logo";
import DotGrid from "../components/common/DotGrid";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/common/Toast";
import * as authService from "../services/authService";
import { formatIndianPhone } from "../utils/phoneFormat";

export default function CompleteProfile() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone_number: "",
  });
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill names from Google OAuth metadata if present
  useEffect(() => {
    if (user) {
      setForm({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        phone_number: user.phone_number || "",
      });
    }
  }, [user]);

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

    setSubmitting(true);
    try {
      await authService.updateProfile({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone_number: form.phone_number.trim() || null,
      });

      await refreshUser();
      showToast("Profile completed successfully!", "success");
      navigate("/tickets", { replace: true });
    } catch (err) {
      const msg =
        err.response?.data?.detail?.[0]?.msg ||
        err.response?.data?.detail ||
        "Failed to update profile";
      showToast(msg, "error");
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
              Almost there!
              <br />
              Let’s finish setting up.
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Provide your details so support agents can address you properly.
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

        {/* Right panel — Profile Form */}
        <div className="p-8 sm:p-10">
          <h2 className="text-xl font-bold text-white">
            Complete Your Profile 👤
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Please confirm your contact details to continue to your dashboard.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  First Name <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    required
                    placeholder="John"
                    value={form.first_name}
                    onChange={(e) =>
                      setForm({ ...form, first_name: e.target.value })
                    }
                    className="w-full rounded-lg border border-surface-border bg-surface-bg py-2.5 pl-10 pr-3 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Last Name <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    required
                    placeholder="Doe"
                    value={form.last_name}
                    onChange={(e) =>
                      setForm({ ...form, last_name: e.target.value })
                    }
                    className="w-full rounded-lg border border-surface-border bg-surface-bg py-2.5 pl-10 pr-3 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                Phone Number <span className="text-accent">*</span>
              </label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  type="tel"
                  required
                  placeholder="+91 98765 43210"
                  maxLength={15}
                  value={form.phone_number}
                  onChange={handlePhoneChange}
                  className="w-full rounded-lg border border-surface-border bg-surface-bg py-2.5 pl-10 pr-3 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold text-black transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {submitting ? "Saving profile…" : "Complete Registration →"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  UserCheck,
  Ticket,
  Sparkles,
  Paperclip,
  ShieldCheck,
  MessageSquare,
  LifeBuoy,
  ChevronRight,
  Printer,
} from "lucide-react";
import Logo from "../components/common/Logo";
import { useAuth } from "../hooks/useAuth";

const CUSTOMER_TERMS = [
  {
    id: "account",
    title: "1. Your Account & Security",
    icon: UserCheck,
    summary: "Keep your login details safe and maintain accurate account info.",
    points: [
      "You can create an account using your email or Google Single Sign-On.",
      "Keep your password secure and do not share your credentials with others.",
      "You are responsible for any tickets submitted or actions taken under your account.",
      "If you suspect unauthorized access to your account, reset your password immediately or reach out to our team.",
    ],
  },
  {
    id: "tickets",
    title: "2. Submitting Tickets & Support",
    icon: Ticket,
    summary: "How support requests work and what you can expect from us.",
    points: [
      "Submit tickets with clear descriptions and relevant details so we can assist you faster.",
      "You can track real-time progress (Open, In Progress, Resolved) anytime under 'My Tickets'.",
      "Our support agents work to reply as quickly as possible, with urgent and high-priority inquiries prioritized.",
      "If a resolved ticket needs more follow-up, you can simply reply to reopen the conversation.",
    ],
  },
  {
    id: "ai-assistance",
    title: "3. How AI Helps Route Your Issues",
    icon: Sparkles,
    summary: "Smart automation to get your problem to the right agent faster.",
    points: [
      "Deskwise uses AI to read ticket titles and descriptions so it can automatically detect the issue type (like Billing or Technical) and urgency.",
      "AI recommendations help speed up triage, but real human agents review your request and handle all final resolutions.",
      "You can always provide feedback or request clarification if an automated tag doesn't match your issue.",
    ],
  },
  {
    id: "attachments",
    title: "4. Uploads & Community Guidelines",
    icon: Paperclip,
    summary: "Helpful files are welcome; keep submissions safe and respectful.",
    points: [
      "You may attach screenshots (PNG, JPG), log files, or PDF documents to illustrate your problem.",
      "Never upload malicious software, viruses, or inappropriate content.",
      "For your security, do not paste unencrypted passwords, credit card numbers, or sensitive financial data into tickets.",
      "Please treat our support team respectfully. Abusive or harassing behavior will result in account suspension.",
    ],
  },
  {
    id: "privacy",
    title: "5. Your Data & Privacy",
    icon: ShieldCheck,
    summary: "You own your data; we keep your support history confidential.",
    points: [
      "You own the content and files you upload to Deskwise.",
      "We only access your tickets and attachments to diagnose, troubleshoot, and resolve your support requests.",
      "Your communications are transmitted over secure, encrypted connections (TLS/HTTPS).",
      "You can request account or ticket history deletion at any time by contacting our support team.",
    ],
  },
  {
    id: "updates",
    title: "6. Changes & Getting in Touch",
    icon: MessageSquare,
    summary: "How updates are shared and where to reach us.",
    points: [
      "We may update these terms as we release new product features. Any major changes will be noted on this page.",
      "By continuing to use Deskwise, you agree to the latest terms.",
      "If you have questions about these terms or need assistance, feel free to contact us at support@deskwise.com or submit a ticket.",
    ],
  },
];

export default function Terms() {
  const { user, homeRoute } = useAuth();
  const [selectedTopic, setSelectedTopic] = useState("all");

  const displayedTerms =
    selectedTopic === "all"
      ? CUSTOMER_TERMS
      : CUSTOMER_TERMS.filter((t) => t.id === selectedTopic);

  return (
    <div className="min-h-screen bg-surface-bg text-white">
      {/* Top Header */}
      <header className="border-b border-surface-border bg-surface-card px-6 py-4 sticky top-0 z-20 backdrop-blur-md bg-surface-card/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="text-lg font-bold text-white">
              Desk<span className="text-accent">wise</span> Support
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-bg px-3 py-1.5 text-xs font-medium text-gray-300 hover:border-accent hover:text-white transition-colors"
              title="Print terms"
            >
              <Printer className="h-3.5 w-3.5 text-gray-400" />
              <span>Print</span>
            </button>

            {user ? (
              <Link
                to={homeRoute || "/tickets"}
                className="text-xs font-semibold text-gray-300 hover:text-white transition-colors"
              >
                Back to Dashboard
              </Link>
            ) : (
              <Link
                to="/login"
                className="text-xs font-semibold text-gray-300 hover:text-white transition-colors"
              >
                Sign In
              </Link>
            )}

            <Link
              to="/tickets/new"
              className="rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-accent-hover transition-colors"
            >
              Submit a Ticket
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="border-b border-surface-border bg-gradient-to-b from-surface-card to-surface-bg px-4 py-12 text-center">
        <div className="mx-auto max-w-2xl">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent mb-3">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Customer Terms of Service</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Simple Terms & Conditions
          </h1>

          <p className="mt-2 text-sm text-gray-400">
            Clear, straightforward guidelines on using Deskwise, how our support
            works, and how we protect your data.
          </p>

          {/* Quick Filter Pills */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => setSelectedTopic("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedTopic === "all"
                  ? "bg-accent text-black font-semibold"
                  : "border border-surface-border bg-surface-card text-gray-300 hover:border-accent"
              }`}
            >
              All Topics
            </button>
            {CUSTOMER_TERMS.map((term) => (
              <button
                key={term.id}
                onClick={() => setSelectedTopic(term.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedTopic === term.id
                    ? "bg-accent text-black font-semibold"
                    : "border border-surface-border bg-surface-card text-gray-300 hover:border-accent"
                }`}
              >
                {term.title.replace(/^\d+\.\s*/, "")}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="mx-auto max-w-4xl px-4 py-10 space-y-5">
        {displayedTerms.map((section) => {
          const Icon = section.icon;
          return (
            <div
              key={section.id}
              className="rounded-2xl border border-surface-border bg-surface-card p-6 shadow-sm hover:border-surface-border/80 transition-colors"
            >
              <div className="flex items-center gap-3 pb-3 border-b border-surface-border/50 mb-4">
                <div className="p-2 rounded-xl bg-[#1b2030] text-accent border border-accent/20 shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">
                    {section.title}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {section.summary}
                  </p>
                </div>
              </div>

              <ul className="space-y-2.5">
                {section.points.map((point, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-300 leading-relaxed"
                  >
                    <ChevronRight className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {/* Support Help Box */}
        <div className="mt-10 rounded-2xl border border-surface-border bg-gradient-to-r from-surface-card to-accent/10 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-accent" />
              <span>Have any questions about these terms?</span>
            </h3>
            <p className="mt-1 text-xs text-gray-400">
              Check our FAQ guides or create a ticket for quick assistance.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/faq"
              className="rounded-xl border border-surface-border bg-surface-bg px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white transition-colors"
            >
              Browse FAQ
            </Link>
            <Link
              to="/tickets/new"
              className="rounded-xl bg-accent px-4 py-2 text-xs font-bold text-black hover:bg-accent-hover transition-colors shadow-sm"
            >
              Submit Ticket →
            </Link>
          </div>
        </div>
      </main>

      {/* Simple Footer */}
      <footer className="mt-12 border-t border-surface-border bg-surface-card/40 py-6 text-center text-xs text-gray-500">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 sm:flex-row">
          <p>
            © {new Date().getFullYear()} Deskwise Support System. All rights
            reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link
              to="/terms-and-conditions"
              className="text-accent hover:underline"
            >
              Terms & Conditions
            </Link>
            <Link to="/faq" className="hover:text-accent transition-colors">
              Help & FAQ
            </Link>
            <Link to="/login" className="hover:text-accent transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

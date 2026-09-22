import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  ChevronDown,
  HelpCircle,
  ArrowLeft,
  MessageSquare,
  LifeBuoy,
  Sparkles,
} from "lucide-react";
import Logo from "../components/common/Logo";
import { useAuth } from "../hooks/useAuth";

const FAQ_ITEMS = [
  {
    id: "password-reset",
    question: "How do I reset my password?",
    category: "Account & Access",
    answer:
      "You can request a password reset anytime by visiting the Login page and clicking 'Forgot password' (or navigating directly to /forgot-password). Enter your registered email address and you will receive a secure link or instructions to update your password.",
  },
  {
    id: "response-times",
    question: "How long until I receive a response on my ticket?",
    category: "Support & SLA",
    answer:
      "Our AI routing system analyzes the urgency and complexity of your request immediately upon submission. Most high-priority tickets are assigned and responded to within 1-2 hours. Standard inquiries typically receive a response within 4-8 business hours.",
  },
  {
    id: "ai-classification",
    question: "How does AI ticket classification work?",
    category: "AI & Technology",
    answer:
      "When you submit a ticket, our DistilBERT-powered AI model evaluates your subject and description text to automatically identify the issue category (e.g., Billing, Technical Support, Hardware) and assign an appropriate priority level. This ensures your inquiry is routed directly to the most qualified support agent without delay.",
  },
  {
    id: "track-status",
    question: "How can I track the status of my existing tickets?",
    category: "Support & SLA",
    answer:
      "Sign in to your account and click on 'My Tickets' in the top navigation bar. You will see a real-time list of all your active and past tickets, including their current status (Open, In Progress, Pending, or Resolved), the assigned agent, and live conversation updates.",
  },
  {
    id: "attachments",
    question: "Can I attach screenshots or logs to my ticket?",
    category: "Troubleshooting",
    answer:
      "Yes! When creating a new ticket or sending a reply, you can drag and drop screenshots (PNG, JPG), PDF documents, or log files directly into the attachment zone. Adding visual proof helps our support team resolve your issue much faster.",
  },
  {
    id: "ticket-resolution",
    question: "What should I do if my issue is not fully resolved?",
    category: "Resolution",
    answer:
      "If an agent marks your ticket as resolved but you still need assistance, you can simply reply to the ticket in your portal to immediately reopen it. You can also provide feedback through the CSAT rating prompt.",
  },
  {
    id: "agent-invites",
    question: "How do support agents receive their accounts?",
    category: "Account & Access",
    answer:
      "Support agents and administrators are provisioned directly by the system administrator. Once invited, agents receive an email containing a single-use temporary password that must be replaced on first login for security.",
  },
];

export default function FAQ() {
  const { user, homeRoute } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [openItems, setOpenItems] = useState({});
  const [selectedCategory, setSelectedCategory] = useState("All");

  const categories = useMemo(() => {
    return ["All", ...new Set(FAQ_ITEMS.map((item) => item.category))];
  }, []);

  const filteredFaqs = useMemo(() => {
    return FAQ_ITEMS.filter((item) => {
      const matchesSearch =
        !searchQuery.trim() ||
        item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.answer.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat =
        selectedCategory === "All" || item.category === selectedCategory;

      return matchesSearch && matchesCat;
    });
  }, [searchQuery, selectedCategory]);

  const toggleItem = (id) => {
    setOpenItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="min-h-screen bg-surface-bg text-white">
      {/* Header Bar */}
      <header className="border-b border-surface-border bg-surface-card px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="text-lg font-bold text-white">
              Desk<span className="text-accent">wise</span> Support
            </span>
          </Link>
          <div className="flex items-center gap-3">
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

      {/* Hero Search Section */}
      <section className="border-b border-surface-border bg-gradient-to-b from-surface-card to-surface-bg px-4 py-16 text-center">
        <div className="mx-auto max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Self-Service Knowledge Base</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            How can we help you today?
          </h1>
          <p className="mt-3 text-sm text-gray-400">
            Find instant answers to common questions about accounts, response
            times, AI classification, and ticket management.
          </p>

          {/* Search Box */}
          <div className="relative mt-8">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search answers, keywords, or topics…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-surface-border bg-surface-card py-3.5 pl-12 pr-4 text-sm text-white placeholder:text-gray-500 shadow-xl focus:border-accent focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* Category Pills */}
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? "bg-accent text-black font-semibold"
                  : "border border-surface-border bg-surface-card text-gray-300 hover:border-accent hover:text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Accordion FAQ Items */}
        {filteredFaqs.length === 0 ? (
          <div className="rounded-2xl border border-surface-border bg-surface-card p-12 text-center">
            <HelpCircle className="mx-auto h-8 w-8 text-gray-600 mb-2" />
            <p className="text-base font-semibold text-gray-300">
              No matching questions found
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Try searching with different keywords or submit a ticket directly.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredFaqs.map((faq) => {
              const isOpen = openItems[faq.id];
              return (
                <div
                  key={faq.id}
                  className="rounded-xl border border-surface-border bg-surface-card overflow-hidden transition-colors hover:border-surface-hover"
                >
                  <button
                    onClick={() => toggleItem(faq.id)}
                    className="flex w-full items-center justify-between p-5 text-left transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-accent">
                        [{faq.category}]
                      </span>
                      <h3 className="text-sm font-semibold text-gray-100">
                        {faq.question}
                      </h3>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-gray-500 transition-transform duration-200 shrink-0 ml-4 ${
                        isOpen ? "rotate-180 text-accent" : ""
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="border-t border-surface-border/50 bg-surface-bg/60 p-5 text-sm leading-relaxed text-gray-300">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Still Need Help CTA Card */}
        <div className="mt-12 rounded-2xl border border-surface-border bg-gradient-to-r from-surface-card to-accent/10 p-8 text-center sm:text-left sm:flex sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-accent" />
              <span>Still couldn't find what you need?</span>
            </h3>
            <p className="mt-1 text-sm text-gray-400">
              Our AI support system and dedicated support staff are available to
              assist you.
            </p>
          </div>
          <Link
            to="/tickets/new"
            className="mt-4 sm:mt-0 shrink-0 inline-block"
          >
            <button className="rounded-xl bg-accent px-5 py-2.5 text-xs font-bold text-black hover:bg-accent-hover transition-colors shadow-lg">
              Submit a Ticket →
            </button>
          </Link>
        </div>
      </main>
      {/* Footer */}
      <footer className="mt-16 border-t border-surface-border bg-surface-card/40 py-6 text-center text-xs text-gray-500">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 sm:flex-row">
          <p>
            © {new Date().getFullYear()} Deskwise Support System. All rights
            reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link to="/terms-and-conditions" className="text-accent hover:underline">
              Terms & Conditions
            </Link>
            <Link to="/faq" className="hover:text-accent transition-colors">
              Knowledge Base
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

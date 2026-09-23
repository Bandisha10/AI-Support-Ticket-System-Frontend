import { useLocation, useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  FileQuestion,
  Ticket,
  ShieldAlert,
  AlertTriangle,
  ArrowLeft,
  Home,
  HelpCircle,
  PlusCircle,
} from "lucide-react";
import Logo from "../components/common/Logo";
import Button from "../components/common/Button";
import { useAuth } from "../hooks/useAuth";

const ERROR_PRESETS = {
  page: {
    code: "404",
    badge: "Page Not Found",
    title: "Looking for something?",
    description:
      "The page you are looking for doesn't exist, has been moved, or the URL was mistyped.",
    icon: FileQuestion,
    iconColor: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  },
  ticket: {
    code: "404",
    badge: "Ticket Not Found",
    title: "We couldn't locate this ticket",
    description:
      "This support ticket may have been deleted, closed, or you might not have permission to view it.",
    icon: Ticket,
    iconColor: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  },
  forbidden: {
    code: "403",
    badge: "Access Restricted",
    title: "Permission Required",
    description:
      "You don't have authorization to access this section. Please ensure you are logged into an authorized account.",
    icon: ShieldAlert,
    iconColor: "text-rose-400 bg-rose-400/10 border-rose-400/20",
  },
  server: {
    code: "500",
    badge: "Server Error",
    title: "Something went wrong",
    description:
      "Our servers encountered an unexpected issue while processing your request. Please try again shortly.",
    icon: AlertTriangle,
    iconColor: "text-red-400 bg-red-400/10 border-red-400/20",
  },
};

export default function NotFound({
  type: propType,
  code: propCode,
  title: propTitle,
  customMessage,
  ticketId: propTicketId,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, homeRoute, isCustomer } = useAuth();

  // Resolve error type from props -> route state -> query params -> default 'page'
  const resolvedType =
    propType ||
    location.state?.type ||
    searchParams.get("type") ||
    "page";

  const config = ERROR_PRESETS[resolvedType] || ERROR_PRESETS.page;

  const displayCode =
    propCode ||
    location.state?.code ||
    searchParams.get("code") ||
    config.code;

  const displayTitle =
    propTitle ||
    location.state?.title ||
    config.title;

  const rawDesc =
    customMessage ||
    location.state?.message ||
    searchParams.get("message") ||
    config.description;

  const displayDescription =
    typeof rawDesc === "string"
      ? rawDesc
      : Array.isArray(rawDesc)
      ? rawDesc.join(", ")
      : typeof rawDesc === "object" && rawDesc !== null
      ? JSON.stringify(rawDesc)
      : String(rawDesc || config.description);

  const ticketRef =
    propTicketId ||
    location.state?.ticketId ||
    searchParams.get("ticketId");

  const IconComponent = config.icon;

  function handleBack() {
    if (window.history?.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate(isAuthenticated ? (homeRoute || "/tickets") : "/login");
    }
  }

  return (
    <div className="min-h-screen bg-surface-bg text-gray-200 flex flex-col justify-between relative overflow-hidden">
      {/* Background glow ambiance */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-accent/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-32 right-10 w-96 h-96 bg-brand-500/5 blur-[100px] rounded-full pointer-events-none" />

      {/* Top Bar with Branding */}
      <header className="px-6 py-6 border-b border-surface-border/50 backdrop-blur-sm z-10 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-2 focus:outline-none">
          <Logo />
        </Link>
        <Link
          to="/faq"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Help Center</span>
        </Link>
      </header>

      {/* Main Error Content */}
      <main className="flex-1 flex items-center justify-center p-6 z-10">
        <div className="max-w-lg w-full text-center">
          {/* Status Badge & Icon */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border mb-6 text-xs font-medium tracking-wide uppercase bg-surface-card/80 border-surface-border">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-gray-300">{config.badge}</span>
          </div>

          <div className="flex justify-center mb-6">
            <div className={`p-4 rounded-2xl border ${config.iconColor}`}>
              <IconComponent className="w-10 h-10" />
            </div>
          </div>

          {/* Large Stylized Number */}
          <h1 className="text-7xl font-extrabold tracking-tight text-white mb-3">
            <span className="text-transparent bg-clip-text bg-gradient-to-b from-white via-gray-200 to-gray-500">
              {displayCode}
            </span>
          </h1>

          <h2 className="text-2xl font-bold text-white mb-2">
            {displayTitle}
          </h2>

          <p className="text-sm text-gray-400 mb-6 leading-relaxed max-w-md mx-auto">
            {displayDescription}
          </p>

          {/* Ticket Reference Callout if provided */}
          {ticketRef && (
            <div className="mb-6 mx-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-card border border-surface-border text-xs font-mono text-gray-300">
              <Ticket className="w-3.5 h-3.5 text-accent" />
              <span>Reference ID: #{ticketRef}</span>
            </div>
          )}

          {/* Primary & Secondary Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              variant="secondary"
              onClick={handleBack}
              className="w-full sm:w-auto text-xs py-2.5 px-4"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Go Back</span>
            </Button>

            <Link
              to={isAuthenticated ? (homeRoute || "/tickets") : "/login"}
              className="w-full sm:w-auto"
            >
              <Button variant="primary" className="w-full text-xs py-2.5 px-5">
                <Home className="w-3.5 h-3.5" />
                <span>{isAuthenticated ? "Go to Dashboard" : "Back to Login"}</span>
              </Button>
            </Link>
          </div>

          {/* Helpful Navigation Links */}
          <div className="mt-12 pt-6 border-t border-surface-border/40 grid grid-cols-2 gap-4 text-left">
            <Link
              to="/faq"
              className="p-3 rounded-xl bg-surface-card/60 hover:bg-surface-hover border border-surface-border/50 transition-colors group"
            >
              <div className="flex items-center gap-2 text-xs font-medium text-white group-hover:text-accent transition-colors">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Browse FAQs</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Common questions & troubleshooting guides
              </p>
            </Link>

            {isCustomer ? (
              <Link
                to="/tickets/new"
                className="p-3 rounded-xl bg-surface-card/60 hover:bg-surface-hover border border-surface-border/50 transition-colors group"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-white group-hover:text-accent transition-colors">
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Submit Ticket</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Report an issue to our support agents
                </p>
              </Link>
            ) : (
              <Link
                to={homeRoute || "/"}
                className="p-3 rounded-xl bg-surface-card/60 hover:bg-surface-hover border border-surface-border/50 transition-colors group"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-white group-hover:text-accent transition-colors">
                  <Ticket className="w-3.5 h-3.5" />
                  <span>Ticket Panel</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Return to your active support queue
                </p>
              </Link>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-gray-600 border-t border-surface-border/30 z-10">
        © {new Date().getFullYear()} Deskwise Support System. All rights reserved.
      </footer>
    </div>
  );
}
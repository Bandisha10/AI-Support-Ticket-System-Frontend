import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Filter,
  History,
  Clock,
  ArrowLeft,
  ArrowRight,
  Star,
} from "lucide-react";
import { useTickets } from "../../hooks/useTickets";
import Loader from "../../components/common/Loader";
import Button from "../../components/common/Button";
import RatingModal from "../../components/customer/RatingModal";
import { formatRelativeTime } from "../../utils/formatters";
import clsx from "clsx";

function getStatusBadgeClass(status) {
  switch (status?.toLowerCase()) {
    case "resolved":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "closed":
      return "bg-gray-500/15 text-gray-400 border-gray-500/30";
    default:
      return "bg-[#f2b705]/15 text-[#f2b705] border-[#f2b705]/30";
  }
}

function getPriorityBadgeClass(priority) {
  switch (priority?.toLowerCase()) {
    case "high":
    case "urgent":
      return "bg-rose-500/10 text-rose-400 border-rose-500/30";
    case "medium":
      return "bg-amber-500/10 text-amber-400 border-amber-500/30";
    case "low":
      return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    default:
      return "bg-gray-500/10 text-gray-400 border-gray-500/30";
  }
}

export default function TicketHistory() {
  const { tickets, loading, error } = useTickets("mine");

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTicketForRating, setSelectedTicketForRating] = useState(null);
  const [ratings, setRatings] = useState({});

  // Load existing CSAT ratings from local storage
  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("deskwise_ticket_ratings") || "{}"
      );
      setRatings(stored);
    } catch {
      // ignore parsing error
    }
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Filter only resolved or closed tickets
  const resolvedTickets = useMemo(() => {
    if (!tickets) return [];
    return tickets.filter(
      (t) => t.status === "resolved" || t.status === "closed"
    );
  }, [tickets]);

  // Apply search and status filters
  const filteredTickets = useMemo(() => {
    return resolvedTickets.filter((t) => {
      const matchSearch =
        !debouncedSearch.trim() ||
        t.subject?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        t.body_redacted?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        t.id?.toLowerCase().includes(debouncedSearch.toLowerCase());

      const matchStatus =
        statusFilter === "all" ||
        t.status?.toLowerCase() === statusFilter.toLowerCase();

      return matchSearch && matchStatus;
    });
  }, [resolvedTickets, debouncedSearch, statusFilter]);

  function handleRated(ticketId, stars) {
    const updated = { ...ratings, [ticketId]: { rating: stars } };
    setRatings(updated);
    localStorage.setItem("deskwise_ticket_ratings", JSON.stringify(updated));
    setSelectedTicketForRating(null);
  }

  if (loading) return <Loader fullScreen />;

  return (
    <div className="min-h-screen w-full bg-[#0a0c10] mx-auto max-w-5xl px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#f2b705]/30 bg-[#f2b705]/10 px-3 py-1 text-xs font-semibold text-[#f2b705] mb-2">
            <History className="h-3.5 w-3.5" />
            <span>Resolution Archive</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Ticket History
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Review your previously resolved and completed support requests.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/tickets"
            className="flex items-center gap-1.5 rounded-xl border border-[#232838] bg-[#141824] px-4 py-2 text-xs font-semibold text-gray-300 hover:border-[#f2b705]/50 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Active Tickets</span>
          </Link>
          <Link to="/tickets/new">
            <Button className="text-xs px-4 py-2">+ New Ticket</Button>
          </Link>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="mb-6 rounded-2xl border border-[#232838] bg-[#141824] p-4 shadow-xl">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          {/* Search Box (Expanded to 8 cols) */}
          <div className="relative sm:col-span-8">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search resolved tickets by keyword or ID…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-[#232838] bg-[#0f121a] py-2 pl-9 pr-3 text-sm text-gray-200 placeholder:text-gray-500 focus:border-[#f2b705] focus:outline-none transition-colors"
            />
          </div>

          {/* Status Filter (4 cols) */}
          <div className="relative sm:col-span-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full appearance-none rounded-xl border border-[#232838] bg-[#0f121a] py-2 pl-3 pr-8 text-sm text-gray-200 focus:border-[#f2b705] focus:outline-none transition-colors"
            >
              <option value="all">All Statuses (Resolved & Closed)</option>
              <option value="resolved">Resolved Only</option>
              <option value="closed">Closed Only</option>
            </select>
            <Filter className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
          </div>
        </div>

        {(debouncedSearch || statusFilter !== "all") && (
          <div className="mt-3 flex items-center justify-between border-t border-[#232838] pt-2 text-xs text-gray-400">
            <span>
              Showing {filteredTickets.length} of {resolvedTickets.length} resolved tickets
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
              }}
              className="text-[#f2b705] hover:underline cursor-pointer font-medium"
            >
              Reset filters
            </button>
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400 mb-6">
          {error}
        </div>
      )}

      {/* Empty State: No Resolved Tickets Yet */}
      {!error && resolvedTickets.length === 0 && (
        <div className="rounded-2xl border border-[#232838] bg-[#141824] p-12 text-center shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1b2030] border border-[#2e3447] text-gray-500 mb-3">
            <History className="h-7 w-7" />
          </div>
          <h3 className="text-base font-semibold text-gray-200">
            No resolved tickets yet
          </h3>
          <p className="mt-1 max-w-md mx-auto text-sm text-gray-400">
            Once your support inquiries are completed and resolved by an agent,
            they will be archived here for your review and records.
          </p>
          <Link to="/tickets" className="mt-5 inline-block">
            <Button>View Active Tickets</Button>
          </Link>
        </div>
      )}

      {/* Empty State: Search/Filter Match is 0 */}
      {!error && resolvedTickets.length > 0 && filteredTickets.length === 0 && (
        <div className="rounded-2xl border border-[#232838] bg-[#141824] p-8 text-center text-sm text-gray-400 shadow-xl">
          No resolved tickets matched your search criteria.
        </div>
      )}

      {/* Resolved Tickets List */}
      <div className="space-y-3">
        {filteredTickets.map((ticket) => {
          const userRating = ratings[ticket.id]?.rating;

          return (
            <div
              key={ticket.id}
              className="rounded-2xl border border-[#232838] bg-[#141824] p-5 hover:border-[#f2b705]/50 transition-all duration-200 group shadow-lg"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={clsx(
                        "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        getStatusBadgeClass(ticket.status)
                      )}
                    >
                      {ticket.status?.replace("_", " ")}
                    </span>

                    {ticket.priority && (
                      <span
                        className={clsx(
                          "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase",
                          getPriorityBadgeClass(ticket.priority)
                        )}
                      >
                        {ticket.priority}
                      </span>
                    )}

                    <span className="text-xs font-mono font-medium text-gray-500">
                      #{ticket.id?.slice(0, 8).toUpperCase()}
                    </span>
                  </div>

                  <Link to={`/tickets/${ticket.id}`}>
                    <h3 className="text-base font-semibold text-white mt-2 group-hover:text-[#f2b705] transition-colors truncate">
                      {ticket.subject}
                    </h3>
                  </Link>

                  <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                    {ticket.body_redacted ||
                      ticket.body ||
                      ticket.description ||
                      "No description available"}
                  </p>
                </div>

                <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-2 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-[#232838]/60">
                  <div className="text-right">
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-gray-500" />
                      {formatRelativeTime(
                        ticket.updated_at || ticket.created_at
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {userRating ? (
                      <span className="inline-flex items-center gap-1 rounded-xl bg-amber-400/10 border border-amber-400/30 px-2.5 py-1 text-xs font-semibold text-amber-300">
                        <Star className="h-3 w-3 fill-amber-300" />
                        <span>{userRating}/5</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedTicketForRating(ticket)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#f2b705] hover:text-[#ffd24d] hover:underline cursor-pointer"
                      >
                        <Star className="h-3 w-3" />
                        <span>Rate resolution</span>
                      </button>
                    )}

                    <Link
                      to={`/tickets/${ticket.id}`}
                      className="flex items-center gap-1.5 text-xs font-semibold text-gray-200 group-hover:text-white rounded-xl bg-[#1b2030] hover:bg-[#232838] px-3.5 py-1.5 border border-[#2e3447] transition-all cursor-pointer"
                    >
                      <span>Review</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* CSAT Rating Modal */}
      {selectedTicketForRating && (
        <RatingModal
          ticket={selectedTicketForRating}
          isOpen={Boolean(selectedTicketForRating)}
          onClose={() => setSelectedTicketForRating(null)}
          onRated={handleRated}
        />
      )}
    </div>
  );
}

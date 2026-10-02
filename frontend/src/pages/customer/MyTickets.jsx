import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Filter,
  HelpCircle,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useTickets } from "../../hooks/useTickets";
import TicketStatus from "../../components/customer/TicketStatus";
import Loader from "../../components/common/Loader";
import Button from "../../components/common/Button";

export default function MyTickets() {
  const { tickets, loading, error } = useTickets("mine");

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset to first page when search, filter, or ticket dataset changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, tickets]);

  // Only active tickets (exclude resolved & closed — those go to History)
  const activeTickets = useMemo(() => {
    if (!tickets) return [];
    return tickets.filter(
      (t) => !["resolved", "closed"].includes(t.status?.toLowerCase()),
    );
  }, [tickets]);

  // Client-side filtering
  const filteredTickets = useMemo(() => {
    return activeTickets.filter((t) => {
      const matchSearch =
        !debouncedSearch.trim() ||
        t.subject?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        t.body_redacted
          ?.toLowerCase()
          .includes(debouncedSearch.toLowerCase()) ||
        t.description?.toLowerCase().includes(debouncedSearch.toLowerCase());

      const matchStatus =
        statusFilter === "all" ||
        t.status?.toLowerCase() === statusFilter.toLowerCase();

      return matchSearch && matchStatus;
    });
  }, [activeTickets, debouncedSearch, statusFilter]);

  // Pagination Calculations
  const totalItems = filteredTickets.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const paginatedTickets = useMemo(() => {
    return filteredTickets.slice(startIndex, endIndex);
  }, [filteredTickets, startIndex, endIndex]);

  const getPageNumbers = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (safePage <= 3) {
      return [1, 2, 3, 4, "...", totalPages];
    }
    if (safePage >= totalPages - 2) {
      return [
        1,
        "...",
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ];
    }
    return [1, "...", safePage - 1, safePage, safePage + 1, "...", totalPages];
  };

  if (loading) return <Loader fullScreen />;

  return (
    <div className="min-h-screen w-full bg-[#0a0c10] max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header & New Ticket / FAQ Buttons */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">
            My Tickets
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
            Track and manage your submitted support requests.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Link
            to="/faq"
            className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-xs font-medium text-gray-300 hover:border-accent hover:text-accent transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
            <span>Help / FAQ</span>
          </Link>
          <Link to="/tickets/new">
            <Button className="flex items-center gap-1 text-xs sm:text-sm px-3.5 py-2">
              <Plus className="h-4 w-4" />
              <span>New Ticket</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* FAQ Callout Banner */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface-card/60 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <HelpCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              Need a quick answer?
            </p>
            <p className="text-xs text-gray-400">
              Check our frequently asked questions before submitting a new
              ticket.
            </p>
          </div>
        </div>
        <Link
          to="/faq"
          className="text-xs font-semibold text-accent hover:underline shrink-0 sm:self-center"
        >
          View FAQ →
        </Link>
      </div>

      {/* Search & Filter Controls Bar */}
      <div className="mb-6 rounded-xl border border-surface-border bg-surface-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          {/* Search Box */}
          <div className="relative sm:col-span-8">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search by subject or keyword…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-bg py-2 pl-9 pr-3 text-sm text-gray-200 placeholder:text-gray-500 focus:border-accent focus:outline-none"
            />
          </div>

          {/* Status Filter */}
          <div className="relative sm:col-span-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full appearance-none rounded-lg border border-surface-border bg-surface-bg py-2 pl-3 pr-8 text-sm text-gray-200 focus:border-accent focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="pending">Pending</option>
            </select>
            <Filter className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
          </div>
        </div>

        {/* Active Filter Counts */}
        {(debouncedSearch || statusFilter !== "all") && (
          <div className="mt-3 flex items-center justify-between border-t border-surface-border/60 pt-2 text-xs text-gray-400">
            <span>
              Showing {filteredTickets.length} of {activeTickets.length} tickets
            </span>
            <button
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
              }}
              className="text-accent hover:underline cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        )}
      </div>

      {/* Ticket List */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {!error && activeTickets.length === 0 && (
        <div className="rounded-2xl border border-surface-border bg-surface-card p-12 text-center">
          <p className="text-base font-medium text-gray-300">No tickets yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Have an issue or question? Submit your first ticket to get started.
          </p>
          <Link to="/tickets/new" className="mt-4 inline-block">
            <Button>+ Create Ticket</Button>
          </Link>
        </div>
      )}

      {!error && activeTickets.length > 0 && filteredTickets.length === 0 && (
        <div className="rounded-xl border border-surface-border bg-surface-card p-8 text-center text-sm text-gray-500">
          No tickets matched your filter criteria.
        </div>
      )}

      {/* Paginated Ticket Cards */}
      <div className="space-y-3">
        {paginatedTickets.map((t) => (
          <Link
            key={t.id}
            to={`/tickets/${t.id}`}
            className="block transition-transform hover:-translate-y-0.5"
          >
            <TicketStatus ticket={t} />
          </Link>
        ))}
      </div>

      {/* Pagination Controls */}
      {totalItems > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 mt-6 border-t border-surface-border text-xs text-gray-400">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Showing <strong className="text-white">{startIndex + 1}</strong>{" "}
              to <strong className="text-white">{endIndex}</strong> of{" "}
              <strong className="text-white">{totalItems}</strong> tickets
            </span>
            <div className="flex items-center gap-1.5 ml-1">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-surface-border bg-surface-bg px-2 py-1 text-xs text-gray-200 focus:border-accent focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={safePage === 1}
                className="p-1.5 rounded-lg border border-surface-border bg-surface-card text-gray-400 hover:text-white hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="First Page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="p-1.5 rounded-lg border border-surface-border bg-surface-card text-gray-400 hover:text-white hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous Page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-1 px-1">
                {getPageNumbers().map((item, idx) =>
                  item === "..." ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="px-1 text-gray-500"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCurrentPage(item)}
                      className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-semibold transition-colors ${
                        safePage === item
                          ? "bg-accent text-black shadow-sm"
                          : "border border-surface-border bg-surface-card text-gray-300 hover:border-accent hover:text-white"
                      }`}
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={safePage === totalPages}
                className="p-1.5 rounded-lg border border-surface-border bg-surface-card text-gray-400 hover:text-white hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next Page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safePage === totalPages}
                className="p-1.5 rounded-lg border border-surface-border bg-surface-card text-gray-400 hover:text-white hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Last Page"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

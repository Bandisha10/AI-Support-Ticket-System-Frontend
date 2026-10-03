import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MessageSquare,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  isTicketUnread,
  markTicketViewed,
  useTicketViewSync,
} from "../../utils/ticketViewTracking";
import { STATUS_COLORS, SENTIMENT_COLORS } from "../../utils/constants";
import { formatRelativeTime } from "../../utils/formatters";
import SLAWatcher from "./SLAWatcher";

export default function TicketTable({
  tickets = [],
  loading,
  renderActions,
  departments = [],
  extraFilter,
  isHistory = false,
}) {
  useTicketViewSync();
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState(
    isHistory ? "opened_desc" : "default",
  );

  useEffect(() => {
    if (isHistory) {
      setSortOrder("opened_desc");
    } else {
      setSortOrder("default");
    }
  }, [isHistory]);

  const handleToggleOpenedSort = () => {
    setSortOrder((prev) => {
      if (isHistory) {
        return prev === "opened_desc" ? "opened_asc" : "opened_desc";
      }
      if (prev === "opened_desc") return "opened_asc";
      if (prev === "opened_asc") return "default";
      return "opened_desc";
    });
    setCurrentPage(1);
  };

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, priorityFilter, sortOrder, tickets]);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset to first page when search, filters, or dataset changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, priorityFilter, tickets]);

  const departmentNameById = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d.name])),
    [departments],
  );

  // Client-side filtering with Escalations Pinned to Top
  const filteredTickets = useMemo(() => {
    if (!tickets) return [];
    const filtered = tickets.filter((t) => {
      const matchSearch =
        !debouncedSearch.trim() ||
        t.subject?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        t.customer_email
          ?.toLowerCase()
          .includes(debouncedSearch.toLowerCase()) ||
        t.body_redacted?.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchStatus =
        isHistory ||
        statusFilter === "all" ||
        t.status?.toLowerCase() === statusFilter.toLowerCase();

      const matchPriority =
        priorityFilter === "all" ||
        t.priority?.toLowerCase() === priorityFilter.toLowerCase();
      return matchSearch && matchStatus && matchPriority;
    });

    // Pin active escalations to the top
    return filtered.sort((a, b) => {
      if (sortOrder === "opened_desc") {
        return (
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
        );
      }
      if (sortOrder === "opened_asc") {
        return (
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime()
        );
      }

      // Default: Pin active escalations to the top
      const aUrgent =
        (a.priority === "high" || a.sentiment === "negative") &&
        a.status !== "resolved" &&
        a.status !== "closed";
      const bUrgent =
        (b.priority === "high" || b.sentiment === "negative") &&
        b.status !== "resolved" &&
        b.status !== "closed";
      if (aUrgent && !bUrgent) return -1;
      if (!aUrgent && bUrgent) return 1;

      // Secondary sort: prioritize tickets closest to SLA resolution deadline
      const aDue =
        a.sla_due_at && a.status !== "resolved" && a.status !== "closed"
          ? new Date(a.sla_due_at).getTime()
          : Infinity;
      const bDue =
        b.sla_due_at && b.status !== "resolved" && b.status !== "closed"
          ? new Date(b.sla_due_at).getTime()
          : Infinity;
      return aDue - bDue;
    });
  }, [tickets, debouncedSearch, statusFilter, priorityFilter, sortOrder]);

  // Pagination Slicing
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

  // Only show cold loader if we have literally no tickets yet
  if (loading && tickets.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-gray-500">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-accent border-r-transparent mb-2" />
        <p>Loading queue…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search tickets by subject, keyword, customer…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface-bg py-2 pl-9 pr-3 text-xs text-gray-200 placeholder:text-gray-400 focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Status Filter (Hidden on History) */}
          {!isHistory && (
            <div className="relative min-w-[130px]">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full appearance-none rounded-lg border border-surface-border bg-surface-bg py-2 pl-3 pr-8 text-xs text-gray-200 focus:border-accent focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="pending">Pending</option>
              </select>
              <Filter className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
            </div>
          )}

          {/* Priority Filter */}
          <div className="relative min-w-[130px]">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full appearance-none rounded-lg border border-surface-border bg-surface-bg py-2 pl-3 pr-8 text-xs text-gray-200 focus:border-accent focus:outline-none"
            >
              <option value="all">All Priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <Filter className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
          </div>

          {/* Sort By Open Time */}
          <div className="relative min-w-[150px]">
            <select
              value={sortOrder}
              onChange={(e) => {
                setSortOrder(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full appearance-none rounded-lg border border-surface-border bg-surface-bg py-2 pl-3 pr-8 text-xs text-gray-200 focus:border-accent focus:outline-none"
            >
              {!isHistory && <option value="default">SLA / Escalation</option>}
              <option value="opened_desc">Newest Opened</option>
              <option value="opened_asc">Oldest Opened</option>
            </select>
            <ArrowUpDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
          </div>

          {extraFilter}
        </div>
      </div>

      {/* Table */}
      {!filteredTickets.length ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          No tickets matched your filter criteria.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="border-b border-surface-border text-xs uppercase text-gray-400 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Subject</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Sentiment</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">SLA</th>
                  <th className="py-2.5 px-3">
                    <button
                      type="button"
                      onClick={handleToggleOpenedSort}
                      className="inline-flex items-center gap-1 uppercase font-semibold text-xs text-gray-400 hover:text-white transition-colors group cursor-pointer"
                      title="Click to sort by open time"
                    >
                      <span>Opened</span>
                      {sortOrder === "opened_desc" ? (
                        <ArrowDown className="h-3.5 w-3.5 text-accent" />
                      ) : sortOrder === "opened_asc" ? (
                        <ArrowUp className="h-3.5 w-3.5 text-accent" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-gray-600 group-hover:text-gray-400" />
                      )}
                    </button>
                  </th>

                  {renderActions && <th className="py-2.5 px-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedTickets.map((t) => {
                  const hasCustomerReply =
                    t.status !== "resolved" &&
                    t.status !== "closed" &&
                    isTicketUnread(t, "agent");

                  return (
                    <tr
                      key={t.id}
                      className={clsx(
                        "border-b border-surface-border last:border-0 hover:bg-surface-hover transition-colors",
                        hasCustomerReply &&
                          "bg-amber-400/[0.04] border-l-2 border-l-[#f2b705]",
                      )}
                    >
                      <td className="py-3 px-3 whitespace-normal min-w-[200px] sm:min-w-[240px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            to={`/agent/tickets/${t.id}`}
                            onClick={() => markTicketViewed(t.id)}
                            className="font-medium text-accent hover:underline"
                          >
                            {t.subject}
                          </Link>

                          {hasCustomerReply && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/15 border border-amber-400/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 animate-pulse">
                              <MessageSquare className="h-2.5 w-2.5" />
                              <span>Customer Replied</span>
                            </span>
                          )}

                          {(t.priority === "high" ||
                            t.sentiment === "negative") &&
                            t.status !== "resolved" &&
                            t.status !== "closed" && (
                              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                                Escalated
                              </span>
                            )}
                        </div>

                        {t.classification_confidence !== null && (
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            Department:{" "}
                            {departmentNameById[t.department_id] || "General"}
                            {t.classification_confidence !== undefined && (
                              <span>
                                {" "}
                                (
                                {(t.classification_confidence * 100).toFixed(0)}
                                % confidence)
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 text-xs text-gray-400">
                        {t.customer_email || t.customer_name || "Customer"}
                      </td>
                      <td className="py-3 px-3 text-xs capitalize text-gray-300">
                        {t.priority || "Normal"}
                      </td>
                      <td className="py-3 px-3">
                        {t.sentiment ? (
                          <span
                            className={clsx(
                              "rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                              SENTIMENT_COLORS[t.sentiment],
                            )}
                          >
                            {t.sentiment}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={clsx(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                            STATUS_COLORS[t.status],
                          )}
                        >
                          {t.status?.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <SLAWatcher dueAt={t.sla_due_at} />
                      </td>
                      <td className="py-3 px-3 text-xs text-gray-500">
                        {formatRelativeTime(t.created_at)}
                      </td>
                      {renderActions && (
                        <td className="py-3 px-3">{renderActions(t)}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Industry-Standard Pagination Controls */}
          {totalItems > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-surface-border text-xs text-gray-400">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  Showing{" "}
                  <strong className="text-white">{startIndex + 1}</strong> to{" "}
                  <strong className="text-white">{endIndex}</strong> of{" "}
                  <strong className="text-white">{totalItems}</strong> tickets
                </span>
                <div className="flex items-center gap-1.5 ml-1">
                  <span>Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-surface-border bg-surface-bg px-2 py-1 text-xs text-gray-200 focus:border-accent focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={safePage === 1}
                    className="p-1.5 rounded-lg border border-surface-border bg-surface-bg text-gray-400 hover:text-white hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="First Page"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="p-1.5 rounded-lg border border-surface-border bg-surface-bg text-gray-400 hover:text-white hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                              : "border border-surface-border bg-surface-bg text-gray-300 hover:border-accent hover:text-white"
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
                    className="p-1.5 rounded-lg border border-surface-border bg-surface-bg text-gray-400 hover:text-white hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Next Page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={safePage === totalPages}
                    className="p-1.5 rounded-lg border border-surface-border bg-surface-bg text-gray-400 hover:text-white hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Last Page"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

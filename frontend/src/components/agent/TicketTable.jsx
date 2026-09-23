import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import {
  Search,
  Filter,
  CheckSquare,
  UserCheck,
  XCircle,
  Loader2,
} from "lucide-react";
import { STATUS_COLORS, SENTIMENT_COLORS } from "../../utils/constants"; // SENTIMENT_COLORS is new
import { formatRelativeTime } from "../../utils/formatters";
import SLAWatcher from "./SLAWatcher";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../common/Toast";
import * as ticketService from "../../services/ticketService";

export default function TicketTable({
  tickets = [],
  loading,
  renderActions,
  departments = [],
  onBulkUpdated,
}) {
  const { user } = useAuth();
  const { showToast } = useToast();

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // Bulk Selection State (Feature 6)
  const [selectedTicketIds, setSelectedTicketIds] = useState(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const departmentNameById = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d.name])),
    [departments],
  );

  // Client-side filtering (Feature 1)
  const filteredTickets = useMemo(() => {
    if (!tickets) return [];
    return tickets.filter((t) => {
      const matchSearch =
        !debouncedSearch.trim() ||
        t.subject?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        t.customer_email
          ?.toLowerCase()
          .includes(debouncedSearch.toLowerCase()) ||
        t.body_redacted?.toLowerCase().includes(debouncedSearch.toLowerCase());

      const matchStatus =
        statusFilter === "all" ||
        t.status?.toLowerCase() === statusFilter.toLowerCase();

      const matchPriority =
        priorityFilter === "all" ||
        t.priority?.toLowerCase() === priorityFilter.toLowerCase();

      return matchSearch && matchStatus && matchPriority;
    });
  }, [tickets, debouncedSearch, statusFilter, priorityFilter]);

  // Bulk selection helpers
  const allFilteredSelected =
    filteredTickets.length > 0 &&
    filteredTickets.every((t) => selectedTicketIds.has(t.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedTicketIds(new Set());
    } else {
      setSelectedTicketIds(new Set(filteredTickets.map((t) => t.id)));
    }
  }

  function toggleSelectRow(id) {
    setSelectedTicketIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Bulk action: Assign to me
  async function handleBulkAssignToMe() {
    if (!user?.id || selectedTicketIds.size === 0) return;
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedTicketIds);
      for (const id of ids) {
        await ticketService.assignTicket(id, user.id);
      }
      showToast(`Assigned ${ids.length} ticket(s) to you`, "success");
      setSelectedTicketIds(new Set());
      onBulkUpdated?.();
    } catch (err) {
      showToast("Error updating some tickets", "error");
    } finally {
      setBulkActionLoading(false);
    }
  }

  // Bulk action: Close selected
  async function handleBulkClose() {
    if (selectedTicketIds.size === 0) return;
    if (!window.confirm(`Close ${selectedTicketIds.size} selected ticket(s)?`))
      return;
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedTicketIds);
      for (const id of ids) {
        await ticketService.updateTicketStatus(id, "closed");
      }
      showToast(`Closed ${ids.length} ticket(s)`, "success");
      setSelectedTicketIds(new Set());
      onBulkUpdated?.();
    } catch (err) {
      showToast("Error closing some tickets", "error");
    } finally {
      setBulkActionLoading(false);
    }
  }

  if (loading)
    return (
      <p className="text-sm text-gray-500 py-6 text-center">Loading queue…</p>
    );

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar (Feature 1) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
        <div className="relative sm:col-span-6">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search tickets by subject, keyword, customer…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface-bg py-2 pl-9 pr-3 text-xs text-gray-200 placeholder:text-gray-400 focus:border-accent focus:outline-none"
          />
        </div>

        <div className="relative sm:col-span-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full appearance-none rounded-lg border border-surface-border bg-surface-bg py-2 pl-3 pr-8 text-xs text-gray-200 focus:border-accent focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <Filter className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
        </div>

        <div className="relative sm:col-span-3">
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
      </div>

      {/* Bulk Action Floating / Action Bar (Feature 6) */}
      {selectedTicketIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 backdrop-blur-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-accent" />
            <span className="text-xs font-semibold text-white">
              {selectedTicketIds.size} ticket
              {selectedTicketIds.size > 1 ? "s" : ""} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkAssignToMe}
              disabled={bulkActionLoading}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-black hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {bulkActionLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserCheck className="h-3.5 w-3.5" />
              )}
              <span>Assign to Me</span>
            </button>

            <button
              onClick={handleBulkClose}
              disabled={bulkActionLoading}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/30 transition-colors disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              <span>Close Selected</span>
            </button>

            <button
              onClick={() => setSelectedTicketIds(new Set())}
              className="text-xs text-gray-400 hover:text-white px-2 py-1"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {!filteredTickets.length ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          No tickets matched your filter criteria.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="border-b border-surface-border text-xs uppercase text-gray-400 font-semibold">
              <tr>
                <th className="py-2.5 px-3">Subject</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Priority</th>
                {/* New: Sentiment column header, sits between Priority and Status */}
                <th className="py-2.5 px-3">Sentiment</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">SLA</th>
                <th className="py-2.5 px-3">Opened</th>
                {renderActions && <th className="py-2.5 px-3">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map((t) => {
                return (
                  <tr
                    key={t.id}
                    className="border-b border-surface-border last:border-0 hover:bg-surface-hover transition-colors"
                  >
                    <td className="py-3 px-3 whitespace-normal min-w-[240px]">
                      <Link
                        to={`/agent/tickets/${t.id}`}
                        className="font-medium text-accent hover:underline block"
                      >
                        {t.subject}
                      </Link>
                      {t.classification_confidence !== null && (
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          Department:{" "}
                          {departmentNameById[t.department_id] || "General"}
                          {t.classification_confidence !== undefined && (
                            <span>
                              {" "}
                              ({(t.classification_confidence * 100).toFixed(0)}%
                              AI confidence)
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
                    {/*
                      New: Sentiment cell.
                      Tickets created before this feature shipped will have
                      sentiment === null, so we fall back to a plain dash
                      instead of rendering an empty/undefined badge.
                    */}
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
      )}
    </div>
  );
}
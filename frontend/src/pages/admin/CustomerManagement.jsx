import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
// frontend/src/pages/admin/CustomerManagement.jsx (around line 7)
import {
  Users,
  UserCheck,
  ShieldAlert,
  RotateCcw,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  Calendar,
  Ticket,
  ExternalLink,
  ArrowUpDown,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import clsx from "clsx";
import * as adminService from "../../services/adminService";
import { useToast } from "../../components/common/Toast";
import ConfirmModal from "../../components/common/ConfirmModal";
import { STATUS_COLORS, SENTIMENT_COLORS } from "../../utils/constants";
import {
  formatDateTime,
  formatRelativeTime,
  formatDisplayName,
  formatInitials,
} from "../../utils/formatters";
import { formatIndianPhone } from "../../utils/phoneFormat";

export default function CustomerManagement() {
  const { showToast } = useToast();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "active" | "banned"
  const [sortBy, setSortBy] = useState("created_desc");
  const [expandedId, setExpandedId] = useState(null);
  const [customerTickets, setCustomerTickets] = useState({});
  const [loadingTicketsId, setLoadingTicketsId] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [copiedEmail, setCopiedEmail] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  // Load customer summaries
  const loadCustomers = async () => {
    try {
      const data = await adminService.getCustomersSummary(false);
      setCustomers(data || []);
    } catch (err) {
      showToast(
        err.response?.data?.detail || "Failed to load customers.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  // Fetch tickets on toggle expand
  const handleToggleExpand = async (customerId) => {
    if (expandedId === customerId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(customerId);

    // If tickets not cached yet, fetch them
    if (!customerTickets[customerId]) {
      setLoadingTicketsId(customerId);
      try {
        const tickets = await adminService.getCustomerTickets(customerId);
        setCustomerTickets((prev) => ({
          ...prev,
          [customerId]: tickets || [],
        }));
      } catch (err) {
        showToast("Failed to fetch tickets for this customer.", "error");
      } finally {
        setLoadingTicketsId(null);
      }
    }
  };

  // Copy email helper
  const handleCopyEmail = (email, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    showToast("Email copied to clipboard", "success");
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  // BAN / UNBAN ACTION
  const handleToggleBan = (customer, e) => {
    e.stopPropagation();
    const willBeBanned = customer.is_active; // If currently active, next state is banned (is_active: false)
    const actionLabel = willBeBanned ? "Ban Account" : "Unban Account";

    setConfirmModal({
      title: `${actionLabel}: ${customer.first_name || customer.email}`,
      message: willBeBanned
        ? `Are you sure you want to ban ${
            customer.first_name || customer.email
          }? They will be suspended from logging in or submitting support tickets.`
        : `Are you sure you want to unban ${
            customer.first_name || customer.email
          }? They will be able to log in and submit support tickets again.`,
      confirmText: actionLabel,
      variant: willBeBanned ? "danger" : "primary",
      onConfirm: async () => {
        setActionLoadingId(customer.id);
        try {
          await adminService.updateAgentAvailability(
            customer.id,
            !willBeBanned,
          );
          setCustomers((prev) =>
            prev.map((c) =>
              c.id === customer.id ? { ...c, is_active: !willBeBanned } : c,
            ),
          );
          showToast(
            `Customer account ${willBeBanned ? "banned" : "unbanned"} successfully.`,
            "success",
          );
        } catch (err) {
          showToast(
            err.response?.data?.detail || `Failed to update customer status.`,
            "error",
          );
        } finally {
          setActionLoadingId(null);
          setConfirmModal(null);
        }
      },
    });
  };

  // SOFT DELETE (ARCHIVE) / RESTORE ACTION
  const handleToggleArchive = (customer, e) => {
    e.stopPropagation();
    const willArchive = !customer.is_archive;
    const actionLabel = willArchive
      ? "Soft-Delete (Archive)"
      : "Restore Account";

    setConfirmModal({
      title: `${actionLabel}: ${customer.first_name || customer.email}`,
      message: willArchive
        ? `Are you sure you want to soft-delete ${
            customer.first_name || customer.email
          }? The account will be archived and deactivated. Historical tickets will be preserved.`
        : `Are you sure you want to restore ${
            customer.first_name || customer.email
          }? Their account and ticket access will be reactivated.`,
      confirmText: actionLabel,
      variant: willArchive ? "danger" : "primary",
      onConfirm: async () => {
        setActionLoadingId(customer.id);
        try {
          if (willArchive) {
            await adminService.archiveUser(customer.id);
            setCustomers((prev) =>
              prev.map((c) =>
                c.id === customer.id
                  ? { ...c, is_archive: true, is_active: false }
                  : c,
              ),
            );
            showToast("Customer account soft-deleted/archived.", "success");
          } else {
            await adminService.unarchiveUser(customer.id);
            setCustomers((prev) =>
              prev.map((c) =>
                c.id === customer.id
                  ? { ...c, is_archive: false, is_active: true }
                  : c,
              ),
            );
            showToast("Customer account restored successfully.", "success");
          }
        } catch (err) {
          showToast(err.response?.data?.detail || "Action failed.", "error");
        } finally {
          setActionLoadingId(null);
          setConfirmModal(null);
        }
      },
    });
  };

  // KPI Metrics Calculations
  const stats = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((c) => c.is_active).length;
    const banned = customers.filter((c) => !c.is_active).length;
    return { total, active, banned };
  }, [customers]);
  // Filter & Sort
  const filteredCustomers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const result = customers.filter((c) => {
      const name = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
      const email = (c.email || "").toLowerCase();
      const phone = (c.phone_number || "").toLowerCase();
      const matchSearch =
        !term ||
        name.includes(term) ||
        email.includes(term) ||
        phone.includes(term);
      let matchStatus = true;
      if (statusFilter === "active") {
        matchStatus = c.is_active;
      } else if (statusFilter === "banned") {
        matchStatus = !c.is_active;
      }
      return matchSearch && matchStatus;
    });

    return result.sort((a, b) => {
      if (sortBy === "created_desc") {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
      if (sortBy === "created_asc") {
        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      }
      if (sortBy === "tickets_desc") {
        return (b.total_tickets || 0) - (a.total_tickets || 0);
      }
      if (sortBy === "name_asc") {
        const nameA =
          `${a.first_name || ""} ${a.last_name || ""}`.trim() || a.email;
        const nameB =
          `${b.first_name || ""} ${b.last_name || ""}`.trim() || b.email;
        return nameA.localeCompare(nameB);
      }
      if (sortBy === "name_desc") {
        const nameA =
          `${a.first_name || ""} ${a.last_name || ""}`.trim() || a.email;
        const nameB =
          `${b.first_name || ""} ${b.last_name || ""}`.trim() || b.email;
        return nameB.localeCompare(nameA);
      }
      return 0;
    });
  }, [customers, searchTerm, statusFilter, sortBy]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center text-gray-400 text-sm">
        <Loader2 className="h-6 w-6 animate-spin text-accent mr-2" />
        Loading customer directory...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0c10] text-white p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Customer Management
        </h1>
        <p className="text-xs text-gray-400 mt-1">
          Inspect registered customers, monitor ticket statistics, and manage
          account statuses.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <div className="rounded-xl border border-[#232632] bg-[#11131a] p-4">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>Total Customers</span>
            <Users className="h-4 w-4 text-accent" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center justify-between text-xs text-emerald-400 mb-2">
            <span>Active Customers</span>
            <UserCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400">{stats.active}</p>
        </div>

        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <div className="flex items-center justify-between text-xs text-rose-400 mb-2">
            <span>Banned / Suspended</span>
            <ShieldAlert className="h-4 w-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-400">{stats.banned}</p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="rounded-xl border border-[#232632] bg-[#11131a] p-4 mb-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search by name, email, or phone number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-bg py-2 pl-9 pr-3 text-xs text-gray-200 placeholder:text-gray-500 focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Status Filter */}
            <div className="relative min-w-[140px]">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full appearance-none rounded-lg border border-surface-border bg-surface-bg py-2 pl-3 pr-8 text-xs text-gray-200 focus:border-accent focus:outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="banned">Banned Only</option>
              </select>

              <Filter className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
            </div>

            {/* Sort Dropdown */}
            <div className="relative min-w-[160px]">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full appearance-none rounded-lg border border-surface-border bg-surface-bg py-2 pl-3 pr-8 text-xs text-gray-200 focus:border-accent focus:outline-none cursor-pointer"
              >
                <option value="created_desc">Newest First</option>
                <option value="created_asc">Oldest First</option>
                <option value="tickets_desc">Most Tickets Created</option>
                <option value="name_asc">Name(A → Z)</option>
                <option value="name_desc">Name(Z → A)</option>
              </select>
              <ArrowUpDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
            </div>
          </div>
        </div>

        {/* Results Count */}
        <div className="mt-3 flex items-center justify-between border-t border-[#1a1d27] pt-2 text-xs text-gray-500">
          <span>
            Showing {filteredCustomers.length} of {customers.length} customers
          </span>
          {(searchTerm || statusFilter !== "all") && (
            <button
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
              }}
              className="text-accent hover:underline cursor-pointer"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* Customer Accordion List */}
      <div className="space-y-3">
        {filteredCustomers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#232632] bg-[#11131a] p-12 text-center text-gray-500 text-sm">
            No customers match your search and filter criteria.
          </div>
        ) : (
          filteredCustomers.map((customer) => {
            const isExpanded = expandedId === customer.id;
            const displayName =
              [customer.first_name, customer.last_name]
                .filter(Boolean)
                .join(" ")
                .trim() || formatDisplayName(null, customer.email, "Customer");
            const initials = formatInitials(displayName || customer.email);
            const isBanned = !customer.is_active;
            const isArchived = customer.is_archive;

            return (
              <div
                key={customer.id}
                className={clsx(
                  "rounded-xl border transition-all bg-[#0e111a] overflow-hidden",
                  isExpanded
                    ? "border-accent/40 shadow-lg shadow-black/40"
                    : "border-[#232632] hover:border-[#343a4d]",
                )}
              >
                {/* Collapsed Header / Row */}
                <div
                  onClick={() => handleToggleExpand(customer.id)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={clsx(
                        "w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0",
                        isBanned
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-accent/20 text-accent border border-accent/30",
                      )}
                    >
                      {initials}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white text-sm truncate">
                          {displayName}
                        </span>

                        {/* Status Badges */}
                        {isBanned ? (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            Banned
                          </span>
                        ) : (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Active
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3 text-gray-500 shrink-0" />
                          {customer.email}
                        </span>
                        {customer.phone_number && (
                          <span className="hidden md:flex items-center gap-1 text-gray-500">
                            <Phone className="h-3 w-3 shrink-0" />
                            {formatIndianPhone(customer.phone_number)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side: Ticket counts & Actions */}
                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span className="rounded-md bg-[#161a26] border border-[#232632] px-2 py-0.5 text-[11px] font-semibold text-gray-300">
                        {customer.total_tickets} tickets
                      </span>
                      {customer.open_tickets > 0 && (
                        <span className="rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                          {customer.open_tickets} open
                        </span>
                      )}
                    </div>

                    {/* Quick Action Buttons */}
                    <div
                      className="flex items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Ban / Unban Button */}
                      <button
                        type="button"
                        disabled={actionLoadingId === customer.id}
                        onClick={(e) => handleToggleBan(customer, e)}
                        className={clsx(
                          "px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer",
                          customer.is_active
                            ? "bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                            : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20",
                        )}
                        title={
                          customer.is_active
                            ? "Ban Customer Account"
                            : "Unban Customer Account"
                        }
                      >
                        {customer.is_active ? "Ban" : "Unban"}
                      </button>

                      {/* Expand Toggle */}
                      <div className="p-1 text-gray-400 hover:text-white transition-colors">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-accent" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Details Section */}
                {isExpanded && (
                  <div className="border-t border-[#1a1e2b] bg-[#090b11] p-4 sm:p-5 space-y-5 animate-in fade-in">
                    {/* Customer Profile & Statistics Overview */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Customer Details Box */}
                      <div className="rounded-xl border border-[#1f2433] bg-[#0e111a] p-4 space-y-3">
                        <h3 className="text-xs uppercase font-bold text-gray-400 tracking-wider">
                          Customer Profile Details
                        </h3>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-gray-500 block">
                              Full Name
                            </span>
                            <span className="text-white font-medium">
                              {displayName}
                            </span>
                          </div>

                          <div>
                            <span className="text-gray-500 block">
                              Account Status
                            </span>
                            <span
                              className={clsx(
                                "font-semibold uppercase text-[11px]",
                                isBanned ? "text-rose-400" : "text-emerald-400",
                              )}
                            >
                              {isBanned ? "Banned (Suspended)" : "Active"}
                            </span>
                          </div>

                          <div>
                            <span className="text-gray-500 block">
                              Email Address
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-gray-200 font-medium truncate">
                                {customer.email}
                              </span>
                              <button
                                type="button"
                                onClick={(e) =>
                                  handleCopyEmail(customer.email, e)
                                }
                                className="text-gray-500 hover:text-accent p-0.5 cursor-pointer"
                                title="Copy Email"
                              >
                                {copiedEmail === customer.email ? (
                                  <Check className="h-3 w-3 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>

                          <div>
                            <span className="text-gray-500 block">
                              Phone Number
                            </span>
                            <span className="text-gray-200 font-medium">
                              {customer.phone_number
                                ? formatIndianPhone(customer.phone_number)
                                : "Not provided"}
                            </span>
                          </div>

                          <div className="col-span-2 border-t border-[#1a1e2b] pt-2">
                            <span className="text-gray-500 block">
                              Account Created At
                            </span>
                            <span className="text-gray-300 font-medium">
                              {customer.created_at
                                ? `${formatDateTime(customer.created_at)} (${formatRelativeTime(
                                    customer.created_at,
                                  )})`
                                : "N/A"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Ticket Metrics Breakdown Box */}
                      <div className="rounded-xl border border-[#1f2433] bg-[#0e111a] p-4 flex flex-col justify-between">
                        <h3 className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">
                          Ticket Activity Breakdown
                        </h3>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="rounded-lg bg-[#141824] border border-[#232838] p-3 text-center">
                            <p className="text-xs text-gray-400">
                              Total Created
                            </p>
                            <p className="text-xl font-bold text-white mt-0.5">
                              {customer.total_tickets}
                            </p>
                          </div>

                          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 text-center">
                            <p className="text-xs text-amber-400">
                              Open / In Progress
                            </p>
                            <p className="text-xl font-bold text-amber-400 mt-0.5">
                              {customer.open_tickets}
                            </p>
                          </div>

                          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3 text-center">
                            <p className="text-xs text-emerald-400">Resolved</p>
                            <p className="text-xl font-bold text-emerald-400 mt-0.5">
                              {customer.resolved_tickets}
                            </p>
                          </div>

                          <div className="rounded-lg bg-[#141824] border border-[#232838] p-3 text-center">
                            <p className="text-xs text-gray-400">Closed</p>
                            <p className="text-xl font-bold text-gray-300 mt-0.5">
                              {customer.closed_tickets}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 text-right">
                          <span className="text-[11px] text-gray-500">
                            Unresolved: {customer.open_tickets} • Solved Ratio:{" "}
                            {customer.total_tickets > 0
                              ? Math.round(
                                  ((customer.resolved_tickets +
                                    customer.closed_tickets) /
                                    customer.total_tickets) *
                                    100,
                                )
                              : 0}
                            %
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Customer Tickets Table */}
                    <div className="rounded-xl border border-[#1f2433] bg-[#0e111a] overflow-hidden">
                      <div className="px-4 py-3 bg-[#131722] border-b border-[#1f2433] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Ticket className="h-4 w-4 text-accent" />
                          <span className="font-semibold text-xs text-white uppercase tracking-wider">
                            Tickets Created by{" "}
                            {customer.first_name || "Customer"}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-400">
                          {customerTickets[customer.id]?.length || 0} tickets
                          loaded
                        </span>
                      </div>

                      {loadingTicketsId === customer.id ? (
                        <div className="py-8 flex items-center justify-center text-xs text-gray-500">
                          <Loader2 className="h-4 w-4 animate-spin text-accent mr-2" />
                          Loading tickets...
                        </div>
                      ) : !customerTickets[customer.id]?.length ? (
                        <div className="py-8 text-center text-xs text-gray-500">
                          This customer has not created any support tickets yet.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs whitespace-nowrap">
                            <thead className="border-b border-[#1f2433] text-[10px] uppercase text-gray-400 font-semibold bg-[#0a0d14]">
                              <tr>
                                <th className="py-2.5 px-3">Subject</th>
                                <th className="py-2.5 px-3">Department</th>
                                <th className="py-2.5 px-3">Status</th>
                                <th className="py-2.5 px-3">Priority</th>
                                <th className="py-2.5 px-3">Sentiment</th>
                                <th className="py-2.5 px-3">Assigned Agent</th>
                                <th className="py-2.5 px-3">Opened</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#181c28]">
                              {customerTickets[customer.id].map((t) => (
                                <tr
                                  key={t.id}
                                  className="hover:bg-[#141824] transition-colors"
                                >
                                  <td className="py-2.5 px-3 font-medium">
                                    <Link
                                      to={`/agent/tickets/${t.id}`}
                                      className="text-accent hover:underline flex items-center gap-1 max-w-[280px] truncate"
                                      title="Open Ticket"
                                    >
                                      <span className="truncate">
                                        {t.subject}
                                      </span>
                                      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                                    </Link>
                                  </td>
                                  <td className="py-2.5 px-3 text-gray-400">
                                    {t.department_name}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={clsx(
                                        "rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                                        STATUS_COLORS[t.status] ||
                                          "text-gray-400",
                                      )}
                                    >
                                      {t.status?.replace("_", " ")}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-gray-300 capitalize">
                                    {t.priority || "Normal"}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    {t.sentiment ? (
                                      <span
                                        className={clsx(
                                          "rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                                          SENTIMENT_COLORS[t.sentiment],
                                        )}
                                      >
                                        {t.sentiment}
                                      </span>
                                    ) : (
                                      <span className="text-gray-600">—</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-gray-400 truncate max-w-[150px]">
                                    {t.assigned_agent_email}
                                  </td>
                                  <td className="py-2.5 px-3 text-gray-500">
                                    {formatRelativeTime(t.created_at)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(confirmModal)}
        onClose={() => setConfirmModal(null)}
        {...confirmModal}
      />
    </div>
  );
}

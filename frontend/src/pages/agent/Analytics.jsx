import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  Star,
  CheckCircle2,
  Clock,
  Inbox,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Calendar,
  Users,
  Building2,
  UserCheck,
} from "lucide-react";
import * as ticketService from "../../services/ticketService";
import * as adminService from "../../services/adminService";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../components/common/Toast";
import { formatRelativeTime } from "../../utils/formatters";

export default function AgentAnalytics() {
  const { user } = useAuth();
  const isManager =
    user?.agent_tier === 2 ||
    user?.agent_tier === "2" ||
    user?.agent_tier === "manager";

  const { showToast } = useToast();
  const [viewMode, setViewMode] = useState(
    isManager ? "department" : "personal",
  );
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState("week");

  // Local calendar date helper (YYYY-MM-DD)
  const getLocalDateString = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const today = getLocalDateString(new Date());

  // Default custom range: 7 days ago to today (now to past dates only)
  const defaultStartDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return getLocalDateString(d);
  })();

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(today);
  const maxFromDate = endDate && endDate < today ? endDate : today;

  useEffect(() => {
    loadAnalytics(true);
    const interval = setInterval(() => {
      loadAnalytics(false);
    }, 12000);
    return () => clearInterval(interval);
  }, [viewMode, dateRange, startDate, endDate]);

  async function loadAnalytics(isInitial = false) {
    if (isInitial) setLoading(true);
    else setIsRefreshing(true);
    try {
      const params = { date_range: dateRange };
      if (dateRange === "custom") {
        params.start_date = startDate;
        params.end_date = endDate;
      }

      if (viewMode === "department") {
        const res = await adminService.getAnalyticsOverview(params);
        setData(res);
      } else {
        const res = await ticketService.getAgentAnalytics(params);
        setData(res);
      }
    } catch (err) {
      console.error("Failed to load analytics", err);
    } finally {
      if (isInitial) setLoading(false);
      else setIsRefreshing(false);
    }
  }

  function handleExportCSV() {
    if (!data) return;

    try {
      const rangeLabel =
        dateRange === "custom"
          ? `CUSTOM (${startDate} to ${endDate})`
          : dateRange.toUpperCase();

      let csv = "Deskwise Individual Agent Performance Report\n";
      csv += `Generated at,${new Date().toISOString()}\n`;
      csv += `Agent Name,${data.agent_name}\n`;
      csv += `Agent Email,${data.agent_email}\n`;
      csv += `Date Range,${rangeLabel}\n\n`;

      csv += "OVERALL METRICS\n";
      csv += "Metric,Value\n";
      csv += `Total Assigned Tickets,${data.total_tickets || 0}\n`;
      csv += `Active Tickets,${data.active_count || 0}\n`;
      csv += `Resolved Tickets,${data.resolved_count || 0}\n`;
      csv += `Closed Tickets,${data.closed_count || 0}\n`;
      csv += `Resolution Rate,${resolutionRate}%\n`;
      csv += `Average Response Time,${data.avg_response_label || "N/A"}\n`;
      csv += `CSAT Rating,${data.sla_compliance?.csat ? `${data.sla_compliance.csat}/5` : "No ratings"}\n\n`;

      csv += "TICKETS BY STATUS\n";
      csv += "Status,Count\n";
      (data.tickets_by_status || []).forEach((s) => {
        csv += `"${s.name}",${s.count}\n`;
      });
      csv += "\n";

      csv += "TICKETS BY PRIORITY\n";
      csv += "Priority,Count\n";
      (data.tickets_by_priority || []).forEach((p) => {
        csv += `"${p.name}",${p.count}\n`;
      });
      csv += "\n";

      if (data.recent_activity?.length > 0) {
        csv += "RECENT RESOLVED TICKETS & FEEDBACK\n";
        csv += "Ticket ID,Subject,Status,Rating,Feedback\n";
        data.recent_activity.forEach((t) => {
          csv += `"${t.id}","${t.subject.replace(/"/g, '""')}","${t.status}",${t.rating || "N/A"},"${(t.feedback || "").replace(/"/g, '""')}"\n`;
        });
      }

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `agent-analytics-${data.agent_name}-${dateRange}-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast("Agent analytics report exported", "success");
    } catch (err) {
      console.error("Export failed", err);
      showToast("Failed to generate CSV export", "error");
    }
  }

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center text-[#9ca3af] text-[13px]">
        Loading your analytics...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0a0c10] flex flex-col items-center justify-center text-red-400 text-[13px] gap-3">
        <span>Failed to load your analytics.</span>
        <button
          onClick={() => loadAnalytics(true)}
          className="rounded-lg bg-surface-card border border-surface-border px-3 py-1.5 text-xs text-gray-200 hover:text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  // Pure CSS Donut chart calculation
  const statusColors = {
    open: "#fbbf24",
    in_progress: "#3b82f6",
    pending: "#a78bfa",
    resolved: "#34d399",
    closed: "#6b7280",
  };

  let cumulative = 0;
  const slices = [];
  (data.tickets_by_status || []).forEach((s) => {
    if (s.count > 0 && data.total_tickets > 0) {
      const start = cumulative;
      const pct = (s.count / data.total_tickets) * 100;
      cumulative += pct;
      const color = statusColors[s.name] || "#6b7280";
      slices.push(`${color} ${start.toFixed(1)}% ${cumulative.toFixed(1)}%`);
    }
  });
  if (cumulative < 100 && slices.length > 0) {
    slices.push(`#232632 ${cumulative.toFixed(1)}% 100%`);
  }
  const donutGradient =
    slices.length > 0
      ? `conic-gradient(${slices.join(", ")})`
      : "conic-gradient(#232632 0% 100%)";

  const csat = data.sla_compliance?.csat;

  const resolvedAndClosed =
    (data?.resolved_count || 0) + (data?.closed_count || 0);
  const resolutionRate =
    data?.resolution_rate !== undefined && data?.resolution_rate !== null
      ? data.resolution_rate
      : data?.total_tickets > 0
        ? ((resolvedAndClosed / data.total_tickets) * 100).toFixed(1)
        : "0.0";

  return (
    <div className="min-h-screen bg-[#0a0c10] text-white p-4 sm:p-6 lg:p-8">
      {/* Manager View Switcher */}
      {isManager && (
        <div className="mb-6 flex items-center gap-2 border-b border-[#232632] pb-4">
          <button
            onClick={() => setViewMode("department")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              viewMode === "department"
                ? "bg-[#fbbf24] text-black shadow-md"
                : "border border-[#232632] bg-[#141824] text-gray-300 hover:text-white"
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Department Overview</span>
          </button>
          <button
            onClick={() => setViewMode("personal")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              viewMode === "personal"
                ? "bg-[#fbbf24] text-black shadow-md"
                : "border border-[#232632] bg-[#141824] text-gray-300 hover:text-white"
            }`}
          >
            <UserCheck className="h-4 w-4" />
            <span>My Personal Metrics</span>
          </button>
        </div>
      )}

      {/* Header & Controls */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold capitalize">
            {viewMode === "department"
              ? "Department Performance Analytics"
              : "Performance Analytics"}
          </h1>
          <p className="text-[13px] text-[#9ca3af] mt-0.5">
            {viewMode === "department"
              ? `Department metrics and resolution trends for ${data?.department_name || user?.department_name || "Department"}`
              : `Individual metrics and resolution trends for ${data?.agent_email || user?.email}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isRefreshing && (
            <RefreshCw className="h-3.5 w-3.5 text-[#f2b705] animate-spin" />
          )}

          {/* Date Range Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-[#232632] bg-[#141824] p-1">
              <button
                onClick={() => setDateRange("week")}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  dateRange === "week"
                    ? "bg-[#f2b705] text-black font-semibold shadow-sm"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => setDateRange("month")}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  dateRange === "month"
                    ? "bg-[#f2b705] text-black font-semibold shadow-sm"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                This Month
              </button>
              <button
                onClick={() => setDateRange("custom")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  dateRange === "custom"
                    ? "bg-[#f2b705] text-black font-semibold shadow-sm"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>Custom Date</span>
              </button>
            </div>

            {/* Custom Date Range Picker (Calendar Based) */}
            {dateRange === "custom" && (
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-xl border border-[#232632] bg-[#141824] px-3 py-1.5 animate-in fade-in">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-[#f2b705] shrink-0" />
                  <input
                    type="date"
                    max={maxFromDate}
                    value={startDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setStartDate("");
                        return;
                      }
                      const safeVal = val > maxFromDate ? maxFromDate : val;
                      setStartDate(safeVal);
                    }}
                    className="bg-transparent text-xs text-white border-0 focus:outline-none [color-scheme:dark] cursor-pointer w-[110px] sm:w-auto"
                    title="Start Date"
                  />
                </div>
                <span className="text-gray-500 text-xs">to</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  max={today}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      setEndDate("");
                      return;
                    }
                    const safeVal = val > today ? today : val;
                    setEndDate(safeVal);
                    if (startDate && safeVal < startDate) {
                      setStartDate(safeVal);
                    }
                  }}
                  className="bg-transparent text-xs text-white border-0 focus:outline-none [color-scheme:dark] cursor-pointer w-[110px] sm:w-auto"
                  title="End Date"
                />
              </div>
            )}
          </div>

          {/* Export CSV Button */}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-xl border border-[#232632] bg-[#181b26] px-3.5 py-2 text-xs font-semibold text-gray-200 hover:border-[#f2b705] hover:text-[#f2b705] transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#181b26] border border-[#232632] rounded-[16px] p-5">
          <div className="flex items-center justify-between text-[#9ca3af]">
            <p className="text-[11px] font-semibold tracking-wider uppercase">
              Assigned Tickets
            </p>
            <Inbox className="h-4 w-4 text-[#f2b705]" />
          </div>
          <h2 className="text-[28px] font-bold mt-2">
            {data.total_tickets?.toLocaleString() || 0}
          </h2>
          <p className="text-[11px] text-gray-400 mt-1">
            {data.active_count || 0} tickets currently active
          </p>
        </div>

        <div className="bg-[#181b26] border border-[#232632] rounded-[16px] p-5">
          <div className="flex items-center justify-between text-[#9ca3af]">
            <p className="text-[11px] font-semibold tracking-wider uppercase">
              Average Response
            </p>
            <Clock className="h-4 w-4 text-blue-400" />
          </div>
          <h2 className="text-[28px] font-bold mt-2 text-blue-400">
            {data.avg_response_label || "N/A"}
          </h2>
          <p className="text-[11px] text-gray-400 mt-1">
            First response time average
          </p>
        </div>

        <div className="bg-[#181b26] border border-[#232632] rounded-[16px] p-5">
          <div className="flex items-center justify-between text-[#9ca3af]">
            <p className="text-[11px] font-semibold tracking-wider uppercase">
              Resolution Rate
            </p>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <h2 className="text-[28px] font-bold mt-2 text-emerald-400">
            {resolutionRate}%
          </h2>
          <p className="text-[11px] text-gray-400 mt-1">
            {resolvedAndClosed} resolved or closed
          </p>
        </div>

        <div className="bg-[#181b26] border border-[#232632] rounded-[16px] p-5">
          <div className="flex items-center justify-between text-[#9ca3af]">
            <p className="text-[11px] font-semibold tracking-wider uppercase">
              Customer Satisfaction
            </p>
            <Star className="h-4 w-4 fill-[#f2b705] text-[#f2b705]" />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <h2 className="text-[28px] font-bold text-[#f2b705]">
              {csat !== null && csat !== undefined
                ? Number(csat).toFixed(1)
                : "—"}
            </h2>
            {csat !== null && csat !== undefined && (
              <span className="text-xs text-gray-400">/ 5.0</span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            Based on {data.sla_compliance?.ratings_count || 0} customer ratings
          </p>
        </div>
      </div>

      {/* Visual Analytics Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Donut Chart: Tickets by Status */}
        <div className="bg-[#181b26] border border-[#232632] rounded-[16px] p-6">
          <h3 className="text-sm font-semibold mb-4 text-gray-200">
            Tickets by Status
          </h3>

          <div className="flex items-center justify-center py-4">
            <div
              className="relative w-36 h-36 rounded-full flex items-center justify-center shadow-inner"
              style={{ background: donutGradient }}
            >
              <div className="w-24 h-24 rounded-full bg-[#181b26] flex flex-col items-center justify-center">
                <span className="text-xl font-bold">{data.total_tickets}</span>
                <span className="text-[10px] text-gray-400 uppercase">
                  Total
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5 mt-4">
            {(data.tickets_by_status || []).map((s) => {
              const pct =
                data.total_tickets > 0
                  ? ((s.count / data.total_tickets) * 100).toFixed(0)
                  : 0;
              const color = statusColors[s.name] || "#6b7280";
              return (
                <div
                  key={s.name}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="capitalize text-gray-300">
                      {s.name.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{s.count}</span>
                    <span className="text-gray-500 w-8 text-right">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tickets by Priority */}
        <div className="bg-[#181b26] border border-[#232632] rounded-[16px] p-6">
          <h3 className="text-sm font-semibold mb-4 text-gray-200">
            Tickets by Priority
          </h3>
          {!data.tickets_by_priority?.length ||
          data.tickets_by_priority.every((p) => p.count === 0) ? (
            <div className="py-12 text-center text-xs text-gray-500">
              No priority data recorded for this timeframe
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {(data.tickets_by_priority || []).map((p) => {
                const pct =
                  data.total_tickets > 0
                    ? ((p.count / data.total_tickets) * 100).toFixed(1)
                    : "0.0";
                const barColor =
                  p.name === "urgent"
                    ? "bg-red-500"
                    : p.name === "high"
                      ? "bg-amber-500"
                      : p.name === "medium"
                        ? "bg-blue-500"
                        : "bg-gray-500";

                return (
                  <div key={p.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="capitalize text-gray-300 font-medium">
                        {p.name}
                      </span>
                      <span className="text-gray-400">
                        {p.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#10121a] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor} transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tickets by Department */}
        <div className="bg-[#181b26] border border-[#232632] rounded-[16px] p-6">
          <h3 className="text-sm font-semibold mb-4 text-gray-200">
            Workload by Department
          </h3>
          {data.tickets_by_category?.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-500">
              No department tickets recorded
            </div>
          ) : (
            <div className="space-y-3.5 py-2">
              {data.tickets_by_category.map((d) => {
                const pct =
                  data.total_tickets > 0
                    ? ((d.count / data.total_tickets) * 100).toFixed(0)
                    : 0;
                return (
                  <div key={d.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-300">{d.name}</span>
                      <span className="font-semibold text-white">
                        {d.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[#10121a] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#f2b705] transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Resolved Activity & Feedback */}
      <div className="bg-[#181b26] border border-[#232632] rounded-[16px] p-6">
        <h3 className="text-sm font-semibold mb-4 text-gray-200">
          Recent Resolved Tickets & Customer Feedback
        </h3>

        {!data.recent_activity || data.recent_activity.length === 0 ? (
          <div className="py-8 text-center text-xs text-gray-500">
            No resolved tickets found for this period.
          </div>
        ) : (
          <div className="divide-y divide-[#232632]">
            {data.recent_activity.map((t) => (
              <div
                key={t.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/agent/tickets/${t.id}`}
                    className="text-xs font-semibold text-white truncate hover:text-[#f2b705] transition-colors block"
                  >
                    {t.subject}
                  </Link>
                  {t.feedback ? (
                    <p className="text-[11px] text-gray-400 italic mt-0.5">
                      "{t.feedback}"
                    </p>
                  ) : (
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      No text review provided
                    </p>
                  )}
                  <p className="text-[9px] text-gray-600 mt-0.5">
                    {t.resolved_at
                      ? formatRelativeTime(t.resolved_at)
                      : "Recently"}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {t.rating ? (
                    <div className="flex items-center gap-1 bg-[#232838] px-2.5 py-1 rounded-lg">
                      <Star className="h-3 w-3 fill-[#f2b705] text-[#f2b705]" />
                      <span className="text-xs font-bold text-white">
                        {t.rating}.0
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-gray-500 bg-[#12141c] px-2 py-1 rounded">
                      Not rated
                    </span>
                  )}
                  <span className="text-[10px] uppercase font-bold tracking-wider rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5">
                    {t.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

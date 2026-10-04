import { useState, useEffect } from "react";
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
  ArrowRight,
} from "lucide-react";

import * as adminService from "../../services/adminService";
import { useToast } from "../../components/common/Toast";

export default function Analytics() {
  const { showToast } = useToast();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState("week"); // "week" | "month" | "custom"

  // Local calendar date formatted as YYYY-MM-DD
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

    // Silent background poll every 15 seconds
    const interval = setInterval(() => {
      loadAnalytics(false);
    }, 15000);

    return () => clearInterval(interval);
  }, [dateRange, startDate, endDate]);

  async function loadAnalytics(isInitial = false) {
    if (isInitial) setLoading(true);
    else setIsRefreshing(true);
    try {
      const params = {
        date_range: dateRange,
      };
      if (dateRange === "custom") {
        params.start_date = startDate;
        params.end_date = endDate;
      }
      const data = await adminService.getAnalyticsOverview(params);
      setAnalytics(data);
    } catch (err) {
      console.error("Failed to load analytics data", err);
    } finally {
      if (isInitial) setLoading(false);
      else setIsRefreshing(false);
    }
  }

  // Export CSV client-side using Blob API
  function handleExportCSV() {
    if (!analytics) return;

    try {
      const resolvedAndClosed =
        (analytics.resolved_count || 0) + (analytics.closed_count || 0);
      const resRate =
        analytics.total_tickets > 0
          ? ((resolvedAndClosed / analytics.total_tickets) * 100).toFixed(1)
          : "0.0";

      const rangeLabel =
        dateRange === "custom"
          ? `CUSTOM (${startDate} to ${endDate})`
          : dateRange.toUpperCase();

      let csv = "Deskwise Analytics Report\n";
      csv += `Generated at,${new Date().toISOString()}\n`;
      csv += `Date Range,${rangeLabel}\n\n`;

      csv += "OVERALL METRICS\n";
      csv += "Metric,Value\n";
      csv += `Total Tickets,${analytics.total_tickets || 0}\n`;
      csv += `Average Response Time,${analytics.avg_response_label || "N/A"}\n`;
      csv += `Resolution Rate,${resRate}%\n`;
      csv += `CSAT Score,${hasCsatData ? `${csatScore}/5` : "No data"}\n\n`;

      csv += "TICKETS BY CATEGORY\n";
      csv += "Category,Ticket Count,Percentage\n";
      (analytics.tickets_by_category || []).forEach((c) => {
        const pct =
          analytics.total_tickets > 0
            ? ((c.count / analytics.total_tickets) * 100).toFixed(1)
            : "0.0";
        csv += `"${c.name.replace(/"/g, '""')}",${c.count},${pct}%\n`;
      });
      csv += "\n";

      csv += "TICKETS BY STATUS\n";
      csv += "Status,Ticket Count,Percentage\n";
      (analytics.tickets_by_status || []).forEach((s) => {
        const pct =
          analytics.total_tickets > 0
            ? ((s.count / analytics.total_tickets) * 100).toFixed(1)
            : "0.0";
        csv += `"${s.name.replace(/"/g, '""')}",${s.count},${pct}%\n`;
      });
      csv += "\n";

      if (analytics.agent_performance?.length > 0) {
        csv += "AGENT PERFORMANCE\n";
        csv += "Agent Name,Unresolved,Closed,Avg Time,Rating\n";
        analytics.agent_performance.forEach((a) => {
          csv += `"${a.name.replace(/"/g, '""')}",${a.unresolved_count},${a.closed_count},${a.avg_time},${a.rating}\n`;
        });
      }

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `deskwise-analytics-${dateRange}-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast("Analytics CSV exported successfully", "success");
    } catch (err) {
      console.error("Export failed:", err);
      showToast("Failed to generate CSV export", "error");
    }
  }

  if (loading && !analytics) {
    return (
      <div className="min-h-screen bg-[#0a0c10] flex flex-col items-center justify-center text-gray-400 gap-3">
        <RefreshCw className="h-6 w-6 text-[#f2b705] animate-spin" />
        <span className="text-xs font-medium tracking-wide">
          Loading analytics workspace…
        </span>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="min-h-screen bg-[#0a0c10] flex flex-col items-center justify-center text-rose-400 text-sm gap-3">
        <span>Failed to load analytics data.</span>
        <button
          onClick={() => loadAnalytics(true)}
          className="rounded-xl bg-[#141824] border border-[#232632] px-4 py-2 text-xs font-semibold text-gray-200 hover:text-white hover:border-[#f2b705] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Calculate resolution rate dynamically
  const resolvedAndClosed =
    (analytics?.resolved_count || 0) + (analytics?.closed_count || 0);
  const resolutionRate =
    analytics?.resolution_rate !== undefined &&
    analytics?.resolution_rate !== null
      ? analytics.resolution_rate
      : analytics?.total_tickets > 0
        ? ((resolvedAndClosed / analytics.total_tickets) * 100).toFixed(1)
        : "0.0";
  const csatRaw = analytics?.sla_compliance?.csat;
  const hasCsatData =
    csatRaw !== null &&
    csatRaw !== undefined &&
    csatRaw !== "" &&
    csatRaw !== "N/A" &&
    csatRaw !== "No data" &&
    !isNaN(Number(csatRaw));
  const csatScore = hasCsatData ? Number(csatRaw).toFixed(1) : null;

  // Real-time conic gradient calculation for Donut Chart
  const statusColors = {
    open: "#fbbf24",
    in_progress: "#3b82f6",
    pending: "#a78bfa",
    resolved: "#34d399",
    closed: "#6b7280",
  };

  let cumulative = 0;
  const slices = [];
  (analytics.tickets_by_status || []).forEach((s) => {
    if (s.count > 0 && analytics.total_tickets > 0) {
      const start = cumulative;
      const pct = (s.count / analytics.total_tickets) * 100;
      cumulative += pct;
      const color = statusColors[s.name] || "#6b7280";
      slices.push(`${color} ${start.toFixed(1)}% ${cumulative.toFixed(1)}%`);
    }
  });

  if (cumulative < 100 && slices.length > 0) {
    slices.push(`#232632 ${cumulative.toFixed(1)}% 100%`);
  }

  const statusProgressGradient =
    slices.length > 0
      ? `conic-gradient(${slices.join(", ")})`
      : "conic-gradient(#232632 0% 100%)";

  return (
    <div className="min-h-screen bg-[#0a0c10] text-white p-4 sm:p-6 lg:p-8">
      {/* Header */}
      {/* Header */}
      <div className="mb-5 flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Analytics Overview
          </h1>
          {isRefreshing && (
            <RefreshCw className="h-4 w-4 text-[#f2b705] animate-spin" />
          )}
        </div>
        <p className="text-xs sm:text-sm text-gray-400">
          Real-time support operations, SLA governance, and agent throughput
          performance.
        </p>
      </div>

      {/* Toolbar: Filters & Export CSV on the exact same row */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Segmented Date Range Filter */}
          <div className="flex items-center rounded-xl border border-[#232632] bg-[#141824] p-1 shadow-inner shrink-0">
            <button
              type="button"
              onClick={() => setDateRange("week")}
              className={`rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                dateRange === "week"
                  ? "bg-[#f2b705] text-black shadow-sm font-bold"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => setDateRange("month")}
              className={`rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                dateRange === "month"
                  ? "bg-[#f2b705] text-black shadow-sm font-bold"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => setDateRange("custom")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                dateRange === "custom"
                  ? "bg-[#f2b705] text-black shadow-sm font-bold"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Custom Date</span>
            </button>
          </div>

          {/* Custom Date Range Picker */}
          {dateRange === "custom" && (
            <div className="flex items-center gap-2 rounded-xl border border-[#232632] bg-[#141824] px-2.5 py-1.5 shadow-md animate-in fade-in shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">
                  From
                </span>
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
                  className="bg-transparent text-xs font-medium text-white border-0 focus:outline-none [color-scheme:dark] cursor-pointer w-[95px]"
                  title="Start Date"
                />
              </div>
              <ArrowRight className="h-3 w-3 text-gray-600 shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">
                  To
                </span>
                <input
                  type="date"
                  min={startDate || undefined}
                  max={today}
                  value={endDate}
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
                  className="bg-transparent text-xs font-medium text-white border-0 focus:outline-none [color-scheme:dark] cursor-pointer w-[95px]"
                  title="End Date"
                />
              </div>
            </div>
          )}
        </div>

        {/* Export CSV Button */}
        <button
          type="button"
          onClick={handleExportCSV}
          className="self-start sm:self-auto flex items-center gap-1.5 rounded-xl border border-[#232632] bg-[#141824] hover:bg-[#181b26] px-3.5 py-2 text-xs font-semibold text-gray-200 hover:text-white hover:border-[#f2b705] transition-all cursor-pointer shadow-sm active:scale-95 shrink-0 whitespace-nowrap"
        >
          <Download className="h-3.5 w-3.5 text-[#f2b705]" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Total Tickets */}
        <div className="relative overflow-hidden rounded-2xl border border-[#232632] bg-[#141824] p-5 shadow-lg transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Total Volume
            </span>
            <div className="rounded-lg bg-[#f2b705]/10 p-2 text-[#f2b705]">
              <Inbox className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h2 className="text-3xl font-extrabold tracking-tight text-white">
              {analytics.total_tickets?.toLocaleString() || 0}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              All tickets logged in window
            </p>
          </div>
        </div>

        {/* Avg Response Time */}
        <div className="relative overflow-hidden rounded-2xl border border-[#232632] bg-[#141824] p-5 shadow-lg transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Avg Response
            </span>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h2 className="text-3xl font-extrabold tracking-tight text-white">
              {analytics.avg_response_label || "N/A"}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              First response time average
            </p>
          </div>
        </div>

        {/* Resolution Rate */}
        <div className="relative overflow-hidden rounded-2xl border border-[#232632] bg-[#141824] p-5 shadow-lg transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Resolution Rate
            </span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h2 className="text-3xl font-extrabold tracking-tight text-emerald-400">
              {resolutionRate}%
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {resolvedAndClosed} closed or resolved
            </p>
          </div>
        </div>

        {/* CSAT Score */}
        <div className="relative overflow-hidden rounded-2xl border border-[#232632] bg-[#141824] p-5 shadow-lg transition-transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Customer CSAT
            </span>
            <div className="rounded-lg bg-amber-500/10 p-2 text-[#fbbf24]">
              <Star className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            {hasCsatData ? (
              <h2 className="text-3xl font-extrabold tracking-tight text-[#fbbf24]">
                {csatScore}{" "}
                <span className="text-lg font-medium text-gray-400">/ 5</span>
              </h2>
            ) : (
              <h2 className="text-2xl font-bold tracking-tight text-gray-500">
                No ratings
              </h2>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Customer satisfaction score
            </p>
          </div>
        </div>
      </div>

      {/* Analytics Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tickets by Category */}
        <div className="lg:col-span-2 rounded-2xl border border-[#232632] bg-[#141824] p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-base text-white">
                Tickets by Department
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Volume distribution across functional teams
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {!analytics.tickets_by_category?.length ? (
              <p className="text-gray-500 text-xs py-8 text-center">
                No department ticket data recorded.
              </p>
            ) : (
              analytics.tickets_by_category.map((c, i) => {
                const colors = [
                  "bg-[#fbbf24]",
                  "bg-[#3b82f6]",
                  "bg-[#a78bfa]",
                  "bg-[#34d399]",
                ];
                const color = colors[i % colors.length];
                const percent =
                  analytics.total_tickets > 0
                    ? Math.round((c.count / analytics.total_tickets) * 100)
                    : 0;
                return (
                  <div key={c.name} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-gray-200">
                        {c.name}
                      </span>
                      <span className="text-gray-400 font-semibold">
                        {c.count}{" "}
                        <span className="font-normal text-gray-500">
                          ({percent}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 bg-[#0a0c10] rounded-full overflow-hidden p-0.5 border border-[#232632]/50">
                      <div
                        className={`h-full ${color} rounded-full transition-all duration-700`}
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Tickets by Status & Donut Chart */}
        <div className="rounded-2xl border border-[#232632] bg-[#141824] p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base text-white">
                  Status Breakdown
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Active lifecycle proportion
                </p>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                <span>Live</span>
              </div>
            </div>

            {/* Donut Ring Visual */}
            <div className="flex justify-center my-6">
              <div
                className="w-36 h-36 rounded-full p-3 flex items-center justify-center transition-all duration-700 shadow-xl"
                style={{ background: statusProgressGradient }}
              >
                <div className="w-full h-full rounded-full bg-[#141824] border border-[#232632] flex flex-col items-center justify-center">
                  <span className="text-2xl font-extrabold text-white leading-tight">
                    {analytics.open_count || 0}
                  </span>
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                    Open Queue
                  </span>
                </div>
              </div>
            </div>

            {/* Status list with real-time horizontal bars */}
            <div className="space-y-3 text-xs">
              {analytics.tickets_by_status?.map((s) => {
                const statusColorsMap = {
                  open: "bg-[#fbbf24]",
                  in_progress: "bg-[#3b82f6]",
                  pending: "bg-[#a78bfa]",
                  resolved: "bg-[#34d399]",
                  closed: "bg-[#6b7280]",
                };
                const color = statusColorsMap[s.name] || "bg-gray-400";
                const percent =
                  analytics.total_tickets > 0
                    ? Math.round((s.count / analytics.total_tickets) * 100)
                    : 0;
                return (
                  <div className="space-y-1" key={s.name}>
                    <div className="flex justify-between items-center text-xs">
                      <span className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 ${color} rounded-full`}
                        ></span>
                        <span className="text-gray-300 capitalize font-medium">
                          {s.name.replace("_", " ")}
                        </span>
                      </span>
                      <span className="text-gray-400 font-semibold">
                        {s.count}{" "}
                        <span className="font-normal text-gray-500">
                          ({percent}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#0a0c10] rounded-full overflow-hidden border border-[#232632]/40">
                      <div
                        className={`h-full ${color} rounded-full transition-all duration-500`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Top Agents Performance Table */}
      <div className="rounded-2xl border border-[#232632] bg-[#141824] p-6 shadow-xl mt-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-base text-white">
              Top Agents Throughput
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Individual agent workload resolution metrics
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
            <Users className="h-4 w-4 text-[#f2b705]" />
            <span>
              {analytics.agent_performance?.length || 0} Agents active
            </span>
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="text-[11px] font-bold uppercase tracking-wider text-gray-400 border-b border-[#232632]">
              <tr>
                <th className="py-3 px-2">Agent Name</th>
                <th className="py-3 px-2">Unresolved</th>
                <th className="py-3 px-2">Resolved / Closed</th>
                <th className="py-3 px-2">Avg Response</th>
                <th className="py-3 px-2 text-right">CSAT Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232632]/50 text-gray-300">
              {!analytics.agent_performance?.length ? (
                <tr>
                  <td
                    colSpan="5"
                    className="py-8 text-center text-gray-500 text-xs"
                  >
                    No active agent performance logged for this timeframe.
                  </td>
                </tr>
              ) : (
                analytics.agent_performance.map((agent) => (
                  <tr
                    key={agent.id}
                    className="hover:bg-[#181b26] transition-colors"
                  >
                    <td className="py-3.5 px-2">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-[#f2b705]/15 border border-[#f2b705]/30 flex items-center justify-center font-bold text-[#f2b705] text-[11px]">
                          {(agent.name || agent.email || "A")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-white">
                            {agent.name}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            {agent.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-2 font-medium text-amber-400">
                      {agent.unresolved_count}
                    </td>
                    <td className="py-3.5 px-2 font-medium text-emerald-400">
                      {agent.closed_count}
                    </td>
                    <td className="py-3.5 px-2 text-gray-400">
                      {agent.avg_time || "N/A"}
                    </td>

                    <td className="py-3.5 px-2 text-right">
                      {agent.rating !== null &&
                      agent.rating !== undefined &&
                      agent.rating !== "N/A" &&
                      !isNaN(Number(agent.rating)) ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-[#fbbf24]">
                          <Star className="h-3 w-3 fill-current" />
                          <span>{Number(agent.rating).toFixed(1)}</span>
                        </span>
                      ) : (
                        <span className="text-gray-500 text-[11px]">
                          No data
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
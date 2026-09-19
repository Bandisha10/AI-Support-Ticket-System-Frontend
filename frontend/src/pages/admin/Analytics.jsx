import { useState, useEffect } from "react";
import { Download, Calendar, RefreshCw } from "lucide-react";
import * as adminService from "../../services/adminService";
import { useToast } from "../../components/common/Toast";

export default function Analytics() {
  const { showToast } = useToast();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState("custom"); // "week" | "month" | "custom"
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  useEffect(() => {
    loadAnalytics(true);

    // Real-time polling: refresh analytics data silently every 10 seconds
    const interval = setInterval(() => {
      loadAnalytics(false);
    }, 10000);

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
      <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center text-[#9ca3af] text-[13px]">
        Loading analytics...
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="min-h-screen bg-[#0a0c10] flex flex-col items-center justify-center text-red-400 text-[13px] gap-3">
        <span>Failed to load analytics data.</span>
        <button
          onClick={() => loadAnalytics(true)}
          className="rounded-lg bg-surface-card border border-surface-border px-3 py-1.5 text-xs text-gray-200 hover:text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  // Calculate resolution rate dynamically
  const resolvedAndClosed =
    (analytics.resolved_count || 0) + (analytics.closed_count || 0);
  const resolutionRate =
    analytics.total_tickets > 0
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

  // Real-time pure JS conic gradient calculation for By Status donut chart
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
    <div className="min-h-screen bg-[#0a0c10] text-white p-6 sm:p-8">
      {/* Header & Controls */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold">Analytics</h1>
          <p className="text-[13px] text-[#9ca3af] mt-0.5">
            Track your support performance, SLA compliance, and ticket trends.
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
              <div className="flex items-center gap-2 rounded-xl border border-[#232632] bg-[#141824] px-3 py-1 animate-in fade-in">
                <Calendar className="h-3.5 w-3.5 text-[#f2b705] shrink-0" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent text-xs text-white border-0 focus:outline-none [color-scheme:dark] cursor-pointer"
                  title="Start Date"
                />
                <span className="text-gray-500 text-xs">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-xs text-white border-0 focus:outline-none [color-scheme:dark] cursor-pointer"
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

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#181b26] border border-[#232632] rounded-[16px] p-5">
          <p className="text-[11px] tracking-widest text-[#9ca3af]">
            TOTAL TICKETS
          </p>
          <h2 className="text-[28px] font-bold mt-2">
            {analytics.total_tickets?.toLocaleString() || 0}
          </h2>
        </div>
        <div className="bg-[#181b26] border border-[#232632] rounded-[16px] p-5">
          <p className="text-[11px] tracking-widest text-[#9ca3af]">
            AVG RESPONSE
          </p>
          <h2 className="text-[28px] font-bold mt-2">
            {analytics.avg_response_label || "1h 45m"}
          </h2>
        </div>
        <div className="bg-[#181b26] border border-[#232632] rounded-[16px] p-5">
          <p className="text-[11px] tracking-widest text-[#9ca3af]">
            RESOLUTION RATE
          </p>
          <h2 className="text-[28px] font-bold mt-2">{resolutionRate}%</h2>
        </div>
        <div className="bg-[#181b26] border border-[#232632] rounded-[16px] p-5">
          <p className="text-[11px] tracking-widest text-[#9ca3af]">
            CSAT SCORE
          </p>
          {hasCsatData ? (
            <h2 className="text-[28px] font-bold mt-2 text-[#f2b705]">
              {csatScore}/5 ★
            </h2>
          ) : (
            <h2 className="text-[20px] font-medium mt-2 text-gray-400">
              No data
            </h2>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tickets by Category */}
        <div className="lg:col-span-2 bg-[#181b26] border border-[#232632] rounded-[16px] p-6">
          <h3 className="font-semibold text-[15px] mb-6">
            Tickets by Category
          </h3>
          <div className="space-y-4">
            {!analytics.tickets_by_category?.length ? (
              <p className="text-gray-500 text-sm">No ticket data available.</p>
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
                  <div key={c.name}>
                    <div className="flex justify-between text-[13px] mb-1.5">
                      <span className="font-medium text-gray-200">
                        {c.name}
                      </span>
                      <span className="text-[#9ca3af]">
                        {c.count} tickets ({percent}%)
                      </span>
                    </div>
                    <div className="h-2 bg-[#0f1117] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} rounded-full transition-all duration-500`}
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Tickets by Status */}
        <div className="bg-[#181b26] border border-[#232632] rounded-[16px] p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-[15px]">By Status</h3>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Live</span>
            </div>
          </div>

          {/* Dynamic Real-Time Donut Ring */}
          <div className="flex justify-center my-4">
            <div
              className="w-32 h-32 rounded-full p-2.5 flex items-center justify-center transition-all duration-700 shadow-lg"
              style={{ background: statusProgressGradient }}
            >
              <div className="w-full h-full rounded-full bg-[#181b26] flex flex-col items-center justify-center">
                <span className="text-[18px] font-bold text-white leading-tight">
                  {analytics.open_count || 0}
                </span>
                <span className="text-[11px] text-[#9ca3af] font-medium">Open</span>
              </div>
            </div>
          </div>

          {/* Status list with real-time horizontal progress bars */}
          <div className="space-y-3.5 mt-6 text-[13px]">
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
                <div className="space-y-1.5" key={s.name}>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 ${color} rounded-full`}></span>
                      <span className="text-gray-300 capitalize font-medium">
                        {s.name.replace("_", " ")}
                      </span>
                    </span>
                    <span className="text-gray-400">
                      {percent}% ({s.count})
                    </span>
                  </div>
                  {/* Real-time horizontal status progress bar */}
                  <div className="h-1.5 bg-[#0f1117] rounded-full overflow-hidden">
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

      {/* Bottom Table */}
      <div className="bg-[#181b26] border border-[#232632] rounded-[16px] p-6 mt-6">
        <h3 className="font-semibold text-[15px] mb-4">
          Top Agents Performance
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[#9ca3af] border-b border-[#232632]">
              <tr>
                <th className="py-3 font-normal">Agent</th>
                <th className="py-3 font-normal">Unresolved Tickets</th>
                <th className="py-3 font-normal">Closed Tickets</th>
                <th className="py-3 font-normal">Avg Time</th>
                <th className="py-3 font-normal">Rating</th>
              </tr>
            </thead>
            <tbody className="text-[#c2c4c8]">
              {!analytics.agent_performance?.length ? (
                <tr>
                  <td colSpan="5" className="py-4 text-center text-gray-500">
                    No agent activity recorded yet.
                  </td>
                </tr>
              ) : (
                analytics.agent_performance.map((agent) => (
                  <tr
                    key={agent.id}
                    className="border-b border-[#232632] last:border-0 hover:bg-surface-hover/30"
                  >
                    <td className="py-3 font-medium text-white">
                      {agent.name}
                    </td>
                    <td className="py-3">{agent.unresolved_count}</td>
                    <td className="py-3">{agent.closed_count}</td>
                    <td className="py-3">{agent.avg_time}</td>
                    <td className="py-3 text-[#fbbf24] font-semibold">
                      {agent.rating !== null &&
                      agent.rating !== undefined &&
                      agent.rating !== "N/A" &&
                      !isNaN(Number(agent.rating)) ? (
                        `${Number(agent.rating).toFixed(1)} ★`
                      ) : (
                        <span className="text-gray-500 font-normal">
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

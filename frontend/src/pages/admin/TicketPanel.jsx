import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, Calendar, X } from "lucide-react";
import { useTickets } from "../../hooks/useTickets";
import TicketTable from "../../components/agent/TicketTable";
import api from "../../services/api";

export default function AdminTicketPanel() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Load initial tab from URL query param ?tab=... or localStorage fallback
  const initialFilter = useMemo(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab && ["unassigned", "assigned"].includes(urlTab)) {
      return urlTab;
    }
    const saved = localStorage.getItem("deskwise_admin_panel_tab");
    if (saved && ["unassigned", "assigned"].includes(saved)) {
      return saved;
    }
    return "unassigned";
  }, []);

  const [filter, setFilter] = useState(initialFilter);
  const [selectedDept, setSelectedDept] = useState(
    searchParams.get("department_id") || "all"
  );
  const [dateFilter, setDateFilter] = useState(
    searchParams.get("date_range") ||
      (searchParams.get("created_at") ? "custom" : "all")
  );
  const [customDate, setCustomDate] = useState(
    searchParams.get("created_at") || ""
  );

  const handleFilterChange = (mode) => {
    setFilter(mode);
    localStorage.setItem("deskwise_admin_panel_tab", mode);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", mode);
        return next;
      },
      { replace: true }
    );
  };

  const handleDepartmentChange = (deptId) => {
    setSelectedDept(deptId);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (deptId && deptId !== "all") {
          next.set("department_id", deptId);
        } else {
          next.delete("department_id");
        }
        return next;
      },
      { replace: true }
    );
  };

  const handleDateFilterChange = (val) => {
    setDateFilter(val);
    if (val !== "custom") {
      setCustomDate("");
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (val && val !== "all") {
          if (val === "custom") {
            next.delete("date_range");
            if (customDate) next.set("created_at", customDate);
          } else {
            next.set("date_range", val);
            next.delete("created_at");
          }
        } else {
          next.delete("date_range");
          next.delete("created_at");
        }
        return next;
      },
      { replace: true }
    );
  };

  const handleCustomDateChange = (dateVal) => {
    setCustomDate(dateVal);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (dateVal) {
          next.set("created_at", dateVal);
          next.delete("date_range");
        } else {
          next.delete("created_at");
        }
        return next;
      },
      { replace: true }
    );
  };

  const handleClearFilters = () => {
    setSelectedDept("all");
    setDateFilter("all");
    setCustomDate("");
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("department_id");
        next.delete("date_range");
        next.delete("created_at");
        return next;
      },
      { replace: true }
    );
  };

  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab && ["unassigned", "assigned"].includes(urlTab)) {
      setFilter(urlTab);
      localStorage.setItem("deskwise_admin_panel_tab", urlTab);
    } else if (!urlTab) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", filter);
          return next;
        },
        { replace: true }
      );
    }
  }, [searchParams]);

  // Construct queryParams with triage flag, department, and created_at / date_range
  const queryParams = useMemo(() => {
    const p =
      filter === "unassigned"
        ? { needs_triage: true }
        : { needs_triage: false };

    if (selectedDept && selectedDept !== "all") {
      p.department_id = selectedDept;
    }

    if (dateFilter === "today") {
      p.date_range = "today";
    } else if (dateFilter === "week") {
      p.date_range = "week";
    } else if (dateFilter === "month") {
      p.date_range = "month";
    } else if (dateFilter === "custom" && customDate) {
      p.created_at = customDate;
    }

    return p;
  }, [filter, selectedDept, dateFilter, customDate]);

  const { tickets, loading, refetch } = useTickets("queue", queryParams);
  const [departments, setDepartments] = useState([]);

  // Real-time freshness: poll every 15s for new unclassified tickets
  useEffect(() => {
    const interval = setInterval(refetch, 15000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Load active departments for assignment dropdown and filtering
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await api.get("/departments/");
        setDepartments(res.data);
      } catch (err) {
        console.error("Failed to fetch departments", err);
      }
    };
    fetchDepartments();
  }, []);

  const handleAssignDepartment = async (ticketId, departmentId) => {
    if (!departmentId) return;
    try {
      await api.put(`/tickets/${ticketId}`, {
        department_id: departmentId,
        classification_confidence: 1.0,
      });
      await api.post("/replies/", {
        ticket_id: ticketId,
        body: `Admin assigned ticket to department ID: ${departmentId} and cleared Triage flag.`,
        is_system_log: true,
      });
      refetch();
    } catch (err) {
      console.error("Failed to assign department", err);
      alert("Failed to assign department.");
    }
  };

  const renderActions =
    filter === "unassigned"
      ? (ticket) => (
          <select
            className="bg-surface-bg text-gray-200 border border-surface-border text-sm rounded px-2 py-1.5 focus:outline-none focus:border-accent"
            onChange={(e) => handleAssignDepartment(ticket.id, e.target.value)}
            defaultValue=""
          >
            <option value="" disabled>
              Assign Dept...
            </option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )
      : null;

  // Filter toolbar inserted into TicketTable's extraFilter slot
  const extraFilter = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Department Filter */}
      <div className="relative min-w-[145px]">
        <select
          value={selectedDept}
          onChange={(e) => handleDepartmentChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-surface-border bg-surface-bg py-2 pl-3 pr-8 text-xs text-gray-200 focus:border-accent focus:outline-none cursor-pointer"
        >
          <option value="all">All Departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <Building2 className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
      </div>

      {/* Created At / Date Range Filter */}
      <div className="relative min-w-[130px]">
        <select
          value={dateFilter}
          onChange={(e) => handleDateFilterChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-surface-border bg-surface-bg py-2 pl-3 pr-8 text-xs text-gray-200 focus:border-accent focus:outline-none cursor-pointer"
        >
          <option value="all">All Dates</option>
          <option value="today">Created Today</option>
          <option value="week">Past 7 Days</option>
          <option value="month">Past 30 Days</option>
          <option value="custom">Exact Date…</option>
        </select>
        <Calendar className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
      </div>

      {/* Date Picker (shown if "Exact Date…" selected) */}
      {dateFilter === "custom" && (
        <input
          type="date"
          value={customDate}
          max={new Date().toISOString().split("T")[0]}
          onChange={(e) => handleCustomDateChange(e.target.value)}
          className="rounded-lg border border-surface-border bg-surface-bg py-1.5 px-3 text-xs text-gray-200 focus:border-accent focus:outline-none cursor-pointer"
        />
      )}

      {/* Clear Filters Button if any active */}
      {(selectedDept !== "all" || dateFilter !== "all" || customDate) && (
        <button
          type="button"
          onClick={handleClearFilters}
          className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-card px-2.5 py-2 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
          title="Clear department and date filters"
        >
          <X className="h-3.5 w-3.5 text-gray-400" />
          <span>Clear</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-[#0a0c10] p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">
            Ticket Triage Panel
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Manage unrouted tickets or track assigned ones.
          </p>
        </div>
        {/* Toggle Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => handleFilterChange("unassigned")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
              filter === "unassigned"
                ? "bg-[#f2b705] text-black font-semibold shadow-md"
                : "bg-[#181b26] border border-[#232632] text-gray-300 hover:text-white"
            }`}
          >
            Unassigned Tickets
          </button>
          <button
            onClick={() => handleFilterChange("assigned")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
              filter === "assigned"
                ? "bg-[#f2b705] text-black font-semibold shadow-md"
                : "bg-[#181b26] border border-[#232632] text-gray-300 hover:text-white"
            }`}
          >
            Assigned Tickets
          </button>
        </div>
      </div>
      <div className="rounded-2xl border border-[#232632] bg-[#141824] p-4 sm:p-6 shadow-xl">
        <TicketTable
          tickets={tickets}
          loading={loading}
          renderActions={renderActions}
          departments={departments}
          extraFilter={extraFilter}
        />
      </div>
    </div>
  );
}

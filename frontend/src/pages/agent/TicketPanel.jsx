import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  UserCheck,
  Inbox,
  Layers,
  Users,
  ShieldAlert,
  Clock,
  History,
  Filter,
} from "lucide-react";
import { useTickets } from "../../hooks/useTickets";
import { useAuth } from "../../hooks/useAuth";
import TicketTable from "../../components/agent/TicketTable";
import api from "../../services/api";
import {
  getDepartmentTeam,
  updateAgentAvailability,
} from "../../services/adminService";

export default function AgentTicketPanel() {
  const { user, refreshUser } = useAuth();
  const isManager =
    user?.agent_tier === 2 ||
    user?.agent_tier === "2" ||
    user?.agent_tier === "manager";

  const [searchParams, setSearchParams] = useSearchParams();

  // Load initial tab from URL query param ?tab=... or localStorage fallback
  const initialMode = useMemo(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab && ["mine", "unassigned", "all_dept"].includes(urlTab)) {
      return urlTab;
    }
    const saved = localStorage.getItem("deskwise_agent_panel_tab");
    if (saved && ["mine", "unassigned", "all_dept"].includes(saved)) {
      return saved;
    }
    return "mine";
  }, []);

  const [panelMode, setPanelMode] = useState(initialMode);
  const [statusFilter, setStatusFilter] = useState("all");
  const [departments, setDepartments] = useState([]);

  // Manager Team Modal State
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // 'all' = full department history, 'mine' = individually solved by logged-in manager/agent
  const [historyScope, setHistoryScope] = useState("all");

  // Filter out the manager so the availability modal only shows team members
  const departmentAgents = useMemo(() => {
    return teamMembers.filter(
      (m) =>
        m.id !== user?.id &&
        m.agent_tier !== 2 &&
        m.agent_tier !== "2" &&
        m.agent_tier !== "manager",
    );
  }, [teamMembers, user?.id]);

  const initialUrgent = useMemo(() => {
    return searchParams.get("urgent") === "true";
  }, []);
  const [filterEscalations, setFilterEscalations] = useState(initialUrgent);
  const initialSlaRisk = useMemo(() => {
    return searchParams.get("sla_risk") === "true";
  }, []);
  const [filterSlaRisk, setFilterSlaRisk] = useState(initialSlaRisk);

  // Sync state changes with URL and localStorage
  const handleTabChange = (mode, scope = historyScope) => {
    setPanelMode(mode);
    setCurrentPage(1);
    localStorage.setItem("deskwise_agent_panel_tab", mode);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", mode);
        return next;
      },
      { replace: true },
    );
    const p = {};
    if (mode === "mine" || mode === "my") {
      p.assigned_to_me = true;
    } else if (mode === "unassigned") {
      p.status = "open";
      p.unassigned_only = true;
    } else if (mode === "all_dept") {
      p.is_history = true;
      if (scope === "mine") {
        p.assigned_to_me = true; // Filters only tickets individually solved by this manager/agent
      }
    }
    fetchTickets(p);
  };

  const handleToggleEscalations = () => {
    setFilterEscalations((prev) => {
      const nextVal = !prev;
      setSearchParams(
        (sp) => {
          const next = new URLSearchParams(sp);
          if (nextVal) {
            next.set("urgent", "true");
          } else {
            next.delete("urgent");
          }
          return next;
        },
        { replace: true },
      );
      return nextVal;
    });
  };
  const handleToggleSlaRisk = () => {
    setFilterSlaRisk((prev) => {
      const nextVal = !prev;
      setSearchParams(
        (sp) => {
          const next = new URLSearchParams(sp);
          if (nextVal) {
            next.set("sla_risk", "true");
          } else {
            next.delete("sla_risk");
          }
          return next;
        },
        { replace: true },
      );
      return nextVal;
    });
  };
  // Keep state in sync if browser back/forward buttons are pressed
  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab && ["mine", "unassigned", "all_dept"].includes(urlTab)) {
      setPanelMode(urlTab);
      localStorage.setItem("deskwise_agent_panel_tab", urlTab);
    } else if (!urlTab) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", panelMode);
          return next;
        },
        { replace: true },
      );
    }
    const urlUrgent = searchParams.get("urgent") === "true";
    setFilterEscalations(urlUrgent);
    const urlSlaRisk = searchParams.get("sla_risk") === "true";
    setFilterSlaRisk(urlSlaRisk);
  }, [searchParams]);

  const params = useMemo(() => {
    const p = {};
    if (statusFilter !== "all") p.status = statusFilter;
    if (panelMode === "mine") {
      p.assigned_to_me = true;
    } else if (panelMode === "unassigned") {
      p.unassigned = true;
    } else if (panelMode === "all_dept") {
      p.is_history = true;
      if (historyScope === "mine") {
        p.assigned_to_me = true;
      }
    }
    // Only apply escalation and SLA risk filters when not on History table
    if (panelMode !== "all_dept") {
      if (filterEscalations) {
        p.escalated = true;
      }
      if (filterSlaRisk) {
        p.sla_status = "all_risk";
      }
    }
    return p;
  }, [panelMode, statusFilter, filterEscalations, filterSlaRisk, historyScope]);

  const { tickets, loading, refetch } = useTickets("queue", params);

  // Guarantee that the History tab only displays resolved or closed tickets
  const displayedTickets = useMemo(() => {
    if (!tickets) return [];
    if (panelMode === "all_dept") {
      const resolvedOrClosed = tickets.filter(
        (t) => t.status === "resolved" || t.status === "closed",
      );
      if (historyScope === "mine") {
        return resolvedOrClosed.filter((t) => t.assigned_agent_id === user?.id);
      }
      return resolvedOrClosed;
    }
    return tickets.filter(
      (t) => t.status !== "resolved" && t.status !== "closed",
    );
  }, [tickets, panelMode, historyScope, user?.id]);

  const escalatedCount = useMemo(() => {
    return (tickets || []).filter(
      (t) =>
        (t.priority === "high" || t.sentiment === "negative") &&
        t.status !== "resolved" &&
        t.status !== "closed",
    ).length;
  }, [tickets]);

  const slaRiskCount = useMemo(() => {
    const now = Date.now();
    return (tickets || []).filter((t) => {
      if (t.status === "resolved" || t.status === "closed") return false;
      if (!t.sla_due_at) return false;
      const dueTime = new Date(t.sla_due_at).getTime();
      return dueTime <= now + 60 * 60 * 1000;
    }).length;
  }, [tickets]);

  useEffect(() => {
    if (isManager) {
      loadTeam();
    }
  }, [isManager]);

  useEffect(() => {
    refreshUser?.();
    const interval = setInterval(() => {
      refetch();
      refreshUser?.();
    }, 15000);
    return () => clearInterval(interval);
  }, [refetch, refreshUser]);

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

  const loadTeam = async () => {
    if (!isManager) return;
    setTeamLoading(true);
    try {
      const data = await getDepartmentTeam();
      setTeamMembers(data);
    } catch (err) {
      console.error("Failed to fetch team members", err);
    } finally {
      setTeamLoading(false);
    }
  };

  const handleToggleAvailability = async (agent) => {
    const nextState = !agent.is_active;
    if (!nextState) {
      const confirmDeactivate = window.confirm(
        `Mark ${agent.first_name || agent.email} as Inactive? All their active tickets will automatically be reassigned to your Manager queue.`,
      );
      if (!confirmDeactivate) return;
    }
    setActionLoadingId(agent.id);
    try {
      await updateAgentAvailability(agent.id, nextState);
      await loadTeam();
      refetch();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to update availability");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleClaimTicket = async (ticket) => {
    if (actionLoadingId === ticket.id || ticket.assigned_agent_id === user?.id)
      return;
    setActionLoadingId(ticket.id);
    try {
      await api.put(`/tickets/${ticket.id}`, { assigned_agent_id: user.id });
      await api.post("/replies/", {
        ticket_id: ticket.id,
        body: `Agent ${user.email} assigned ticket to themselves.`,
        is_system_log: true,
      });
      refetch();
    } catch (err) {
      alert("Failed to assign ticket to yourself.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReassignToTriage = async (ticket) => {
    if (!window.confirm("Send this ticket back to admin triage?")) return;
    try {
      await api.put(`/tickets/${ticket.id}`, {
        department_id: null,
        assigned_agent_id: null,
        status: "open",
      });
      await api.post("/replies/", {
        ticket_id: ticket.id,
        body: `Manager ${user.email} reassigned ticket to Admin Triage (Invalid Department).`,
        is_system_log: true,
      });
      refetch();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to reassign ticket.");
    }
  };

  const handleQuickStatusChange = async (ticket, newStatus) => {
    try {
      await api.put(`/tickets/${ticket.id}`, { status: newStatus });
      refetch();
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0c10] p-4 sm:p-6 lg:p-8">
      {/* Header and Controls */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-white">
              {isManager
                ? "Department Manager Dashboard"
                : "Support Agent Panel"}
            </h1>
            {isManager && (
              <span className="rounded-md border border-[#fbbf24]/40 bg-[#fbbf24]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#fbbf24]">
                DEPARTMENT MANAGER
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-1">
            {isManager
              ? "Oversee department workload, manage escalations, and delegate tickets."
              : "Manage your personal assigned queue and triage department tickets."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Manager Team Availability Button */}
          {isManager && (
            <button
              onClick={() => {
                setShowTeamModal(true);
                loadTeam();
              }}
              className="flex items-center gap-2 rounded-xl border border-[#fbbf24]/50 bg-[#fbbf24]/15 px-4 py-2 text-xs font-semibold text-[#fbbf24] hover:bg-[#fbbf24]/25 transition-colors cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" />
              <span>Team Availability</span>
            </button>
          )}
          <button
            onClick={() => handleTabChange("mine")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              panelMode === "mine"
                ? "bg-[#f2b705] text-black font-bold"
                : "bg-[#181b26] border border-[#232632] text-gray-300 hover:text-white"
            }`}
          >
            <UserCheck className="h-3.5 w-3.5" />
            <span>Assigned to Me</span>
          </button>
          <button
            onClick={() => handleTabChange("unassigned")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              panelMode === "unassigned"
                ? "bg-[#f2b705] text-black font-bold"
                : "bg-[#181b26] border border-[#232632] text-gray-300 hover:text-white"
            }`}
          >
            <Inbox className="h-3.5 w-3.5" />
            <span>Dept Queue</span>
          </button>
          <button
            onClick={() => handleTabChange("all_dept")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              panelMode === "all_dept"
                ? "bg-[#f2b705] text-black font-bold"
                : "bg-[#181b26] border border-[#232632] text-gray-300 hover:text-white"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>History</span>
          </button>
        </div>
      </div>

      {/* Ticket Table */}
      <div className="rounded-2xl border border-[#232632] bg-[#141824] p-4 shadow-xl">
        <TicketTable
          tickets={displayedTickets}
          loading={loading}
          departments={departments}
          extraFilter={
            panelMode === "all_dept" ? (
              /* Dropdown for History table */
              <div className="relative min-w-[190px]">
                <select
                  value={historyScope}
                  onChange={(e) => {
                    const newScope = e.target.value;
                    setHistoryScope(newScope);
                    handleTabChange("all_dept", newScope);
                  }}
                  className="w-full appearance-none rounded-lg border border-surface-border bg-surface-bg py-2 pl-3 pr-8 text-xs font-medium text-gray-200 focus:border-accent focus:outline-none cursor-pointer"
                >
                  <option value="all">Department Solved</option>
                  <option value="mine">Solved By Me</option>
                </select>
                <Filter className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
              </div>
            ) : (
              /* Urgent Escalations & SLA At Risk for active queues */
              <div className="flex items-center gap-2">
                {isManager && (
                  <button
                    type="button"
                    onClick={handleToggleEscalations}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      filterEscalations
                        ? "bg-red-500 text-white shadow-md shadow-red-500/25"
                        : "bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20"
                    }`}
                    title="Filter tickets with High Priority or Negative Sentiment"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Urgent Escalations</span>
                    {escalatedCount > 0 && (
                      <span
                        className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                          filterEscalations
                            ? "bg-white text-red-600"
                            : "bg-red-950/80 text-red-300 border border-red-500/40"
                        }`}
                      >
                        {escalatedCount}
                      </span>
                    )}
                  </button>
                )}

                {/* SLA At Risk (Visible to both Manager and Regular Agents) */}
                <button
                  type="button"
                  onClick={handleToggleSlaRisk}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    filterSlaRisk
                      ? "bg-amber-500 text-black shadow-md shadow-amber-500/25 font-bold"
                      : "bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                  }`}
                  title="Filter tickets with breached SLA or approaching breach within 60 minutes"
                >
                  <Clock className="h-3.5 w-3.5" />
                  <span>SLA At Risk</span>
                  {slaRiskCount > 0 && (
                    <span
                      className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        filterSlaRisk
                          ? "bg-black text-amber-400"
                          : "bg-amber-950/80 text-amber-300 border border-amber-500/40"
                      }`}
                    >
                      {slaRiskCount}
                    </span>
                  )}
                </button>
              </div>
            )
          }
          renderActions={
            panelMode === "all_dept"
              ? null
              : (ticket) => {
                  const isAssignedToCurrent =
                    ticket.assigned_agent_id === user?.id;
                  const isUnassigned = !ticket.assigned_agent_id;
                  return (
                    <div className="flex items-center gap-2">
                      {isUnassigned ? (
                        <button
                          onClick={() => handleClaimTicket(ticket)}
                          className="text-xs bg-[#f2b705]/20 hover:bg-[#f2b705]/30 text-[#f2b705] font-semibold border border-[#f2b705]/40 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                        >
                          Take Ticket
                        </button>
                      ) : isAssignedToCurrent ? (
                        ticket.status !== "resolved" &&
                        ticket.status !== "closed" ? (
                          <button
                            onClick={() =>
                              handleQuickStatusChange(ticket, "resolved")
                            }
                            className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-semibold border border-emerald-500/30 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            Resolve
                          </button>
                        ) : null
                      ) : null}

                      {(isManager || user?.role === "admin") && (
                        <button
                          onClick={() => handleReassignToTriage(ticket)}
                          className="text-xs bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/40 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          title="Send back to admin triage"
                        >
                          Triage
                        </button>
                      )}
                    </div>
                  );
                }
          }
        />
      </div>

      {/* Team Availability Modal (Manager Only) */}
      {showTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-[#232632] bg-[#11131a] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#fbbf24]" />
                  Department Team Availability
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Toggling an agent to Away reassigns their active tickets to
                  your Manager queue.
                </p>
              </div>
              <button
                onClick={() => setShowTeamModal(false)}
                className="text-xs font-semibold text-gray-400 hover:text-white cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {teamLoading ? (
              <p className="py-8 text-center text-xs text-gray-500">
                Loading team members...
              </p>
            ) : departmentAgents.length === 0 ? (
              <p className="py-8 text-center text-xs text-gray-500">
                No agents found in this department.
              </p>
            ) : (
              <div className="divide-y divide-[#232632] max-h-80 overflow-y-auto">
                {departmentAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div>
                      <p className="text-xs font-semibold text-gray-200 flex items-center gap-2">
                        <span>
                          {agent.first_name} {agent.last_name}
                        </span>
                        <span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
                          {agent.active_tickets_count ?? 0} active{" "}
                          {agent.active_tickets_count === 1
                            ? "ticket"
                            : "tickets"}
                        </span>
                      </p>
                      <p className="text-[11px] text-gray-500">{agent.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={actionLoadingId === agent.id}
                        onClick={() => handleToggleAvailability(agent)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                          agent.is_active
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30"
                            : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-emerald-500/20 hover:text-emerald-300 hover:border-emerald-500/30"
                        }`}
                      >
                        {actionLoadingId === agent.id
                          ? "Updating..."
                          : agent.is_active
                            ? "Active"
                            : "Inactive"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo } from "react";
import { Filter, UserCheck, Inbox, Layers } from "lucide-react";
import { useTickets } from "../../hooks/useTickets";
import { useAuth } from "../../hooks/useAuth";
import TicketTable from "../../components/agent/TicketTable";
import api from "../../services/api";

export default function AgentTicketPanel () {
  const { user } = useAuth();
  // Filter mode: "mine" (Assigned to Me) | "unassigned" (Dept queue) | "all_dept"
  const [panelMode, setPanelMode] = useState("mine");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departments, setDepartments] = useState([]);

  // Build query params according to the active tab
  const params = useMemo(() => {
    const p = {};
    if (statusFilter !== "all") p.status = statusFilter;
    if (panelMode === "mine") p.assigned_to_me = true;
    else if (panelMode === "unassigned") p.unassigned = true;
    return p;
  }, [panelMode, statusFilter]);

  const { tickets, loading, refetch } = useTickets("queue", params);

  // Auto-refresh queue every 15 seconds
  useEffect(() => {
    const interval = setInterval(refetch, 15000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Load departments for display
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

  // Self-assign ticket from department queue
  const handleClaimTicket = async (ticket) => {
    try {
      await api.put(`/tickets/${ticket.id}`, {
        assigned_agent_id: user.id,
      });
      await api.post("/replies/", {
        ticket_id: ticket.id,
        body: `Agent ${user.email} assigned ticket to themselves.`,
        is_internal_note: true,
      });
      refetch();
    } catch (err) {
      console.error("Failed to claim ticket", err);
      alert("Failed to assign ticket to yourself.");
    }
  };

  // Quick reassign to admin triage
  const handleReassignToTriage = async (ticket) => {
    if (!window.confirm("Send this ticket back to admin triage?")) return;
    try {
      await api.put(`/tickets/${ticket.id}`, { department_id: null });
      await api.post("/replies/", {
        ticket_id: ticket.id,
        body: "Reassigned to admin triage (Invalid Department)",
        is_internal_note: true,
      });
      refetch();
    } catch (err) {
      console.error("Failed to reassign ticket", err);
      alert("Failed to reassign ticket.");
    }
  };

  // Quick status update from action column
  const handleQuickStatusChange = async (ticket, newStatus) => {
    try {
      await api.put(`/tickets/${ticket.id}`, { status: newStatus });
      refetch();
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0c10] mx-auto max-w-7xl px-4 py-8">
      {/* Header and Mode Switcher */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Agent Ticket Panel</h1>
          <p className="text-sm text-gray-400 mt-1">
            Manage your personal assigned queue and triage department tickets.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setPanelMode("mine")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
              panelMode === "mine"
                ? "bg-[#f2b705] text-black"
                : "bg-[#181b26] border border-[#232632] text-gray-300 hover:text-white"
            }`}
          >
            <UserCheck className="h-3.5 w-3.5" />
            <span>Assigned to Me</span>
          </button>

          <button
            onClick={() => setPanelMode("unassigned")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
              panelMode === "unassigned"
                ? "bg-[#f2b705] text-black"
                : "bg-[#181b26] border border-[#232632] text-gray-300 hover:text-white"
            }`}
          >
            <Inbox className="h-3.5 w-3.5" />
            <span>Dept Queue (Unassigned)</span>
          </button>

          <button
            onClick={() => setPanelMode("all_dept")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
              panelMode === "all_dept"
                ? "bg-[#f2b705] text-black"
                : "bg-[#181b26] border border-[#232632] text-gray-300 hover:text-white"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>All Department</span>
          </button>
        </div>
      </div>

      {/* Ticket Table Container */}
      <div className="rounded-2xl border border-[#232632] bg-[#141824] p-4 shadow-xl">
        <TicketTable
          tickets={tickets}
          loading={loading}
          onBulkUpdated={refetch}
          departments={departments}
          renderActions={(ticket) => {
            const isAssignedToCurrent = ticket.assigned_agent_id === user.id;
            const isUnassigned = !ticket.assigned_agent_id;

            return (
              <div className="flex items-center gap-2">
                {isUnassigned ? (
                  <button
                    onClick={() => handleClaimTicket(ticket)}
                    className="text-xs bg-[#f2b705]/20 hover:bg-[#f2b705]/30 text-[#f2b705] font-semibold border border-[#f2b705]/40 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    Take Ticket
                  </button>
                ) : isAssignedToCurrent ? (
                  ticket.status !== "resolved" && ticket.status !== "closed" ? (
                    <button
                      onClick={() => handleQuickStatusChange(ticket, "resolved")}
                      className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-semibold border border-emerald-500/30 px-2 py-1 rounded-lg transition-colors"
                    >
                      Resolve
                    </button>
                  ) : null
                ) : null}

                <button
                  onClick={() => handleReassignToTriage(ticket)}
                  className="text-xs bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/40 px-2.5 py-1 rounded-lg transition-colors"
                  title="Send back to admin triage"
                >
                  Triage
                </button>
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}

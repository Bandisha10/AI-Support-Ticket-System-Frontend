import { useState, useEffect } from "react";
import { useTickets } from "../../hooks/useTickets";
import TicketTable from "../../components/agent/TicketTable";
import api from "../../services/api";

export default function AdminTicketPanel () {
  const [filter, setFilter] = useState("unassigned");
  // When filter is "unassigned", we ask for needs_triage.
  // When filter is "assigned", we fetch the general unresolved queue.
  const queryParams =
    filter === "unassigned" ? { needs_triage: true } : { needs_triage: false };
  const { tickets, loading, refetch } = useTickets("queue", queryParams);
  const [departments, setDepartments] = useState([]);

  // Real-time freshness: poll every 15s for new unclassified tickets
  useEffect(() => {
    const interval = setInterval(refetch, 15000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Load active departments for assignment dropdown
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
      // FIX: Force classification_confidence to 1.0 to clear the "needs_triage" flag on the backend
      await api.put(`/tickets/${ticketId}`, {
        department_id: departmentId,
        classification_confidence: 1.0,
      });
      // Audit log via internal note
      await api.post("/replies/", {
        ticket_id: ticketId,
        body: `Admin assigned ticket to department ID: ${departmentId} and cleared Triage flag.`,
        is_internal_note: true,
      });
      refetch();
    } catch (err) {
      console.error("Failed to assign department", err);
      alert("Failed to assign department.");
    }
  };

  // When viewing assigned tickets, we don't necessarily want to show the manual assignment dropdown
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

  return (
    <div className="min-h-screen w-full bg-surface-bg mx-auto max-w-5xl px-4 py-8">
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
            onClick={() => setFilter("unassigned")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === "unassigned"
                ? "bg-accent text-black"
                : "bg-surface-hover text-gray-300 hover:bg-surface-border"
            }`}
          >
            Unassigned Tickets
          </button>
          <button
            onClick={() => setFilter("assigned")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === "assigned"
                ? "bg-accent text-black"
                : "bg-surface-hover text-gray-300 hover:bg-surface-border"
            }`}
          >
            Assigned Tickets
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-surface-border bg-surface-card p-4">
        <TicketTable
          tickets={tickets}
          loading={loading}
          renderActions={renderActions}
          departments={departments}
        />
      </div>
    </div>
  );
}

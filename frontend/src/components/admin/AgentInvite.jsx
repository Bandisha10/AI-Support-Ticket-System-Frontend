import { useState } from "react";
import { UserPlus, Copy, AlertTriangle } from "lucide-react";
import * as adminService from "../../services/adminService";

export default function AgentInvite({ departments = [], onInvited }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [agentTier, setAgentTier] = useState(1);
  const [departmentId, setDepartmentId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError("Enter the agent's first and last name");
      return;
    }
    if (!email.trim()) {
      setError("Enter the agent's email address");
      return;
    }
    if (!departmentId) {
      setError("Pick a department — an agent without one gets no ticket queue");
      return;
    }

    setSubmitting(true);
    try {
      const data = await adminService.inviteAgent({
        email: email.trim(),
        department_id: departmentId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        agent_tier: Number(agentTier),
      });
      setResult(data);
      setFirstName("");
      setLastName("");
      setEmail("");
      setDepartmentId("");
      setAgentTier(1);
      onInvited?.(data.user);
    } catch (err) {
      setError(
        err.response?.data?.detail?.[0]?.msg ||
          err.response?.data?.detail ||
          "Failed to invite agent",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-[#11131a] border border-[#232632] rounded-[12px] p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <UserPlus className="h-4 w-4 text-[#fbbf24]" />
        <h2 className="font-semibold text-[14px]">Agent Management</h2>
      </div>
      <p className="text-[12px] text-[#9ca3af] mb-4">
        The agent receives their login email, temporary password, department, and assigned tier by email.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          aria-label="First name"
          required
          className="bg-[#0a0c10] border border-[#232632] rounded-[8px] px-3 py-2 text-[12px] w-[140px] outline-none focus:border-[#fbbf24]"
        />
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name"
          aria-label="Last name"
          required
          className="bg-[#0a0c10] border border-[#232632] rounded-[8px] px-3 py-2 text-[12px] w-[140px] outline-none focus:border-[#fbbf24]"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="agent@company.com"
          aria-label="Agent email"
          required
          className="bg-[#0a0c10] border border-[#232632] rounded-[8px] px-3 py-2 text-[12px] w-[220px] outline-none focus:border-[#fbbf24]"
        />
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          aria-label="Agent department"
          className="bg-[#0a0c10] border border-[#232632] rounded-[8px] px-3 py-2 text-[12px] outline-none focus:border-[#fbbf24]"
        >
          <option value="">Select department…</option>
          {departments.map((dept) => (
            <option key={dept.id} value={dept.id}>
              {dept.name}
            </option>
          ))}
        </select>
        <select
          value={agentTier}
          onChange={(e) => setAgentTier(Number(e.target.value))}
          aria-label="Agent tier"
          className="bg-[#0a0c10] border border-[#232632] rounded-[8px] px-3 py-2 text-[12px] outline-none focus:border-[#fbbf24]"
        >
          <option value={1}>Regular Agent</option>
          <option value={2}>Super Agent</option>
        </select>
        <button
          type="submit"
          disabled={submitting}
          className="bg-[#fbbf24] text-black text-[12px] px-4 py-2 rounded-[8px] font-semibold disabled:opacity-60"
        >
          {submitting ? "Inviting…" : "Invite Agent"}
        </button>
      </form>

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-[#f87171]">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 rounded-[8px] border border-[#232632] bg-[#0a0c10] p-3 text-[12px]">
          <p className={result.email_sent ? "text-[#4ade80]" : "text-[#fbbf24]"}>
            {result.detail}
          </p>
          <p className="mt-1 text-[#9ca3af]">
            {result.user.first_name} {result.user.last_name} ({result.user.email}) · {result.department_name} · {result.user.agent_tier === 2 ? "Super Agent" : "Regular Agent"}
            {result.reinvited ? " · re-invited (password rotated)" : ""}
          </p>
          {result.temporary_password && (
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded border border-[#232632] px-2 py-1 text-[#fbbf24]">
                {result.temporary_password}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(result.temporary_password)}
                className="flex items-center gap-1 text-[#9ca3af] hover:text-white"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

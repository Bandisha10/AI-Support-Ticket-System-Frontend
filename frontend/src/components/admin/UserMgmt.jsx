import { useEffect, useMemo, useState } from "react";
import * as adminService from "../../services/adminService";
import { useToast } from "../common/Toast";
import Loader from "../common/Loader"; // Replace this with your actual super admin email
const SUPER_ADMIN_EMAIL = "superadmin@example.com";
function assignmentValue(user) {
  if (user.role === "admin") return "admin";
  if (user.role === "agent" && user.department_id) {
    return `agent:${user.department_id}`;
  }
  return "";
}
export default function UserMgmt() {
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");

  useEffect(() => {
    Promise.all([adminService.getUsers(), adminService.getDepartments()])
      .then(([userList, departmentList]) => {
        setUsers(
          userList.filter(
            (u) =>
              u.email?.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase() &&
              u.role !== "customer",
          ),
        );
        setDepartments(departmentList);
      })
      .catch(() => {
        showToast("Failed to load users or departments", "error");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [showToast]);

  const departmentsById = useMemo(
    () =>
      Object.fromEntries(
        departments.map((department) => [department.id, department]),
      ),
    [departments],
  );

  function assignmentLabel(user) {
    if (user.role === "admin") {
      return "Admin";
    }
    if (user.role === "agent" && user.department_id) {
      return `Agent - ${departmentsById[user.department_id]?.name || "Department"}`;
    }
    return "Unassigned";
  }

  async function handleTierChange(userId, tier) {
    try {
      const updatedUser = await adminService.updateUserRole(userId, {
        agent_tier: Number(tier),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updatedUser } : u)),
      );
      showToast("Agent tier updated", "success");
    } catch {
      showToast("Failed to update agent tier", "error");
    }
  }

  async function handleAssignmentChange(userId, value) {
    const selectedDepartmentId = value.replace("agent:", "");
    const selectedDepartment = departmentsById[selectedDepartmentId];
    const isAdministration =
      selectedDepartment?.name?.trim().toLowerCase() === "administration";
    const payload = {
      role: isAdministration ? "admin" : "agent",
      department_id: selectedDepartmentId,
    };
    try {
      const updatedUser = await adminService.updateUserRole(userId, payload);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updatedUser : u)));
      showToast("Assignment updated", "success");
    } catch {
      showToast("Failed to update assignment", "error");
    }
  }

  function handleInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      return;
    }
    showToast("Invite flow isn't wired to the backend yet", "info");
    setInviteEmail("");
  }
  if (loading) {
    return <Loader />;
  }
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">
          Team Members
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({users.length})
          </span>
        </h2>
      </div>
      <form onSubmit={handleInvite} className="mb-5 flex gap-2">
        <input
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="Enter email to invite"
          className="flex-1 rounded-lg border border-surface-border bg-surface-bg px-3 py-2.5 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-accent-hover"
        >
          + Invite
        </button>
      </form>
      <div className="overflow-hidden rounded-lg border border-surface-border">
        <div className="hidden grid-cols-[1.2fr_1.4fr_auto_auto_auto] gap-4 border-b border-surface-border bg-surface-hover px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 sm:grid">
          <span>Name</span> <span>Email</span> <span>Status</span>{" "}
          <span>Tier</span> <span>Assignment</span>
        </div>
        <div className="divide-y divide-surface-border">
          {users.map((u) => (
            <div
              key={u.id}
              className="grid gap-3 px-4 py-3 transition-colors hover:bg-surface-hover sm:grid-cols-[1.2fr_1.4fr_auto_auto_auto] sm:items-center"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-200">
                    {getUserDisplayName(u)}
                  </span>
                  <span className="rounded-md border border-surface-border bg-surface-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                    {assignmentLabel(u)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500 sm:hidden">
                  {u.email}
                </p>
              </div>
              <p className="hidden text-xs text-gray-400 sm:block">{u.email}</p>
              <span
                className={
                  u.is_active === false
                    ? "text-xs font-medium text-gray-500"
                    : "text-xs font-medium text-green-400"
                }
              >
                {u.is_active === false ? "Inactive" : "Active"}
              </span>

              {/* Agent Tier Column */}
              {u.role === "agent" ? (
                <select
                  value={u.agent_tier ?? 1}
                  onChange={(e) => handleTierChange(u.id, e.target.value)}
                  className="rounded-lg border border-surface-border bg-surface-bg px-2.5 py-2 text-xs text-gray-300 focus:border-accent focus:outline-none"
                >
                  <option value={1}>Regular</option>
                  <option value={2}>Super Agent</option>
                </select>
              ) : (
                <span className="text-xs text-gray-500 text-center">—</span>
              )}

              <select
                value={assignmentValue(u)}
                onChange={(e) => handleAssignmentChange(u.id, e.target.value)}
                className="rounded-lg border border-surface-border bg-surface-bg px-2.5 py-2 text-xs text-gray-300 focus:border-accent focus:outline-none"
              >
                <option value="admin"> Admin </option>
                {departments.map((department) => (
                  <option key={department.id} value={`agent:${department.id}`}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {!users.length && (
            <p className="px-4 py-5 text-sm text-gray-500">
              {" "}
              No editable team members yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

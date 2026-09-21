import { useState, useEffect, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import * as adminService from "../../services/adminService";
import AgentInvite from "../../components/admin/AgentInvite";
import { formatDateTime } from "../../utils/formatters";

export default function Settings() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [slaPolicies, setSlaPolicies] = useState([]);

  const [newDepartment, setNewDepartment] = useState("");
  const [loading, setLoading] = useState(true);
  // Sorting state for Team Members table
  const [sortBy, setSortBy] = useState("name"); // "name" | "created_at"
  const [sortOrder, setSortOrder] = useState("asc"); // "asc" | "desc"
  const handleHeaderSort = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "created_at" ? "desc" : "asc");
    }
  };
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      if (sortBy === "name") {
        const nameA =
          [a.first_name, a.last_name].filter(Boolean).join(" ").trim() ||
          a.name ||
          a.email?.split("@")[0] ||
          "";
        const nameB =
          [b.first_name, b.last_name].filter(Boolean).join(" ").trim() ||
          b.name ||
          b.email?.split("@")[0] ||
          "";
        const comp = nameA.localeCompare(nameB, undefined, {
          sensitivity: "base",
        });
        return sortOrder === "asc" ? comp : -comp;
      }
      if (sortBy === "created_at") {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return sortOrder === "asc" ? timeA - timeB : timeB - timeA;
      }
      return 0;
    });
  }, [users, sortBy, sortOrder]);

  // Build a lookup map: department id → department object
  const departmentsById = useMemo(
    () => Object.fromEntries(departments.map((d) => [d.id, d])),
    [departments],
  );

  // LOAD ALL DATA
  useEffect(() => {
    async function fetchAll() {
      try {
        const [userList, deptList, slaList] = await Promise.all([
          adminService.getUsers().catch(() => []),
          adminService.getDepartments().catch(() => []),
          adminService.getSLAPolicies().catch(() => []),
        ]);

        // Filter out customers — only show agents/admins in the settings table
        setUsers(userList.filter((u) => u.role !== "customer"));
        setDepartments(deptList);
        setSlaPolicies(slaList);
      } catch (err) {
        console.error("Failed to load settings data", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  // INVITE USER
  const handleInvited = (invitedUser) => {
    setUsers((prev) => {
      const exists = prev.some((u) => u.id === invitedUser.id);
      return exists
        ? prev.map((u) => (u.id === invitedUser.id ? invitedUser : u))
        : [...prev, invitedUser];
    });
  };

  // UPDATE ASSIGNMENT — maps dropdown value to { role, department_id }
  const updateAssignment = async (userId, dropdownValue) => {
    const selectedDepartment = departmentsById[dropdownValue];
    const isAdministration =
      selectedDepartment?.name?.trim().toLowerCase() === "administration";

    const payload = {
      role: isAdministration ? "admin" : "agent",
      department_id: dropdownValue,
    };

    try {
      const updatedUser = await adminService.updateUserRole(userId, payload);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updatedUser : u)));
    } catch (e) {
      alert("Assignment update failed");
    }
  };

  // UPDATE AGENT TIER
  const updateAgentTier = async (userId, tier) => {
    try {
      const updatedUser = await adminService.updateUserRole(userId, {
        agent_tier: Number(tier),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updatedUser } : u)),
      );
    } catch (e) {
      alert("Agent tier update failed");
    }
  };

  // ADD DEPARTMENT
  const addDepartment = async () => {
    if (!newDepartment.trim()) return;
    try {
      const dept = await adminService.createDepartment({
        name: newDepartment,
      });
      setDepartments([...departments, dept]);
      setNewDepartment("");
    } catch (e) {
      alert("Add Department failed");
    }
  };

  // DELETE DEPARTMENT
  const deleteDepartment = async (id) => {
    try {
      await adminService.deleteDepartment(id);
      setDepartments(departments.filter((d) => d.id !== id));
    } catch (e) {
      alert("Delete Department failed");
    }
  };

  // SAVE SLA POLICY
  const saveSlaPolicy = async (policy) => {
    try {
      await adminService.updateSLAPolicy(policy.id, {
        response_minutes: Number(policy.response_minutes),
        resolution_minutes: Number(policy.resolution_minutes),
      });
      alert(`${policy.priority.toUpperCase()} SLA saved`);
    } catch (e) {
      alert("SLA save failed");
    }
  };

  // Helper: update a single SLA policy field in local state
  function handleSlaChange(policyId, field, value) {
    setSlaPolicies((prev) =>
      prev.map((p) => (p.id === policyId ? { ...p, [field]: value } : p)),
    );
  }

  // Helper: get the current dropdown value for a user's assignment
  function assignmentValue(user) {
    if (user.department_id) return user.department_id;
    return "";
  }

  // Helper: readable label for a user's current assignment
  function assignmentLabel(user) {
    if (user.role === "admin") return "Admin";
    if (user.role === "agent" && user.department_id) {
      return departmentsById[user.department_id]?.name || "Department";
    }
    return "Unassigned";
  }

  // Priority color mapping for SLA rows
  const priorityColor = {
    urgent: "text-[#ef4444]",
    high: "text-[#f87171]",
    medium: "text-[#fbbf24]",
    low: "text-[#4ade80]",
  };

  if (loading)
    return (
      <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center text-[#9ca3af] text-[13px]">
        Loading settings...
      </div>
    );

  return (
    <div className="min-h-screen bg-[#0a0c10] text-white p-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-[22px] font-bold">Settings</h1>
          <p className="text-[13px] text-[#9ca3af] mt-1">
            Manage your team, departments, and SLA policy.
          </p>
        </div>
      </div>

      {/* AGENT INVITE */}
      <AgentInvite departments={departments} onInvited={handleInvited} />

      {/* TEAM MEMBERS */}
      <div className="bg-[#11131a] border border-[#232632] rounded-[12px] p-5 mb-6">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h2 className="font-semibold text-[14px]">
            Team Members ({users.length})
          </h2>
          {/* Quick Sort Dropdown */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#9ca3af]">Sort by:</span>
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split("-");
                setSortBy(field);
                setSortOrder(order);
              }}
              className="bg-[#0a0c10] border border-[#232632] text-gray-200 text-xs rounded-lg px-2.5 py-1.5 focus:border-[#fbbf24] outline-none cursor-pointer"
            >
              <option value="name-asc">Name (A → Z)</option>
              <option value="name-desc">Name (Z → A)</option>
              <option value="created_at-desc">Created (Newest first)</option>
              <option value="created_at-asc">Created (Oldest first)</option>
            </select>
          </div>
        </div>
        {users.length === 0 ? (
          <div className="text-center py-12 text-[#9ca3af] text-[13px] border border-dashed border-[#232632] rounded-[8px]">
            No users found. Invite your first team member.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[2fr_2fr_1.3fr_1fr_1.1fr_1.4fr] text-[11px] text-[#9ca3af] px-3 py-2 select-none">
              <button
                type="button"
                onClick={() => handleHeaderSort("name")}
                className="flex items-center gap-1 hover:text-white transition-colors text-left"
                title="Click to sort by Name"
              >
                <span>NAME</span>
                {sortBy === "name" ? (
                  sortOrder === "asc" ? (
                    <ArrowUp className="h-3 w-3 text-[#fbbf24]" />
                  ) : (
                    <ArrowDown className="h-3 w-3 text-[#fbbf24]" />
                  )
                ) : (
                  <ArrowUpDown className="h-3 w-3 opacity-40 hover:opacity-100" />
                )}
              </button>
              <span>EMAIL</span>
              <button
                type="button"
                onClick={() => handleHeaderSort("created_at")}
                className="flex items-center gap-1 hover:text-white transition-colors text-left"
                title="Click to sort by Created Time"
              >
                <span>CREATED</span>
                {sortBy === "created_at" ? (
                  sortOrder === "asc" ? (
                    <ArrowUp className="h-3 w-3 text-[#fbbf24]" />
                  ) : (
                    <ArrowDown className="h-3 w-3 text-[#fbbf24]" />
                  )
                ) : (
                  <ArrowUpDown className="h-3 w-3 opacity-40 hover:opacity-100" />
                )}
              </button>
              <span>STATUS</span>
              <span>TIER</span>
              <span>ASSIGNMENT</span>
            </div>
            {sortedUsers.map((u) => {
              const displayName =
                [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
                u.name ||
                u.email?.split("@")[0] ||
                "Team Member";
              return (
                <div
                  key={u.id}
                  className="grid grid-cols-[2fr_2fr_1.3fr_1fr_1.1fr_1.4fr] items-center px-3 py-2.5 border-t border-[#1a1d27] text-[13px]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-[#fbbf24] flex items-center justify-center text-[11px] font-bold text-black shrink-0">
                      {displayName[0]?.toUpperCase() || "U"}
                    </div>
                    <span className="truncate">{displayName}</span>
                  </div>
                  <span className="text-[#9ca3af] text-[12px] truncate">
                    {u.email}
                  </span>
                  <span className="text-[#9ca3af] text-[11px]">
                    {u.created_at ? formatDateTime(u.created_at) : "N/A"}
                  </span>
                  <span
                    className={`w-fit px-2 py-0.5 rounded text-[10px] ${
                      u.is_active === false
                        ? "bg-[#2a1414] text-[#f87171]"
                        : "bg-[#102a18] text-[#4ade80]"
                    }`}
                  >
                    {u.is_active === false ? "Inactive" : "Active"}
                  </span>
                  {/* Tier column */}
                  {u.role === "agent" ? (
                    <select
                      value={u.agent_tier ?? 1}
                      onChange={(e) => updateAgentTier(u.id, e.target.value)}
                      className="bg-[#0a0c10] border border-[#232632] rounded-[6px] px-2 py-1 text-[12px] outline-none"
                    >
                      <option value={1}>Regular</option>
                      <option value={2}>Super Agent</option>
                    </select>
                  ) : (
                    <span className="text-[12px] text-[#6b7280]">—</span>
                  )}
                  <select
                    value={assignmentValue(u)}
                    onChange={(e) => updateAssignment(u.id, e.target.value)}
                    className="bg-[#0a0c10] border border-[#232632] rounded-[6px] px-2 py-1 text-[12px] outline-none"
                  >
                    <option value="" disabled>
                      Select...
                    </option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* DEPARTMENT */}
        <div className="bg-[#11131a] border border-[#232632] rounded-[12px] p-5">
          <h2 className="font-semibold text-[14px] mb-4">
            Department Management
          </h2>
          <div className="flex gap-2 mb-4">
            <input
              value={newDepartment}
              onChange={(e) => setNewDepartment(e.target.value)}
              placeholder="New Department"
              className="flex-1 bg-[#0a0c10] border border-[#232632] rounded-[8px] px-3 py-2 text-[12px] outline-none"
            />
            <button
              onClick={addDepartment}
              className="bg-[#fbbf24] text-black text-[12px] px-3 py-2 rounded-[8px] font-semibold"
            >
              + Add Department
            </button>
          </div>
          {departments.length === 0 ? (
            <div className="text-center py-8 text-[#9ca3af] text-[13px]">
              No departments yet.
            </div>
          ) : (
            departments.map((d) => (
              <div
                key={d.id}
                className="flex justify-between items-center bg-[#0a0c10] border border-[#1a1d27] rounded-[8px] px-3 py-2.5 text-[13px] mb-2"
              >
                <span>{d.name}</span>
                <button
                  onClick={() => deleteDepartment(d.id)}
                  className="text-[#f87171]"
                >
                  🗑
                </button>
              </div>
            ))
          )}
        </div>

        {/* SLA */}
        <div className="bg-[#11131a] border border-[#232632] rounded-[12px] p-5">
          <h2 className="font-semibold text-[14px] mb-4">SLA Configuration</h2>
          <div className="space-y-4">
            {slaPolicies.length === 0 ? (
              <div className="text-center py-8 text-[#9ca3af] text-[13px]">
                No SLA policies configured.
              </div>
            ) : (
              slaPolicies.map((policy) => (
                <div
                  key={policy.id}
                  className="bg-[#0a0c10] border border-[#1a1d27] rounded-[8px] p-3 flex items-center gap-3"
                >
                  <span
                    className={`text-[11px] font-bold w-[55px] ${priorityColor[policy.priority] || "text-[#9ca3af]"}`}
                  >
                    {policy.priority.toUpperCase()}
                  </span>
                  <div className="flex-1">
                    <p className="text-[10px] text-[#9ca3af] mb-1">
                      First Response (minutes)
                    </p>
                    <input
                      type="number"
                      value={policy.response_minutes}
                      onChange={(e) =>
                        handleSlaChange(
                          policy.id,
                          "response_minutes",
                          e.target.value,
                        )
                      }
                      className="bg-[#11131a] border border-[#232632] rounded-[6px] px-2 py-1.5 text-[12px] w-full outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-[#9ca3af] mb-1">
                      Resolution Time (minutes)
                    </p>
                    <input
                      type="number"
                      value={policy.resolution_minutes}
                      onChange={(e) =>
                        handleSlaChange(
                          policy.id,
                          "resolution_minutes",
                          e.target.value,
                        )
                      }
                      className="bg-[#11131a] border border-[#232632] rounded-[6px] px-2 py-1.5 text-[12px] w-full outline-none"
                    />
                  </div>
                  <button
                    onClick={() => saveSlaPolicy(policy)}
                    className="bg-[#fbbf24] text-black text-[11px] px-3 py-1.5 rounded-[8px] font-semibold self-end"
                  >
                    Save Changes
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

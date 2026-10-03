import { useState, useEffect, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Building2 } from "lucide-react";
import * as adminService from "../../services/adminService";
import AgentInvite from "../../components/admin/AgentInvite";
import { formatDateTime } from "../../utils/formatters";
import { useToast } from "../../components/common/Toast";
import ConfirmModal from "../../components/common/ConfirmModal";

export default function MemberInvite() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sorting state for Team Members table
  const [sortBy, setSortBy] = useState("name"); // "name" | "created_at"
  const [sortOrder, setSortOrder] = useState("asc"); // "asc" | "desc"
  const { showToast } = useToast();
  const [confirmModal, setConfirmModal] = useState(null);

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

  // Group members by department, with departments sorted in ascending order (A → Z)
  const groupedDepartments = useMemo(() => {
    // 1. Sort departments alphabetically in ascending order
    const sortedDepts = [...departments].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );

    // 2. Bucket sorted users into their respective department
    const groups = sortedDepts.map((dept) => {
      const deptMembers = sortedUsers.filter(
        (u) => u.department_id === dept.id,
      );
      const manager = deptMembers.find(
        (u) =>
          u.role === "agent" &&
          (u.agent_tier === 2 || u.agent_tier === "2") &&
          u.is_active,
      );
      return {
        id: dept.id,
        name: dept.name,
        manager,
        members: deptMembers,
      };
    });

    // 3. Collect Unassigned Staff / System Admins
    const unassignedMembers = sortedUsers.filter(
      (u) =>
        !u.department_id || !departments.some((d) => d.id === u.department_id),
    );

    if (unassignedMembers.length > 0) {
      groups.push({
        id: "unassigned",
        name: "Unassigned / System Admins",
        manager: null,
        members: unassignedMembers,
        isUnassigned: true,
      });
    }

    return groups;
  }, [departments, sortedUsers]);

  // LOAD MEMBERS & DEPARTMENTS
  useEffect(() => {
    async function fetchAll() {
      try {
        const [userList, deptList] = await Promise.all([
          adminService.getUsers().catch(() => []),
          adminService.getDepartments().catch(() => []),
        ]);

        // Filter out customers — only show agents and admins in the staff table
        setUsers(userList.filter((u) => u.role !== "customer"));
        setDepartments(deptList);
      } catch (err) {
        console.error("Failed to load members data", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  // INVITE USER CALLBACK
  const handleInvited = (invitedUser) => {
    setUsers((prev) => {
      const exists = prev.some((u) => u.id === invitedUser.id);
      return exists
        ? prev.map((u) => (u.id === invitedUser.id ? invitedUser : u))
        : [...prev, invitedUser];
    });
  };

  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Toggle user availability (Active / Inactive) with ConfirmModal & Toast
  const handleToggleUserStatus = (targetUser) => {
    if (targetUser.role === "admin" || targetUser.is_archive) return;
    const nextState = !targetUser.is_active;
    const actionLabel = nextState ? "activate" : "deactivate";

    setConfirmModal({
      title: `${nextState ? "Activate" : "Deactivate"} Team Member`,
      message: `Are you sure you want to ${actionLabel} ${
        targetUser.first_name || targetUser.email
      }? ${
        !nextState
          ? "Their open tickets will automatically be reassigned to the department manager."
          : ""
      }`,
      confirmText: nextState ? "Activate" : "Deactivate",
      variant: nextState ? "primary" : "danger",
      onConfirm: async () => {
        setActionLoadingId(targetUser.id);
        try {
          await adminService.updateAgentAvailability(targetUser.id, nextState);
          setUsers((prev) =>
            prev.map((u) =>
              u.id === targetUser.id ? { ...u, is_active: nextState } : u,
            ),
          );
          showToast(`User successfully ${actionLabel}d.`, "success");
        } catch (err) {
          showToast(
            err.response?.data?.detail || `Failed to ${actionLabel} user`,
            "error",
          );
        } finally {
          setActionLoadingId(null);
          setConfirmModal(null);
        }
      },
    });
  };

  // UPDATE DEPARTMENT ASSIGNMENT
  const updateAssignment = async (userId, dropdownValue) => {
    const previousUsers = [...users];
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, department_id: dropdownValue } : u,
      ),
    );
    try {
      await adminService.updateUserRole(userId, {
        department_id: dropdownValue,
      });
      const freshUsers = await adminService.getUsers();
      setUsers(freshUsers.filter((u) => u.role !== "customer"));
      showToast("Department assignment updated.", "success");
    } catch (e) {
      setUsers(previousUsers);
      showToast(
        e.response?.data?.detail || "Assignment update failed",
        "error",
      );
    }
  };

  // UPDATE AGENT TIER
  const updateAgentTier = async (userId, tier) => {
    const newTier = Number(tier);
    const targetUser = users.find((u) => u.id === userId);
    const previousUsers = [...users];

    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          return { ...u, agent_tier: newTier };
        }
        if (
          newTier === 2 &&
          targetUser?.department_id &&
          u.department_id === targetUser.department_id &&
          (u.agent_tier === 2 || u.agent_tier === "2")
        ) {
          return { ...u, agent_tier: 1 };
        }
        return u;
      }),
    );
    try {
      await adminService.updateUserRole(userId, { agent_tier: newTier });
      const freshUsers = await adminService.getUsers();
      setUsers(freshUsers.filter((u) => u.role !== "customer"));
      showToast("Agent tier updated.", "success");
    } catch (e) {
      setUsers(previousUsers);
      showToast(
        e.response?.data?.detail || "Agent tier update failed",
        "error",
      );
    }
  };

  if (loading)
    return (
      <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center text-[#9ca3af] text-[13px]">
        Loading member invitations...
      </div>
    );

  return (
    <div className="min-h-screen bg-[#0a0c10] text-white p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-[22px] font-bold">Member Invitations</h1>
          <p className="text-[13px] text-[#9ca3af] mt-1">
            Invite support staff, assign departments, and manage agent tiers.
          </p>
        </div>
      </div>

      {/* Agent / Member Invite Card */}
      <AgentInvite departments={departments} onInvited={handleInvited} />

      {/* Team Members List */}
      <div className="bg-[#11131a] border border-[#232632] rounded-[12px] p-4 sm:p-5 mb-6">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h2 className="font-semibold text-[14px]">
            Staff Directory & Assignments ({users.length})
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
            No staff members found. Send your first invite above.
          </div>
        ) : (
          <div className="space-y-6">
            {groupedDepartments.map((group) => (
              <div
                key={group.id}
                className="rounded-xl border border-[#232632] overflow-hidden bg-[#0c0e15]"
              >
                {/* Department Group Header (Sorted Ascending) */}
                <div className="flex flex-wrap items-center justify-between bg-[#151823] px-4 py-2.5 border-b border-[#232632]">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-[#fbbf24]" />
                    <span className="font-bold text-white text-[13px]">
                      {group.name}
                    </span>
                    <span className="rounded-full bg-[#232632] px-2 py-0.5 text-[10px] font-semibold text-gray-400">
                      {group.members.length}{" "}
                      {group.members.length === 1 ? "member" : "members"}
                    </span>
                  </div>
                  {!group.isUnassigned && (
                    <div className="text-[12px] text-[#9ca3af]">
                      Manager:{" "}
                      <strong
                        className={
                          group.manager
                            ? "text-[#fbbf24] font-semibold"
                            : "text-gray-500 font-normal italic"
                        }
                      >
                        {group.manager
                          ? `${group.manager.first_name || ""} ${group.manager.last_name || ""}`.trim() ||
                            group.manager.email
                          : "No active manager"}
                      </strong>
                    </div>
                  )}
                </div>
                {group.members.length === 0 ? (
                  <div className="px-4 py-4 text-xs text-gray-500 italic bg-[#0a0c10]">
                    No members currently assigned to this department.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="min-w-[620px]">
                      {/* Column Headers */}
                      <div className="grid grid-cols-[2fr_2fr_1.3fr_1fr_1.1fr_1.4fr] text-[10px] text-[#9ca3af] px-4 py-2 bg-[#0d1017] border-b border-[#1a1d27] select-none">
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
                      {/* Member Rows */}
                      <div className="divide-y divide-[#1a1d27]">
                        {group.members.map((u) => {
                          const displayName =
                            [u.first_name, u.last_name]
                              .filter(Boolean)
                              .join(" ")
                              .trim() ||
                            u.name ||
                            u.email?.split("@")[0] ||
                            "Staff Member";
                          return (
                            <div
                              key={u.id}
                              className="grid grid-cols-[2fr_2fr_1.3fr_1fr_1.1fr_1.4fr] items-center px-4 py-2.5 text-[12px] bg-[#0a0c10] hover:bg-[#12151e] transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-full bg-[#fbbf24] flex items-center justify-center text-[10px] font-bold text-black shrink-0">
                                  {displayName[0]?.toUpperCase() || "U"}
                                </div>
                                <span className="truncate text-white font-medium">
                                  {displayName}
                                </span>
                              </div>
                              <span className="text-[#9ca3af] text-[12px] truncate">
                                {u.email}
                              </span>
                              <span className="text-[#9ca3af] text-[12px]">
                                {u.created_at
                                  ? formatDateTime(u.created_at)
                                  : "N/A"}
                              </span>
                              <div>
                                {u.is_archive ? (
                                  <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                    ARCHIVED
                                  </span>
                                ) : u.role === "admin" ? (
                                  <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-[#fbbf24]/10 text-[#fbbf24] border border-[#fbbf24]/30">
                                    ADMIN
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleUserStatus(u)}
                                    disabled={actionLoadingId === u.id}
                                    className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-bold uppercase transition-all cursor-pointer ${
                                      u.is_active
                                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
                                        : "bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20"
                                    }`}
                                    title={`Click to mark ${u.is_active ? "Inactive (Off-duty)" : "Active (On-duty)"}`}
                                  >
                                    <span
                                      className={`h-1.5 w-1.5 rounded-full ${
                                        u.is_active
                                          ? "bg-emerald-400"
                                          : "bg-rose-400"
                                      }`}
                                    />
                                    <span>
                                      {u.is_active ? "ACTIVE" : "INACTIVE"}
                                    </span>
                                  </button>
                                )}
                              </div>

                              <div>
                                {u.role === "agent" ? (
                                  <select
                                    value={
                                      u.agent_tier === 2 || u.agent_tier === "2"
                                        ? 2
                                        : 1
                                    }
                                    onChange={(e) =>
                                      updateAgentTier(u.id, e.target.value)
                                    }
                                    className="bg-[#12151e] border border-[#232632] rounded-[6px] px-2 py-1 text-[11px] text-gray-300 outline-none focus:border-[#fbbf24]"
                                  >
                                    <option value={1}>Regular</option>
                                    <option value={2}>Manager</option>
                                  </select>
                                ) : (
                                  <span className="text-gray-500 text-[12px]">
                                    —
                                  </span>
                                )}
                              </div>
                              <select
                                value={u.department_id || ""}
                                onChange={(e) =>
                                  updateAssignment(u.id, e.target.value)
                                }
                                className="bg-[#12151e] border border-[#232632] rounded-[6px] px-2 py-1 text-[11px] outline-none text-gray-200 focus:border-[#fbbf24]"
                              >
                                <option value="" disabled>
                                  Select Department...
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
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmModal
        isOpen={Boolean(confirmModal)}
        onClose={() => setConfirmModal(null)}
        {...confirmModal}
      />
    </div>
  );
}

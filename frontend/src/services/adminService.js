import api from "./api";

export async function getUsers(params = {}) {
  const { data } = await api.get("/users/", { params });
  return data;
}

export async function updateUserRole(userId, payload) {
  const { data } = await api.put(`/users/${userId}`, payload);
  return data;
}

// Department services
export function getDepartments() {
  return api.get("/departments/").then((res) => res.data);
}

export async function getAnalyticsOverview(params = {}) {
  const { data } = await api.get("/tickets/analytics", { params });
  return data;
}

export async function inviteAgent(email, departmentId, firstName, lastName, agentTier = 1) {
  const payload = typeof email === "object"
    ? email
    : {
        email,
        department_id: departmentId,
        first_name: firstName,
        last_name: lastName,
        agent_tier: agentTier,
      };
  const { data } = await api.post("/users/invite-agent", payload);
  return data;
}

// Manager Team & Availability methods
export async function getDepartmentTeam() {
  const { data } = await api.get("/users/department/team");
  return data;
}

export async function updateAgentAvailability(userId, isActive) {
  const { data } = await api.patch(`/users/${userId}/availability`, { is_active: isActive });
  return data;
}

// Customer Management API methods
export async function getCustomersSummary(includesArchived = true) {
  const { data } = await api.get("/users/customers/summary", {
    params: { includes_archived: includesArchived },
  });
  return data;
}

export async function getCustomerTickets(customerId) {
  const { data } = await api.get(`/users/customers/${customerId}/tickets`);
  return data;
}

export async function archiveUser(userId) {
  const { data } = await api.post(`/users/${userId}/archive`);
  return data;
}

export async function unarchiveUser(userId) {
  const { data } = await api.post(`/users/${userId}/unarchive`);
  return data;
}

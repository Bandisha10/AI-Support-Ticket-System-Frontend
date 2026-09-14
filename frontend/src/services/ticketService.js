import api from "./api";

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== "" && value !== null && value !== undefined)
  );
}

// --- Customer-facing ---
export async function createTicket(payload) {
  const body = {
    subject: payload.subject,
    body: payload.body_redacted ?? payload.description,
    category_id: payload.category_id || null,
    department_id: payload.department_id || null,
    priority: payload.priority || null,
  };

  const { data } = await api.post("/tickets/", body);
  return data;
}

export async function getMyTickets(params = {}) {
  const { data } = await api.get("/tickets/", { params: cleanParams(params) });
  return data;
}

export async function getTicketById(ticketId) {
  const { data } = await api.get(`/tickets/${ticketId}`);
  return data;
}

export async function addCustomerReply(ticketId, message) {
  const { data } = await api.post("/replies/", {
    ticket_id: ticketId,
    body: message,
    is_auto_reply: false,
  });
  return data;
}

// --- Agent-facing ---
export async function getQueue(params = {}) {
  const { data } = await api.get("/tickets/", { params: cleanParams(params) });
  return data;
}

export async function assignTicket(ticketId, agentId) {
  const { data } = await api.put(`/tickets/${ticketId}`, {
    assigned_agent_id: agentId,
  });
  return data;
}

export async function updateTicketStatus(ticketId, status) {
  const { data } = await api.put(`/tickets/${ticketId}`, { status });
  return data;
}

export async function sendAgentReply(ticketId, message) {
  const { data } = await api.post("/replies/", {
    ticket_id: ticketId,
    body: message,
    is_auto_reply: false,
  });
  return data;
}

export async function getAgentAnalytics(params = {}) {
  const { data } = await api.get("/tickets/analytics/agent", {
    params: cleanParams(params),
  });
  return data;
}

export async function getTicketReplies(ticketId) {
  const { data } = await api.get(`/replies/ticket/${ticketId}`);
  return data;
}

// Backend endpoint not available yet.
export async function getSuggestedReply() {
  return { suggestion: "" };
}

// Backend endpoint not available yet.
export async function getTicketEvents() {
  return [];
}

// --- CSAT Rating (Feature 4) ---
// POST /tickets/{id}/rating — stubs call and persists locally if backend is unavailable
export async function rateTicket(ticketId, ratingData) {
  try {
    const { data } = await api.post(`/tickets/${ticketId}/rating`, ratingData);
    return data;
  } catch (err) {
    // Note: Backend /tickets/{id}/rating endpoint pending. Fallback to local storage persistence.
    console.info(`[ticketService] POST /tickets/${ticketId}/rating fallback:`, ratingData);
    const existingRatings = JSON.parse(localStorage.getItem("deskwise_ticket_ratings") || "{}");
    existingRatings[ticketId] = { ...ratingData, created_at: new Date().toISOString() };
    localStorage.setItem("deskwise_ticket_ratings", JSON.stringify(existingRatings));
    return { success: true, local: true };
  }
}

// --- Canned Replies (Feature 5) ---
// GET /agents/canned-replies — fetches from backend with fallback to CANNED_REPLIES
export async function getCannedReplies() {
  try {
    const { data } = await api.get("/agents/canned-replies");
    if (Array.isArray(data) && data.length > 0) return data;
  } catch {
    // Backend endpoint pending — fall back to hardcoded templates
  }
  const { CANNED_REPLIES } = await import("../utils/cannedReplies");
  return CANNED_REPLIES;
}
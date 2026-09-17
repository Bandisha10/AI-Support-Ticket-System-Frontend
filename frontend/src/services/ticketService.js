import api from "./api";

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== "" && value !== null && value !== undefined)
  );
}

// --- Ticket Management ---
export async function createTicket(payload) {
  const body = {
    subject: payload.subject,
    body: payload.body ?? payload.description ?? payload.body_redacted,
    category_id: payload.category_id || null,
    department_id: payload.department_id || null,
    priority: payload.priority || null,
  };

  const { data } = await api.post("/tickets/", body);
  return data;
}

// Single consolidated fetch function (aliased for backwards compatibility)
export async function getTickets(params = {}) {
  const { data } = await api.get("/tickets/", { params: cleanParams(params) });
  return data;
}
export const getMyTickets = getTickets;
export const getQueue = getTickets;

export async function getTicketById(ticketId) {
  const { data } = await api.get(`/tickets/${ticketId}`);
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

// --- Reply Management (Unified) ---
export async function createReply(ticketId, message, isInternal = false) {
  const { data } = await api.post("/replies/", {
    ticket_id: ticketId,
    body: message,
    is_internal_note: Boolean(isInternal),
    is_auto_reply: false,
  });
  return data;
}
export const addCustomerReply = (ticketId, msg) => createReply(ticketId, msg, false);
export const sendAgentReply = (ticketId, msg, isInternal = false) => createReply(ticketId, msg, isInternal);

export async function getTicketReplies(ticketId) {
  const { data } = await api.get(`/replies/ticket/${ticketId}`);
  return data;
}

export async function getSuggestedReply() {
  return { suggestion: "" };
}

// --- Analytics ---
export async function getAgentAnalytics(params = {}) {
  const { data } = await api.get("/tickets/analytics/agent", {
    params: cleanParams(params),
  });
  return data;
}

// --- CSAT Rating (Aligned with Backend Route POST /tickets/{id}/rate) ---
export async function rateTicket(ticketId, ratingData) {
  try {
    const { data } = await api.post(`/tickets/${ticketId}/rate`, ratingData);
    return data;
  } catch (err) {
    console.warn(`[ticketService] POST /tickets/${ticketId}/rate failed, caching locally:`, err);
    const existingRatings = JSON.parse(localStorage.getItem("deskwise_ticket_ratings") || "{}");
    existingRatings[ticketId] = { ...ratingData, created_at: new Date().toISOString() };
    localStorage.setItem("deskwise_ticket_ratings", JSON.stringify(existingRatings));
    throw err;
  }
}

// --- Canned Replies ---
export async function getCannedReplies() {
  try {
    const { data } = await api.get("/agents/canned-replies");
    if (Array.isArray(data) && data.length > 0) return data;
  } catch {
    // Fall back to hardcoded templates if backend endpoint is unconfigured
  }
  const { CANNED_REPLIES } = await import("../utils/cannedReplies");
  return CANNED_REPLIES;
}

import api from "./api";

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== "" && value !== null && value !== undefined)
  );
}

// --- Ticket Management ---
export async function createTicket(payload, attachments = []) {
  const body = {
    subject: payload.subject,
    body: payload.body ?? payload.description ?? payload.body_redacted,
    category_id: payload.category_id || null,
    department_id: payload.department_id || null,
    priority: payload.priority || null,
  };

  const { data: ticket } = await api.post("/tickets/", body);

  if (attachments && attachments.length > 0 && ticket?.id) {
    try {
      const formData = new FormData();
      for (const item of attachments) {
        const fileObj = item.file || item;
        if (fileObj instanceof File || fileObj instanceof Blob) {
          formData.append("files", fileObj);
        }
      }
      const { data: uploadedFiles } = await api.post(
        `/tickets/${ticket.id}/attachments`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );
      ticket.attachments = uploadedFiles;
    } catch (err) {
      console.warn("[ticketService] Failed to upload attachments:", err);
    }
  }

  return ticket;
}

export async function uploadTicketAttachments(ticketId, files = []) {
  const formData = new FormData();
  for (const item of files) {
    const fileObj = item.file || item;
    if (fileObj instanceof File || fileObj instanceof Blob) {
      formData.append("files", fileObj);
    }
  }
  const { data } = await api.post(`/tickets/${ticketId}/attachments`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function getTicketAttachments(ticketId) {
  const { data } = await api.get(`/tickets/${ticketId}/attachments`);
  return data;
}

// Single consolidated fetch function (aliased for backwards compatibility)
export async function getTickets(params = {}) {
  const { data } = await api.get("/tickets/", { params: cleanParams(params) });
  return data;
}
export const getMyTickets = getTickets;
export const getQueue = getTickets;

function normalizeUUID(id) {
  if (!id) return "";
  return String(id).trim().replace(/[\s_]+/g, "-");
}

export async function getTicketById(ticketId) {
  const cleanId = normalizeUUID(ticketId);
  const { data } = await api.get(`/tickets/${cleanId}`);
  return data;
}

export async function assignTicket(ticketId, agentId) {
  const cleanId = normalizeUUID(ticketId);
  const { data } = await api.put(`/tickets/${cleanId}`, {
    assigned_agent_id: agentId,
  });
  return data;
}

export async function updateTicketStatus(ticketId, status) {
  const cleanId = normalizeUUID(ticketId);
  const { data } = await api.put(`/tickets/${cleanId}`, { status });
  return data;
}

// --- Reply Management (Unified) ---
export async function createReply(ticketId, message, isInternal = false) {
  const cleanId = normalizeUUID(ticketId);
  const { data } = await api.post("/replies/", {
    ticket_id: cleanId,
    body: message,
    is_internal_note: Boolean(isInternal),
    is_auto_reply: false,
  });
  return data;
}
export const addCustomerReply = (ticketId, msg) => createReply(ticketId, msg, false);
export const sendAgentReply = (ticketId, msg, isInternal = false) => createReply(ticketId, msg, isInternal);

export async function getTicketReplies(ticketId) {
  const cleanId = normalizeUUID(ticketId);
  const { data } = await api.get(`/replies/ticket/${cleanId}`);
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

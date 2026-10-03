import { useState, useEffect } from "react";

/**
 * Ticket view & unread tracking utility.
 * Compares the ticket's last reply timestamp against the user's last viewed timestamp in localStorage.
 */

export function markTicketViewed(ticketId) {
  if (!ticketId) return;
  try {
    localStorage.setItem(`deskwise_viewed_${ticketId}`, Date.now().toString());
    window.dispatchEvent(
      new CustomEvent("deskwise_ticket_viewed", { detail: { ticketId } })
    );
  } catch {}
}

export function useTicketViewSync() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const handleUpdate = () => setTick((v) => v + 1);
    window.addEventListener("deskwise_ticket_viewed", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("deskwise_ticket_viewed", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);
}

export function isTicketUnread(ticket, role = "customer") {
  if (!ticket?.id || !ticket?.last_reply_at) return false;

  // For Customer: only unread if the LATEST reply came from an Agent/Support
  if (role === "customer" && ticket.last_reply_by_customer === true) {
    return false;
  }

  // For Agent: only unread if the LATEST reply came from the Customer
  if ((role === "agent" || role === "admin") && ticket.last_reply_by_customer === false) {
    return false;
  }

  try {
    const lastViewed = localStorage.getItem(`deskwise_viewed_${ticket.id}`);
    if (!lastViewed) return true;
    const replyTime = new Date(ticket.last_reply_at).getTime();
    return replyTime > Number(lastViewed);
  } catch {
    return false;
  }
}

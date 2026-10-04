import { useEffect } from "react";
import { supabase } from "../utils/supabase";

/**
 * Subscribes to new replies on a single ticket and invokes onNewReply
 * whenever one is inserted. Authenticates the Realtime connection with the
 * user's Supabase JWT so Row-Level Security (RLS) allows event delivery.
 */
export function useReplyRealtime(ticketId, onNewReply) {
  useEffect(() => {
    if (!ticketId) return;

    // 1. Ensure Supabase Realtime has the active user token for RLS checks
    const token = localStorage.getItem("access_token");
    const refreshToken = localStorage.getItem("refresh_token");
    if (token && refreshToken) {
      supabase.auth.setSession({ access_token: token, refresh_token: refreshToken }).catch(() => {});
    } else if (token) {
      supabase.realtime.setAuth(token);
    }

    // 2. Subscribe to INSERT events filtered by this ticket ID
    const channel = supabase
      .channel(`replies-ticket-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "replies",
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          if (onNewReply && payload.new) {
            onNewReply(payload.new);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[Realtime] Error subscribing to replies for ticket:", ticketId, err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, onNewReply]);
}

import { useEffect } from "react";
import { supabase } from "../utils/supabase";

/**
 * Subscribes to new replies on a single ticket and invokes onNewReply
 * whenever one is inserted. Scoped per ticket_id — never a table-wide
 * subscription. Cleans up the channel automatically on unmount or when
 * ticketId changes.
 */
export function useReplyRealtime(ticketId, onNewReply) {
  useEffect(() => {
    if (!ticketId) return;

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
          onNewReply(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, onNewReply]);
}
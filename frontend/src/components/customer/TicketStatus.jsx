import { useState } from "react";
import { formatRelativeTime } from "../../utils/formatters";
import { isTicketUnread, useTicketViewSync } from "../../utils/ticketViewTracking";
import { MessageSquare, Sparkles } from "lucide-react";
import RatingModal from "./RatingModal";

export default function TicketStatus({ ticket }) {
  useTicketViewSync();
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const hasNewReply = isTicketUnread(ticket, "customer");


  return (
    <div
      className={`rounded-xl border p-5 transition-all ${
        hasNewReply
          ? "border-emerald-500/50 bg-[#121c1a] shadow-lg shadow-emerald-500/5"
          : "border-surface-border bg-surface-card"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-white truncate">{ticket.subject}</h3>
            {hasNewReply && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400 animate-pulse">
                <Sparkles className="h-3 w-3" />
                <span>New Agent Reply</span>
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Ticket #{ticket.id?.slice(0, 8).toUpperCase()} • Opened{" "}
            {formatRelativeTime(ticket.created_at)}
          </p>
        </div>
      </div>

      {ticket.assigned_agent_name && (
        <p className="mt-2 text-xs text-gray-400">
          Handled by{" "}
          <span className="font-medium text-gray-300">
            {ticket.assigned_agent_name}
          </span>
        </p>
      )}

      {/* Last message preview */}
      {ticket.last_reply_body && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#0e121a] border border-[#232838] p-2.5 text-xs text-gray-300">
          <MessageSquare className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
          <p className="line-clamp-2 italic text-gray-300">
            "{ticket.last_reply_body}"
          </p>
        </div>
      )}

      <RatingModal
        ticket={ticket}
        isOpen={isRatingModalOpen}
        onClose={() => setIsRatingModalOpen(false)}
      />
    </div>
  );
}

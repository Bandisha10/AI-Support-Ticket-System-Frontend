import { useState } from "react";
import { formatRelativeTime } from "../../utils/formatters";
import RatingModal from "./RatingModal";

export default function TicketStatus({ ticket }) {
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-white">{ticket.subject}</h3>
          <p className="mt-1 text-sm text-gray-500">
            Ticket #{ticket.id?.slice(0, 8).toUpperCase()} • Opened {formatRelativeTime(ticket.created_at)}
          </p>
        </div>
      </div>

      {ticket.assigned_agent_name && (
        <p className="mt-3 text-sm text-gray-400">
          Handled by <span className="font-medium text-gray-300">{ticket.assigned_agent_name}</span>
        </p>
      )}

      {ticket.last_message && (
        <p className="mt-2 line-clamp-2 text-sm text-gray-500">{ticket.last_message}</p>
      )}

      <RatingModal
        ticket={ticket}
        isOpen={isRatingModalOpen}
        onClose={() => setIsRatingModalOpen(false)}
      />
    </div>
  );
}

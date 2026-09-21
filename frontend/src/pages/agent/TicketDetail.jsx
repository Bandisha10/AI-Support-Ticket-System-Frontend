import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Paperclip,
  FileText,
  Lock,
  User,
  ShieldAlert,
} from "lucide-react";
import { useTicketDetail } from "../../hooks/useTickets";
import { useAuth } from "../../hooks/useAuth";
import ReplyBox from "../../components/agent/ReplyBox";
import SLAWatcher from "../../components/agent/SLAWatcher";
import Loader from "../../components/common/Loader";
import * as ticketService from "../../services/ticketService";
import { formatDateTime, formatRelativeTime } from "../../utils/formatters";
import clsx from "clsx";
import { STATUS_COLORS } from "../../utils/constants";
import NotFound from "../NotFound";

export default function TicketDetail() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { ticket, loading, error, refetch } = useTicketDetail(ticketId);
  const [replies, setReplies] = useState([]);
  const [repliesLoading, setRepliesLoading] = useState(true);

  useEffect(() => {
    if (!ticketId) return;
    loadReplies();
  }, [ticketId]);

  async function loadReplies() {
    try {
      const data = await ticketService.getTicketReplies(ticketId);
      setReplies(data || []);
    } catch {
      // replies might be empty
    } finally {
      setRepliesLoading(false);
    }
  }

  async function handleStatusChange(e) {
    await ticketService.updateTicketStatus(ticketId, e.target.value);
    refetch();
  }

  function handleBack() {
    if (window.history?.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate(isAdmin ? "/admin/ticket-panel" : "/agent/ticket-panel");
    }
  }

  if (loading) return <Loader fullScreen />;
  if (error || !ticket) {
    return (
      <NotFound
        type="ticket"
        ticketId={ticketId}
        customMessage={
          error ||
          "Ticket not found in queue or you may lack permission to view it."
        }
      />
    );
  }

  return (
    <div className="min-h-screen w-full bg-surface-bg mx-auto max-w-4xl px-4 py-8">
      {/* Back button */}
      <button
        type="button"
        onClick={handleBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-accent transition-colors cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>{isAdmin ? "Back to Tickets Panel" : "Back to Queue"}</span>
      </button>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{ticket.subject}</h1>
            <span
              className={clsx(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                STATUS_COLORS[ticket.status],
              )}
            >
              {ticket.status?.replace("_", " ")}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Ticket #{ticket.id} • Customer:{" "}
            {ticket.customer_name || ticket.customer_email || "Customer"}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <SLAWatcher dueAt={ticket.sla_due_at} />
          <select
            value={ticket.status}
            onChange={handleStatusChange}
            className="rounded-lg border border-surface-border bg-surface-card px-3 py-1.5 text-xs font-medium text-gray-200 focus:border-accent focus:outline-none"
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Original Ticket Description */}
      <div className="mb-6 rounded-2xl border border-surface-border bg-surface-card p-6">
        <div className="flex items-center justify-between border-b border-surface-border pb-3 mb-4 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-accent" />
            <span className="font-semibold text-gray-200">
              {ticket.customer_name || ticket.customer_email || "Customer"}
            </span>
            <span>opened this ticket</span>
          </div>
          <span>{formatDateTime(ticket.created_at)}</span>
        </div>

        <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
          {ticket.body_redacted || ticket.body || ticket.description}
        </div>

        {/* Attached Files (Feature 2) */}
        {ticket.attachments && ticket.attachments.length > 0 && (
          <div className="mt-4 border-t border-surface-border pt-3">
            <p className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5 text-accent" />
              <span>Attached Files ({ticket.attachments.length}):</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {ticket.attachments.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-bg px-3 py-1.5 text-xs text-gray-300"
                >
                  <FileText className="h-4 w-4 text-accent" />
                  <span>{file.name || `Attachment-${idx + 1}`}</span>
                  {file.size && (
                    <span className="text-gray-500">({file.size})</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Message Thread */}
      <div className="mb-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          Activity & Replies
        </h2>

        {repliesLoading ? (
          <div className="flex justify-center py-6">
            <Loader />
          </div>
        ) : replies.length === 0 ? (
          <p className="rounded-xl border border-surface-border bg-surface-card p-5 text-center text-xs text-gray-500">
            No agent replies or notes recorded yet.
          </p>
        ) : (
          replies.map((r) => {
            const isNote = r.is_internal_note;
            return (
              <div
                key={r.id}
                className={clsx(
                  "rounded-xl border p-4.5 transition-colors",
                  isNote
                    ? "border-yellow-500/30 bg-yellow-500/5 ml-6"
                    : "border-surface-border bg-surface-card",
                )}
              >
                <div className="flex items-center justify-between text-xs mb-2">
                  <div className="flex items-center gap-2">
                    {isNote ? (
                      <span className="flex items-center gap-1 rounded bg-yellow-500/20 px-2 py-0.5 text-[11px] font-semibold text-yellow-400">
                        <Lock className="h-3 w-3" /> Internal Note
                      </span>
                    ) : (
                      <span className="font-semibold text-gray-200">
                        {r.author_name || "Support Staff"}
                      </span>
                    )}
                    {r.is_auto_reply && (
                      <span className="rounded bg-surface-bg px-2 py-0.5 text-[10px] text-gray-400">
                        Auto-Reply
                      </span>
                    )}
                  </div>
                  <span className="text-gray-500 text-[11px]">
                    {formatDateTime(r.created_at)}
                  </span>
                </div>
                <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                  {r.body}
                </p>

                {/* Reply Attachments (Feature 2) */}
                {r.attachments && r.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-surface-border/50 pt-2">
                    {r.attachments.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1.5 rounded bg-surface-bg px-2 py-1 text-[11px] text-gray-300"
                      >
                        <Paperclip className="h-3 w-3 text-accent" />
                        <span>{file.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Reply Component */}
      <ReplyBox
        ticketId={ticketId}
        onSent={() => {
          refetch();
          loadReplies();
        }}
      />
    </div>
  );
}

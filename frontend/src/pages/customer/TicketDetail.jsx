import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Send,
  Star,
  Paperclip,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { useTicketDetail } from "../../hooks/useTickets";
import * as ticketService from "../../services/ticketService";
import { useToast } from "../../components/common/Toast";
import Loader from "../../components/common/Loader";
import Button from "../../components/common/Button";
import RatingModal from "../../components/customer/RatingModal";
import clsx from "clsx";
import { STATUS_COLORS } from "../../utils/constants";
import { formatRelativeTime, formatDateTime } from "../../utils/formatters";
import { useReplyRealtime } from "../../hooks/useReplyRealtime";

export default function CustomerTicketDetail() {
  const { ticketId } = useParams();
  const { ticket, loading, error, refetch } = useTicketDetail(ticketId);
  const { showToast } = useToast();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [replies, setReplies] = useState([]);
  const [repliesLoading, setRepliesLoading] = useState(true);
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [hasRated, setHasRated] = useState(false);
  const [existingRating, setExistingRating] = useState(null);

  // Check if user already rated this ticket
  useEffect(() => {
    if (!ticketId) return;
    const stored = JSON.parse(
      localStorage.getItem("deskwise_ticket_ratings") || "{}",
    );
    if (stored[ticketId]) {
      setHasRated(true);
      setExistingRating(stored[ticketId]);
    }
  }, [ticketId]);

  // Fetch replies on mount
  useEffect(() => {
    if (!ticketId) return;
    fetchReplies();
  }, [ticketId]);

  async function fetchReplies() {
    try {
      const data = await ticketService.getTicketReplies(ticketId);
      setReplies(data || []);
    } catch {
      // fallback
    } finally {
      setRepliesLoading(false);
    }
  }

  const handleNewReply = useCallback((newReply) => {
    setReplies((prev) => {
      if (prev.some((r) => r.id === newReply.id)) return prev;
      return [...prev, newReply];
    });
  }, []);

  useReplyRealtime(ticketId, handleNewReply);

  async function handleSendReply(e) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      await ticketService.addCustomerReply(ticketId, reply);
      setReply("");
      showToast("Reply sent", "success");
      await fetchReplies();
      refetch();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to send reply", "error");
    } finally {
      setSending(false);
    }
  }

  function handleRated(tId, stars) {
    setHasRated(true);
    setExistingRating({ rating: stars });
  }

  if (loading) return <Loader fullScreen />;
  if (error || !ticket) {
    return (
      <NotFound
        type="ticket"
        ticketId={ticketId}
        customMessage={error || "We could not find the requested ticket."}
      />
    );
  }

  const isClosedOrResolved =
    ticket.status === "resolved" || ticket.status === "closed";

  return (
    <div className="min-h-screen w-full bg-surface-bg mx-auto max-w-3xl px-4 py-8">
      {/* Back link */}
      <Link
        to="/tickets"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-accent transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to My Tickets</span>
      </Link>

      {/* Ticket header */}
      <div className="mt-4 rounded-2xl border border-surface-border bg-surface-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white truncate">
              {ticket.subject}
            </h1>
            <p className="mt-1 text-xs text-gray-400">
              Ticket #{ticket.id?.slice(0, 8)} • Opened{" "}
              {formatRelativeTime(ticket.created_at)}
            </p>
          </div>
          <span
            className={clsx(
              "shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize",
              STATUS_COLORS[ticket.status],
            )}
          >
            {ticket.status?.replace("_", " ")}
          </span>
        </div>

        {/* Original body */}
        <div className="mt-4 rounded-xl bg-surface-bg p-4 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
          {ticket.body_redacted || ticket.body || ticket.description}
        </div>

        {/* Attachments if any (Feature 2) */}
        {ticket.attachments && ticket.attachments.length > 0 && (
          <div className="mt-4 border-t border-surface-border pt-3">
            <p className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5 text-accent" />
              <span>Attached Files:</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {ticket.attachments.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-bg px-2.5 py-1 text-xs text-gray-300"
                >
                  <FileText className="h-3.5 w-3.5 text-accent" />
                  <span>{file.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CSAT Post-Resolution Rating Prompt (Feature 4) */}
      {isClosedOrResolved && (
        <div className="mt-6 rounded-2xl border border-accent/20 bg-gradient-to-r from-surface-card to-accent/5 p-6">
          {!hasRated ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <Star className="h-4 w-4 text-accent fill-accent" />
                  <span>How was your support experience?</span>
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  This ticket is {ticket.status?.replace("_", " ")}. Help us
                  improve by leaving a quick rating!
                </p>
              </div>
              <Button
                onClick={() => setIsRatingModalOpen(true)}
                className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-4 py-2"
              >
                <Star className="h-3.5 w-3.5" />
                <span>Rate Resolution</span>
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm text-green-400">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium text-gray-200">
                  Thank you for your rating! ({existingRating?.rating || 5}/5 ★)
                </p>
                <p className="text-xs text-gray-400">
                  Your feedback helps our support team improve.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conversation / Replies */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Messages & Updates
        </h2>

        {repliesLoading ? (
          <div className="flex justify-center py-6">
            <Loader />
          </div>
        ) : replies.length === 0 ? (
          <div className="rounded-2xl border border-surface-border bg-surface-card p-6 text-center">
            <p className="text-sm text-gray-400">
              No replies yet. A support agent will review your inquiry shortly.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {replies
              .filter((r) => !r.is_internal_note)
              .map((r) => {
                const isCustomer =
                  r.author_id === ticket.customer_id || r.is_customer;
                return (
                  <div
                    key={r.id}
                    className={clsx(
                      "rounded-2xl border p-4.5 transition-colors",
                      isCustomer
                        ? "border-accent/30 bg-accent/5 ml-8"
                        : "border-surface-border bg-surface-card mr-8",
                    )}
                  >
                    <div className="flex items-center justify-between text-xs mb-2">
                      <p className="font-semibold text-gray-200">
                        {isCustomer ? "You" : "Deskwise Support Agent"}
                        {r.is_auto_reply && " • Auto-Reply"}
                      </p>
                      <p className="text-gray-500 text-[11px]">
                        {formatDateTime(r.created_at)}
                      </p>
                    </div>
                    <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                      {r.body}
                    </p>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Reply box — active if ticket is open */}
      {!isClosedOrResolved ? (
        <form onSubmit={handleSendReply} className="mt-6">
          <div className="rounded-2xl border border-surface-border bg-surface-card p-4 space-y-3">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={3}
              placeholder="Type your message or response here…"
              className="w-full rounded-xl border border-surface-border bg-surface-bg px-3.5 py-2.5 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                loading={sending}
                className="flex items-center gap-1.5 px-5 py-2"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send Reply</span>
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      <RatingModal
        ticket={ticket}
        isOpen={isRatingModalOpen}
        onClose={() => setIsRatingModalOpen(false)}
        onRated={handleRated}
      />
    </div>
  );
}

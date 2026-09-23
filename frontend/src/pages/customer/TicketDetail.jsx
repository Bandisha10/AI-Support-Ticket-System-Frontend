import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Send,
  Star,
  Paperclip,
  FileText,
  CheckCircle2,
  Download,
  ExternalLink,
  Image as ImageIcon,
  MessageSquare,
  Clock,
  Headphones,
  User,
  ShieldCheck,
  Sparkles,
  ZoomIn,
} from "lucide-react";
import { useTicketDetail } from "../../hooks/useTickets";
import * as ticketService from "../../services/ticketService";
import { useToast } from "../../components/common/Toast";
import Loader from "../../components/common/Loader";
import Button from "../../components/common/Button";
import RatingModal from "../../components/customer/RatingModal";
import ImageLightbox from "../../components/common/ImageLightbox";
import NotFound from "../NotFound";
import clsx from "clsx";
import { STATUS_COLORS } from "../../utils/constants";
import { formatRelativeTime, formatDateTime, formatDisplayName } from "../../utils/formatters";
import { getAttachmentUrl, isImageAttachment } from "../../utils/attachments";
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
  const [selectedImage, setSelectedImage] = useState(null);

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

        {/* Attachments if any */}
        {ticket.attachments && ticket.attachments.length > 0 && (
          <div className="mt-5 border-t border-surface-border pt-4">
            <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5 text-accent" />
              <span>Attached Files ({ticket.attachments.length}):</span>
            </p>

            {/* Visual Image Previews Gallery */}
            {ticket.attachments.some((f) =>
              isImageAttachment(f.name || f.filename, f.content_type)
            ) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                {ticket.attachments
                  .filter((file) =>
                    isImageAttachment(file.name || file.filename, file.content_type)
                  )
                  .map((file, idx) => {
                    const displayName =
                      file.name || file.filename || `Image ${idx + 1}`;
                    const fileUrl = getAttachmentUrl(file.url);
                    const sizeLabel = file.size || file.size_formatted;

                    return (
                      <div
                        key={file.id || idx}
                        onClick={() =>
                          setSelectedImage({
                            url: fileUrl,
                            name: displayName,
                            size: sizeLabel,
                          })
                        }
                        className="group relative cursor-pointer overflow-hidden rounded-xl border border-surface-border bg-surface-bg p-2 transition-all hover:border-accent hover:shadow-lg shadow-sm"
                        title={`Click to preview ${displayName}`}
                      >
                        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-surface-card flex items-center justify-center">
                          <img
                            src={fileUrl}
                            alt={displayName}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-black/75 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm shadow-md">
                              <ZoomIn className="h-3.5 w-3.5 text-accent" />
                              <span>Preview Image</span>
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between px-1 text-xs">
                          <span className="truncate font-medium text-gray-200">
                            {displayName}
                          </span>
                          {sizeLabel && (
                            <span className="text-[11px] text-gray-500 shrink-0 ml-2">
                              {sizeLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Attachment File Pills */}
            <div className="flex flex-wrap gap-2.5">
              {ticket.attachments.map((file, idx) => {
                const displayName =
                  file.name || file.filename || `Attachment ${idx + 1}`;
                const isImage = isImageAttachment(
                  displayName,
                  file.content_type
                );
                const fileUrl = getAttachmentUrl(file.url);
                const sizeLabel = file.size || file.size_formatted;

                return (
                  <button
                    key={file.id || idx}
                    type="button"
                    onClick={() => {
                      if (isImage) {
                        setSelectedImage({
                          url: fileUrl,
                          name: displayName,
                          size: sizeLabel,
                        });
                      } else {
                        window.open(fileUrl, "_blank", "noopener,noreferrer");
                      }
                    }}
                    className="group inline-flex items-center gap-2 rounded-xl border border-surface-border bg-surface-bg/90 px-3 py-2 text-xs text-gray-300 transition-all hover:border-accent hover:bg-surface-bg hover:text-white shadow-sm cursor-pointer text-left"
                    title={isImage ? `Preview ${displayName}` : `Download ${displayName}`}
                  >
                    {isImage ? (
                      <ImageIcon className="h-4 w-4 text-accent shrink-0 transition-transform group-hover:scale-110" />
                    ) : (
                      <FileText className="h-4 w-4 text-accent shrink-0 transition-transform group-hover:scale-110" />
                    )}
                    <span className="truncate max-w-[200px] font-medium">
                      {displayName}
                    </span>
                    {sizeLabel && (
                      <span className="text-[11px] text-gray-500">
                        ({sizeLabel})
                      </span>
                    )}
                    {isImage ? (
                      <ZoomIn className="h-3.5 w-3.5 text-gray-500 transition-colors group-hover:text-accent shrink-0" />
                    ) : (
                      <ExternalLink className="h-3 w-3 text-gray-500 transition-colors group-hover:text-accent shrink-0" />
                    )}
                  </button>
                );
              })}
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
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-accent" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Messages & Updates
            </h2>
            {!repliesLoading && (
              <span className="rounded-full border border-surface-border bg-surface-card px-2 py-0.5 text-[11px] font-semibold text-gray-400">
                {replies.filter((r) => !r.is_internal_note).length}
              </span>
            )}
          </div>
        </div>

        {repliesLoading ? (
          <div className="flex justify-center py-8">
            <Loader />
          </div>
        ) : replies.length === 0 ? (
          <div className="rounded-2xl border border-surface-border bg-surface-card/80 p-8 text-center backdrop-blur-sm shadow-sm">
            <p className="text-sm font-medium text-gray-300">No replies yet</p>
            <p className="mt-1 text-xs text-gray-500">
              A support agent will review your inquiry shortly.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {replies
              .filter((r) => !r.is_internal_note)
              .map((r) => {
                const isCustomer =
                  r.author_id === ticket.customer_id || r.is_customer;
                const authorName = formatDisplayName(
                  r.author_name,
                  r.author_email,
                  isCustomer ? "You" : "Support Agent"
                );

                return (
                  <div
                    key={r.id}
                    className={clsx(
                      "w-full rounded-2xl border p-6 transition-all shadow-sm",
                      isCustomer
                        ? "border-accent/30 bg-surface-card/90"
                        : "border-blue-500/30 bg-surface-card/90"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={clsx(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold border shadow-inner",
                            isCustomer
                              ? "bg-accent/10 text-accent border-accent/20"
                              : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                          )}
                        >
                          {isCustomer ? (
                            <User className="h-4 w-4" />
                          ) : (
                            <ShieldCheck className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-white tracking-tight">
                              {isCustomer ? "You" : authorName}
                            </span>
                            {!isCustomer && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-400 border border-blue-500/20">
                                <Headphones className="h-3 w-3" />
                                <span>Support Staff</span>
                              </span>
                            )}
                            {r.is_auto_reply && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 px-2 py-0.5 text-[11px] font-semibold text-purple-400 border border-purple-500/20">
                                <Sparkles className="h-3 w-3" />
                                <span>Auto-Reply</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0 font-medium">
                        <Clock className="h-3.5 w-3.5 text-gray-500" />
                        <span>{formatDateTime(r.created_at)}</span>
                      </div>
                    </div>

                    <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed font-normal">
                      {r.body}
                    </p>

                    {/* Reply Attachments */}
                    {r.attachments && r.attachments.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-surface-border pt-3">
                        {r.attachments.map((file, idx) => {
                          const displayName =
                            file.name || file.filename || `Attachment ${idx + 1}`;
                          const isImage = isImageAttachment(
                            displayName,
                            file.content_type
                          );
                          const fileUrl = getAttachmentUrl(file.url);
                          return (
                            <button
                              key={file.id || idx}
                              type="button"
                              onClick={() => {
                                if (isImage) {
                                  setSelectedImage({
                                    url: fileUrl,
                                    name: displayName,
                                  });
                                } else {
                                  window.open(fileUrl, "_blank", "noopener,noreferrer");
                                }
                              }}
                              className="inline-flex items-center gap-2 rounded-xl border border-surface-border bg-surface-bg px-3 py-2 text-xs text-gray-300 hover:border-accent hover:text-white transition-all shadow-sm cursor-pointer text-left"
                            >
                              {isImage ? (
                                <ImageIcon className="h-4 w-4 text-accent" />
                              ) : (
                                <Paperclip className="h-4 w-4 text-accent" />
                              )}
                              <span className="max-w-[200px] truncate font-medium">
                                {displayName}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Reply box — active if ticket is open */}
      {!isClosedOrResolved ? (
        <form onSubmit={handleSendReply} className="mt-8">
          <div className="w-full rounded-2xl border border-surface-border bg-surface-card p-6 space-y-4 shadow-sm">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={3}
              placeholder="Type your message or response here…"
              className="w-full rounded-xl border border-surface-border bg-surface-bg p-4 text-sm text-gray-200 placeholder:text-gray-500 focus:border-accent focus:outline-none transition-colors"
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                loading={sending}
                className="flex items-center gap-2 px-6 py-2.5 font-semibold text-xs"
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

      <ImageLightbox
        isOpen={Boolean(selectedImage)}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage?.url}
        imageName={selectedImage?.name}
        imageSize={selectedImage?.size}
      />
    </div>
  );
}

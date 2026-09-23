import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Paperclip,
  FileText,
  Lock,
  User,
  ShieldAlert,
  ShieldCheck,
  ExternalLink,
  Image as ImageIcon,
  MessageSquare,
  Clock,
  Headphones,
  Sparkles,
  ZoomIn,
} from "lucide-react";
import { useTicketDetail } from "../../hooks/useTickets";
import { useAuth } from "../../hooks/useAuth";
import ReplyBox from "../../components/agent/ReplyBox";
import SLAWatcher from "../../components/agent/SLAWatcher";
import Loader from "../../components/common/Loader";
import NotFound from "../NotFound";
import ImageLightbox from "../../components/common/ImageLightbox";
import * as ticketService from "../../services/ticketService";
import { formatDateTime, formatRelativeTime, formatDisplayName } from "../../utils/formatters";
import { getAttachmentUrl, isImageAttachment } from "../../utils/attachments";
import clsx from "clsx";
import { STATUS_COLORS } from "../../utils/constants";
import { useReplyRealtime } from "../../hooks/useReplyRealtime";

export default function TicketDetail() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const { ticket, loading, error, refetch } = useTicketDetail(ticketId);
  const [replies, setReplies] = useState([]);
  const [repliesLoading, setRepliesLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);

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

  const handleNewReply = useCallback((newReply) => {
    setReplies((prev) => {
      if (prev.some((r) => r.id === newReply.id)) return prev;
      return [...prev, newReply];
    });
  }, []);

  useReplyRealtime(ticketId, handleNewReply);

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

        {/* Attached Files */}
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

      {/* Message Thread */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-accent" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Activity & Replies
            </h2>
            {!repliesLoading && (
              <span className="rounded-full border border-surface-border bg-surface-card px-2 py-0.5 text-[11px] font-semibold text-gray-400">
                {replies.length}
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
            <p className="text-sm font-medium text-gray-300">No replies recorded yet</p>
            <p className="mt-1 text-xs text-gray-500">
              Use the reply box below to send an update or add an internal note.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {replies.map((r) => {
              const isNote = r.is_internal_note;
              const isFromCustomer = r.author_id === ticket.customer_id;
              const isMine = r.author_id == user?.id;
              const authorLabel = isFromCustomer
                ? ticket.customer_name || ticket.customer_email || "Customer"
                : isMine
                ? "You"
                : formatDisplayName(r.author_name, r.author_email, "Support Staff");

              return (
                <div
                  key={r.id}
                  className={clsx(
                    "w-full rounded-2xl border p-6 transition-all shadow-sm",
                    isNote
                      ? "border-yellow-500/30 bg-surface-card/90"
                      : isFromCustomer
                      ? "border-surface-border bg-surface-card/90"
                      : "border-blue-500/30 bg-surface-card/90"
                  )}
                >
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={clsx(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold border shadow-inner",
                          isNote
                            ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                            : isFromCustomer
                            ? "bg-gray-700/30 text-gray-300 border-gray-600/30"
                            : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        )}
                      >
                        {isNote ? (
                          <Lock className="h-4 w-4" />
                        ) : isFromCustomer ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white tracking-tight">
                            {authorLabel}
                          </span>
                          {isNote && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-yellow-500/10 px-2 py-0.5 text-[11px] font-semibold text-yellow-400 border border-yellow-500/20">
                              <Lock className="h-3 w-3" /> Internal Note
                            </span>
                          )}
                          {!isNote && !isFromCustomer && (
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

      {/* Reply Component */}
      <ReplyBox
        ticketId={ticketId}
        onSent={() => {
          refetch();
          loadReplies();
        }}
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

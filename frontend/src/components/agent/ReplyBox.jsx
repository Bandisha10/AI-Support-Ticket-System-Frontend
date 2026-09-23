import { useState, useEffect, useRef } from "react";
import { Sparkles, Paperclip, BookOpen, X, FileText, UploadCloud, ChevronDown } from "lucide-react";
import Button from "../common/Button";
import { useToast } from "../common/Toast";
import * as ticketService from "../../services/ticketService";

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function ReplyBox({ ticketId, onSent }) {
  const { showToast } = useToast();
  const [message, setMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  // File Attachments State (Feature 2)
  const [attachments, setAttachments] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Canned Replies State (Feature 5)
  const [cannedReplies, setCannedReplies] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const templateMenuRef = useRef(null);

  useEffect(() => {
    ticketService
      .getCannedReplies()
      .then((templates) => setCannedReplies(templates))
      .catch((err) => console.warn("Failed to load canned replies:", err));
  }, []);

  // Close template menu on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (templateMenuRef.current && !templateMenuRef.current.contains(e.target)) {
        setShowTemplates(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".pdf", ".doc", ".docx", ".txt"];
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

  function handleFileSelect(files) {
    const fileList = Array.from(files || []);
    if (!fileList.length) return;

    const validAttachments = [];
    for (const file of fileList) {
      const ext = "." + file.name.split(".").pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        showToast(`"${file.name}" has an unsupported format. Allowed: PNG, JPG, WEBP, PDF, DOC, TXT`, "error");
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        showToast(`"${file.name}" exceeds the 5 MB file size limit.`, "error");
        continue;
      }
      validAttachments.push({
        id: Math.random().toString(36).substring(2, 9),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      });
    }

    if (validAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...validAttachments]);
    }
  }

  function removeAttachment(id) {
    setAttachments((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  function handleApplyTemplate(template) {
    setMessage((prev) => (prev ? `${prev}\n\n${template.body}` : template.body));
    setShowTemplates(false);
    showToast(`Template "${template.title}" applied`, "info");
  }

  async function handleSend() {
    const hasMessage = Boolean(message.trim());
    const hasAttachments = attachments.length > 0;
    if (!hasMessage && !hasAttachments) return;

    setSending(true);
    try {
      if (hasAttachments) {
        await ticketService.uploadTicketAttachments(ticketId, attachments);
      }

      if (hasMessage) {
        await ticketService.sendAgentReply(ticketId, message, isInternal);
      }

      // Cleanup preview URLs
      attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });

      setMessage("");
      setAttachments([]);

      if (hasMessage && hasAttachments) {
        showToast(isInternal ? "Internal note & attachments added" : "Reply & attachments sent to customer", "success");
      } else if (hasAttachments) {
        showToast("Attachments uploaded to ticket successfully", "success");
      } else {
        showToast(isInternal ? "Internal note added" : "Reply sent to customer", "success");
      }

      onSent?.();
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to send reply or upload attachments", "error");
    } finally {
      setSending(false);
    }
  }

  async function handleSuggest() {
    setSuggesting(true);
    try {
      const { suggestion } = await ticketService.getSuggestedReply(ticketId);
      if (suggestion) {
        setMessage(suggestion);
        showToast("AI suggestion inserted", "success");
      } else {
        showToast("No AI suggestion returned for this ticket", "info");
      }
    } catch {
      showToast("AI suggestion unavailable right now", "error");
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) handleFileSelect(e.dataTransfer.files);
      }}
      className={`w-full space-y-4 rounded-2xl border bg-surface-card p-6 shadow-sm transition-colors ${
        isDragging ? "border-accent bg-accent/5" : "border-surface-border"
      }`}
    >
      <div className="flex items-center justify-between border-b border-surface-border pb-3">
        <div className="flex items-center gap-2">
          {/* Templates Dropdown (Feature 5) */}
          <div className="relative" ref={templateMenuRef}>
            <button
              type="button"
              onClick={() => setShowTemplates((prev) => !prev)}
              className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-bg px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:border-accent hover:text-accent transition-colors"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Templates</span>
              <ChevronDown className="h-3 w-3 text-gray-500" />
            </button>

            {showTemplates && (
              <div className="absolute left-0 top-full z-20 mt-1.5 w-72 rounded-xl border border-surface-border bg-surface-card shadow-2xl p-1.5">
                <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Canned Responses
                </p>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {cannedReplies.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleApplyTemplate(t)}
                      className="w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-surface-hover group"
                    >
                      <p className="font-medium text-gray-200 group-hover:text-accent">
                        {t.title}
                      </p>
                      <p className="line-clamp-1 text-[11px] text-gray-500">
                        {t.body}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Attach file button (Feature 2) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-bg px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:border-accent hover:text-accent transition-colors"
          >
            <Paperclip className="h-3.5 w-3.5" />
            <span>Attach</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={(e) => {
              handleFileSelect(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* AI Suggest Button */}
        <Button
          variant="secondary"
          onClick={handleSuggest}
          loading={suggesting}
          className="flex items-center gap-1.5 px-3 py-1 text-xs"
        >
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          <span>AI Suggest</span>
        </Button>
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        placeholder={
          isInternal
            ? "Write an internal note for your team (customer will not see this)…"
            : "Write a reply to the customer or drag & drop files here…"
        }
        className="w-full rounded-xl border border-surface-border bg-surface-bg p-4 text-sm text-gray-200 placeholder:text-gray-500 focus:border-accent focus:outline-none transition-colors"
      />

      {/* Selected Attachments Preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-bg px-2.5 py-1.5 text-xs"
            >
              {att.previewUrl ? (
                <img
                  src={att.previewUrl}
                  alt={att.name}
                  className="h-6 w-6 rounded object-cover"
                />
              ) : (
                <FileText className="h-4 w-4 text-accent" />
              )}
              <span className="max-w-[150px] truncate text-gray-300 font-medium">
                {att.name}
              </span>
              <span className="text-[10px] text-gray-500">
                ({formatFileSize(att.size)})
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(att.id)}
                className="text-gray-500 hover:text-red-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-400 select-none">
          <input
            type="checkbox"
            checked={isInternal}
            onChange={(e) => setIsInternal(e.target.checked)}
            className="rounded border-surface-border bg-surface-bg text-accent focus:ring-0"
          />
          <span>Internal note (staff only)</span>
        </label>

        <Button onClick={handleSend} loading={sending} className="px-5 py-2 text-sm font-semibold">
          {isInternal ? "Add Note" : "Send Reply"}
        </Button>
      </div>
    </div>
  );
}
import { useState, useRef } from "react";
import { UploadCloud, X, FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import Button from "../common/Button";
import { useToast } from "../common/Toast";
import * as ticketService from "../../services/ticketService";
import { validateAttachmentFile } from "../../utils/attachments";

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function TicketForm({ onCreated }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ subject: "", description: "", category_id: "" });
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleFileSelect(files) {
    const fileList = Array.from(files || []);
    if (!fileList.length) return;

    const validNewAttachments = [];
    for (const file of fileList) {
      const validation = validateAttachmentFile(file);
      if (!validation.valid) {
        showToast(validation.error, "error");
        continue;
      }
      validNewAttachments.push({
        id: Math.random().toString(36).substring(2, 9),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      });
    }

    if (validNewAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...validNewAttachments]);
    }
  }

  function removeAttachment(id) {
    setAttachments((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  }

  function handleDragOver(e) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.subject.trim() || !form.description.trim()) {
      showToast("Please fill in both subject and description", "error");
      return;
    }
    setSubmitting(true);
    try {
      const ticket = await ticketService.createTicket(form, attachments);
      const msg =
        attachments.length > 0
          ? `Ticket submitted successfully with ${attachments.length} attachment${attachments.length > 1 ? "s" : ""}`
          : "Ticket submitted successfully";
      showToast(msg, "success");
      setForm({ subject: "", description: "", category_id: "" });
      setAttachments([]);
      onCreated?.(ticket);
    } catch (err) {
      showToast(err.response?.data?.detail || "Could not submit ticket", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-surface-border bg-surface-card p-6 sm:p-8">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">
          Subject <span className="text-accent">*</span>
        </label>
        <input
          name="subject"
          value={form.subject}
          onChange={handleChange}
          required
          className="w-full rounded-lg border border-surface-border bg-surface-bg px-3.5 py-2.5 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
          placeholder="Briefly summarize your request or issue"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">
          Description <span className="text-accent">*</span>
        </label>
        <textarea
          name="description"
          value={form.description}
          onChange={handleChange}
          required
          rows={5}
          className="w-full rounded-lg border border-surface-border bg-surface-bg px-3.5 py-2.5 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent focus:outline-none"
          placeholder="Provide specific details about the issue. Our AI classification model uses this text to determine severity and route your request."
        />
      </div>

      {/* Drag & Drop File Upload Area */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">
          Attachments (Screenshots / Documents)
        </label>
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            isDragging
              ? "border-accent bg-accent/10"
              : "border-surface-border bg-surface-bg/50 hover:border-accent/60 hover:bg-surface-bg"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-card text-accent">
              <UploadCloud className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-gray-300">
              <span className="text-accent underline">Click to upload</span> or drag and drop files
            </p>
            <p className="text-xs text-gray-500">
              PNG, JPG, PDF, or text files up to 10MB
            </p>
          </div>
        </div>

        {/* Selected Files Preview List */}
        {attachments.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-gray-400">
              Selected Files ({attachments.length}):
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-bg p-2.5"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    {att.previewUrl ? (
                      <img
                        src={att.previewUrl}
                        alt={att.name}
                        className="h-10 w-10 rounded object-cover border border-surface-border shrink-0"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-surface-card text-accent">
                        <FileText className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-gray-200">
                        {att.name}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {formatFileSize(att.size)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAttachment(att.id);
                    }}
                    className="p-1 text-gray-500 hover:text-red-400"
                    title="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pt-2 flex justify-end">
        <Button type="submit" loading={submitting} className="px-6 py-2.5 text-sm font-semibold">
          Submit Ticket
        </Button>
      </div>
    </form>
  );
}
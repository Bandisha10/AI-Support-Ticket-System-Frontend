// frontend/src/utils/attachments.js

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
];

/**
 * Builds a full URL for opening/downloading attachments.
 * Prefers import.meta.env.VITE_API_URL, fallback to http://localhost:8000.
 */
export function getAttachmentUrl(relativeOrFullUrl) {
  if (!relativeOrFullUrl) return "#";
  if (
    relativeOrFullUrl.startsWith("http://") ||
    relativeOrFullUrl.startsWith("https://")
  ) {
    return relativeOrFullUrl;
  }
  const apiBase =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL?.replace(/\/api\/?$/, "") ||
    "http://localhost:8000";
  const cleanBase = apiBase.replace(/\/+$/, "");
  const cleanPath = relativeOrFullUrl.startsWith("/")
    ? relativeOrFullUrl
    : `/${relativeOrFullUrl}`;
  return `${cleanBase}${cleanPath}`;
}

/**
 * Determines whether a file is an image based on content_type or extension.
 */
export function isImageAttachment(filename = "", contentType = "") {
  if (contentType && contentType.startsWith("image/")) return true;
  return /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(filename || "");
}

/**
 * Validates a single file against max size (5 MB) and allowed extensions.
 */
export function validateAttachmentFile(file) {
  if (!file) return { valid: false, error: "No file selected" };
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      valid: false,
      error: `File "${file.name}" exceeds the 5 MB size limit.`,
    };
  }
  const name = file.name || "";
  const ext = name.includes(".")
    ? name.substring(name.lastIndexOf(".")).toLowerCase()
    : "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `File "${file.name}" has an unsupported format. Allowed: PNG, JPG, JPEG, GIF, WEBP, PDF, DOC, DOCX, TXT.`,
    };
  }
  return { valid: true };
}

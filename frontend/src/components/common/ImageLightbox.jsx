import { useEffect } from "react";
import { X, ExternalLink, FileText, Image as ImageIcon } from "lucide-react";

export default function ImageLightbox({
  isOpen,
  onClose,
  imageUrl,
  imageName,
  imageSize,
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl) return null;

  const ext = (imageName || imageUrl).split(".").pop().toLowerCase();
  const isImage = ["png", "jpg", "jpeg", "webp"].includes(ext);
  const isPdf = ext === "pdf";
  const isTxt = ext === "txt";
  const isDoc = ext === "doc" || ext === "docx";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-surface-border bg-surface-card/95 px-5 py-3.5 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 mr-4">
            {isImage ? (
              <ImageIcon className="h-4 w-4 text-accent shrink-0" />
            ) : (
              <FileText className="h-4 w-4 text-accent shrink-0" />
            )}
            <span className="truncate text-sm font-semibold text-white">
              {imageName || "Attachment Preview"}
            </span>
            {imageSize && (
              <span className="rounded bg-surface-bg px-2 py-0.5 text-xs text-gray-400 shrink-0">
                {imageSize}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-bg px-3 py-1.5 text-xs font-medium text-gray-300 hover:border-accent hover:text-white transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Open in Tab</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-surface-bg hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Viewer Body */}
        <div className="flex flex-1 items-center justify-center overflow-hidden bg-black/40 p-2 sm:p-4">
          {isImage ? (
            <img
              src={imageUrl}
              alt={imageName || "Attachment"}
              className="max-h-full max-w-full rounded-lg object-contain shadow-md"
            />
          ) : isPdf || isTxt ? (
            <iframe
              src={imageUrl}
              title={imageName}
              className="h-full w-full rounded-lg border border-surface-border bg-white"
            />
          ) : isDoc ? (
            // Word Docs: Render via Microsoft Office Online Viewer or direct open
            <div className="flex flex-col items-center justify-center p-8 text-center max-w-md">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold text-xl mb-4">
                DOC
              </div>
              <p className="text-sm font-semibold text-white mb-1">{imageName}</p>
              <p className="text-xs text-gray-400 mb-6">
                Word documents are downloaded or viewed in external office viewers.
              </p>
              <a
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-xs font-semibold text-surface-bg hover:bg-accent-hover transition-colors shadow-md"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Open / Download Document</span>
              </a>
            </div>
          ) : (
            <iframe
              src={imageUrl}
              title={imageName}
              className="h-full w-full rounded-lg border-0 bg-surface-bg"
            />
          )}
        </div>
      </div>
    </div>
  );
}

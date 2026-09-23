import { useEffect } from "react";
import { X, ExternalLink, Download, Image as ImageIcon } from "lucide-react";

export default function ImageLightbox({ isOpen, onClose, imageUrl, imageName, imageSize }) {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] max-w-5xl flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-surface-border bg-surface-card/95 px-5 py-3.5 backdrop-blur-sm">
          <div className="flex items-center gap-2.5 min-w-0 mr-4">
            <ImageIcon className="h-4 w-4 text-accent shrink-0" />
            <span className="truncate text-sm font-semibold text-white">
              {imageName || "Attachment Preview"}
            </span>
            {imageSize && (
              <span className="rounded bg-surface-bg px-2 py-0.5 text-xs text-gray-400">
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
              <span>Full Size</span>
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

        {/* Image Container */}
        <div className="flex max-h-[calc(92vh-60px)] items-center justify-center overflow-auto bg-black/40 p-4">
          <img
            src={imageUrl}
            alt={imageName || "Image Attachment"}
            className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain shadow-md"
          />
        </div>
      </div>
    </div>
  );
}

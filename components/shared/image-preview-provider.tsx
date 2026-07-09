"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface ImagePreviewPayload {
  url: string;
  title?: string;
  meta?: string;
}

interface ImagePreviewContextValue {
  openImagePreview: (image: ImagePreviewPayload) => void;
  closeImagePreview: () => void;
}

const ImagePreviewContext = createContext<ImagePreviewContextValue | null>(null);

export function useImagePreview() {
  const context = useContext(ImagePreviewContext);
  if (!context) {
    throw new Error("useImagePreview must be used within ImagePreviewProvider");
  }

  return context;
}

export function ImagePreviewProvider({ children }: { children: ReactNode }) {
  const [image, setImage] = useState<ImagePreviewPayload | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!image) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setImage(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [image]);

  const value = useMemo<ImagePreviewContextValue>(
    () => ({
      openImagePreview: setImage,
      closeImagePreview: () => setImage(null),
    }),
    [],
  );

  return (
    <ImagePreviewContext.Provider value={value}>
      {children}
      {mounted ? createPortal(<ImagePreviewModal image={image} onClose={() => setImage(null)} />, document.body) : null}
    </ImagePreviewContext.Provider>
  );
}

function ImagePreviewModal({
  image,
  onClose,
}: {
  image: ImagePreviewPayload | null;
  onClose: () => void;
}) {
  if (!image) {
    return null;
  }

  const title = image.title ?? "图片预览";

  return (
    <div
      className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/82 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`查看大图：${title}`}
      onClick={onClose}
    >
      <button
        type="button"
        className="fixed right-5 top-5 z-[101] inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/14 text-white shadow-lg transition-colors hover:bg-white/24 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        onClick={onClose}
        aria-label="关闭大图预览"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="flex h-full w-full max-w-7xl flex-col gap-3">
        <div className="pointer-events-none flex shrink-0 items-center justify-between gap-3 pr-14 text-white">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{title}</p>
            {image.meta ? <p className="text-xs text-white/65">{image.meta}</p> : null}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-white/5 p-2">
          <img src={image.url} alt={title} className="max-h-full max-w-full object-contain" />
        </div>
      </div>
    </div>
  );
}

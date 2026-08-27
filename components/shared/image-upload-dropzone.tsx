"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Images, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { pickImageFiles, pickImageFilesFromClipboardItems } from "@/lib/utils/image-file-selection";

let lastHandledPaste: { signature: string; timestamp: number } | null = null;

type ImageUploadDropzoneProps = {
  id: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  acceptPagePaste?: boolean;
  multiple?: boolean;
  disabled?: boolean;
  title: string;
  description: string;
  emptyIcon?: "upload" | "images";
  minHeightClassName?: string;
  previewColumnsClassName?: string;
};

function buildPreviewKey(file: File, index: number) {
  return `${file.name}-${file.lastModified}-${file.size}-${index}`;
}

function fileIdentitySignature(file: File) {
  return `${file.name}-${file.type}-${file.size}-${file.lastModified}`;
}

function clipboardImageSignature(file: File) {
  return `${file.type}-${file.size}`;
}

function dedupeFiles(files: File[], getSignature: (file: File) => string = fileIdentitySignature) {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = getSignature(file);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function appendUniqueFiles(
  currentFiles: File[],
  nextFiles: File[],
  getSignature: (file: File) => string = fileIdentitySignature,
) {
  const existingSignatures = new Set(currentFiles.map(getSignature));
  const filesToAppend = dedupeFiles(nextFiles, getSignature).filter((file) => !existingSignatures.has(getSignature(file)));
  return filesToAppend.length > 0 ? [...currentFiles, ...filesToAppend] : currentFiles;
}

function ImagePreviewItem(props: {
  file: File;
  index: number;
  disabled?: boolean;
  onRemove: (index: number) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let canceled = false;
    const reader = new FileReader();

    setPreviewUrl("");
    setLoadFailed(false);

    reader.onload = () => {
      if (!canceled && typeof reader.result === "string") {
        setPreviewUrl(reader.result);
      }
    };
    reader.onerror = () => {
      if (!canceled) {
        setLoadFailed(true);
      }
    };
    reader.readAsDataURL(props.file);

    return () => {
      canceled = true;
      reader.abort();
    };
  }, [props.file]);

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <button
        type="button"
        aria-label="删除已上传图片"
        disabled={props.disabled}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          props.onRemove(props.index);
        }}
        className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/92 text-slate-700 shadow-md transition hover:bg-white hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-black/70 dark:text-slate-200 dark:hover:text-red-300"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <div className="flex aspect-square items-center justify-center bg-slate-100 dark:bg-black/20">
        {previewUrl && !loadFailed ? (
          <img
            src={previewUrl}
            alt={props.file.name}
            className="h-full w-full object-contain"
            onError={() => setLoadFailed(true)}
          />
        ) : (
          <Images className="h-10 w-10 text-slate-300 dark:text-slate-600" />
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{props.file.name}</p>
      </div>
    </div>
  );
}

export function ImageUploadDropzone(props: ImageUploadDropzoneProps) {
  const {
    id,
    files,
    onFilesChange,
    acceptPagePaste = false,
    multiple = false,
    disabled = false,
    title,
    description,
    emptyIcon = "upload",
    minHeightClassName = "min-h-[300px]",
    previewColumnsClassName = "grid-cols-2",
  } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const applyFiles = useCallback(
    (nextFiles: File[]) => {
      if (nextFiles.length === 0) {
        toast.error("请上传 JPG、PNG、WEBP 等图片文件。");
        return;
      }

      if (!multiple) {
        onFilesChange(nextFiles.slice(0, 1));
        return;
      }

      onFilesChange(appendUniqueFiles(files, nextFiles));
    },
    [files, multiple, onFilesChange],
  );

  const handleInputChange = (fileList: FileList | null) => {
    applyFiles(pickImageFiles(fileList));
  };

  const handlePaste = useCallback(
    (event: ClipboardEvent | React.ClipboardEvent<HTMLDivElement>) => {
      if (disabled || event.defaultPrevented) {
        return;
      }

      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        return;
      }

      const nextFiles = dedupeFiles(
        [
          ...pickImageFiles(clipboardData.files),
          ...pickImageFilesFromClipboardItems(clipboardData.items),
        ],
        clipboardImageSignature,
      );

      if (nextFiles.length === 0) {
        return;
      }

      const pasteSignature = nextFiles.map((file) => `${file.type}:${file.size}`).join("|");
      const now = Date.now();
      if (
        lastHandledPaste?.signature === pasteSignature &&
        now - lastHandledPaste.timestamp < 700
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      lastHandledPaste = { signature: pasteSignature, timestamp: now };

      event.preventDefault();
      event.stopPropagation();
      if (!multiple) {
        onFilesChange(nextFiles.slice(0, 1));
        return;
      }

      onFilesChange(appendUniqueFiles(files, nextFiles, clipboardImageSignature));
    },
    [disabled, files, multiple, onFilesChange],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const handleWindowPaste = (event: ClipboardEvent) => {
      const hoveredDropzone = document.querySelector('[data-image-upload-dropzone="true"]:hover');
      const activeDropzone = document.activeElement?.closest('[data-image-upload-dropzone="true"]') ?? null;
      const shouldHandlePaste = hoveredDropzone
        ? hoveredDropzone === root
        : activeDropzone
          ? activeDropzone === root
          : acceptPagePaste;

      if (!shouldHandlePaste) {
        return;
      }
      handlePaste(event);
    };

    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [acceptPagePaste, handlePaste]);

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, currentIndex) => currentIndex !== index));
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const Icon = emptyIcon === "images" ? Images : UploadCloud;

  return (
    <div
      ref={rootRef}
      data-image-upload-dropzone="true"
      role="button"
      tabIndex={0}
      className={`flex ${minHeightClassName} cursor-pointer flex-col rounded-[1.5rem] border border-dashed p-5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-4 dark:focus-visible:ring-white dark:focus-visible:ring-offset-slate-950 ${
        dragging
          ? "border-slate-900 bg-slate-50 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.2)] dark:border-white/40 dark:bg-white/[0.06]"
          : "border-slate-300 bg-white/50 hover:bg-slate-50/80 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.04]"
      } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
      onMouseDown={() => {
        if (!disabled) {
          rootRef.current?.focus();
        }
      }}
      onClick={() => {
        if (!disabled) {
          inputRef.current?.click();
        }
      }}
      onKeyDown={(event) => {
        if (disabled || (event.key !== "Enter" && event.key !== " ")) {
          return;
        }
        event.preventDefault();
        inputRef.current?.click();
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) {
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) {
          event.dataTransfer.dropEffect = "copy";
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) {
          applyFiles(pickImageFiles(event.dataTransfer.files));
        }
      }}
    >
      <Input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*"
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => handleInputChange(event.target.files)}
        className="hidden"
      />

      {files.length > 0 ? (
        <div className={`grid gap-3 ${previewColumnsClassName}`}>
          {files.map((file, index) => (
            <ImagePreviewItem
              key={buildPreviewKey(file, index)}
              file={file}
              index={index}
              disabled={disabled}
              onRemove={removeFile}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center">
          <Icon className="h-11 w-11 text-slate-400" />
          <p className="mt-5 text-base font-medium text-slate-900 dark:text-white">{title}</p>
          <p className="mt-2 max-w-md text-sm leading-7 text-slate-400 dark:text-slate-500">{description}</p>
        </div>
      )}
    </div>
  );
}

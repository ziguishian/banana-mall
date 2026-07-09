export type FileCandidate = Pick<File, "type">;

export interface ClipboardFileCandidate {
  kind: string;
  type: string;
  getAsFile(): File | null;
}

function isImageFile(file: FileCandidate | null | undefined) {
  return Boolean(file?.type.startsWith("image/"));
}

export function pickFirstImageFile(files: Iterable<File> | ArrayLike<File> | null | undefined) {
  if (!files) {
    return null;
  }

  for (const file of Array.from(files)) {
    if (isImageFile(file)) {
      return file;
    }
  }

  return null;
}

export function pickImageFiles(files: Iterable<File> | ArrayLike<File> | null | undefined) {
  if (!files) {
    return [];
  }

  return Array.from(files).filter(isImageFile);
}

export function pickFirstImageFromClipboardItems(items: Iterable<ClipboardFileCandidate> | null | undefined) {
  if (!items) {
    return null;
  }

  for (const item of Array.from(items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) {
      continue;
    }

    const file = item.getAsFile();
    if (isImageFile(file)) {
      return file;
    }
  }

  return null;
}

export function pickImageFilesFromClipboardItems(items: Iterable<ClipboardFileCandidate> | null | undefined) {
  if (!items) {
    return [];
  }

  const files: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) {
      continue;
    }

    const file = item.getAsFile();
    if (file && isImageFile(file)) {
      files.push(file);
    }
  }

  return files;
}

import { colors } from "@/theme";

export type MediaKind = "image" | "video" | "document";

/** A file picked for sending, before it's uploaded. */
export interface MediaItem {
  uri: string;
  kind: MediaKind;
  name: string;
  mimeType: string;
  size?: number | null; // bytes
  duration?: number | null; // seconds (videos)
}

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Image-picker / camera asset → MediaItem (the picker reports video duration in ms). */
export const mediaFromPickerAsset = (a: { uri: string; type?: string | null; fileName?: string | null; mimeType?: string | null; fileSize?: number | null; duration?: number | null }): MediaItem => {
  const isVideo = a.type === "video";
  return {
    uri: a.uri,
    kind: isVideo ? "video" : "image",
    name: a.fileName || (isVideo ? "video.mp4" : "photo.jpg"),
    mimeType: a.mimeType || (isVideo ? "video/mp4" : "image/jpeg"),
    size: a.fileSize ?? null,
    duration: isVideo && a.duration ? a.duration / 1000 : null,
  };
};

export const formatBytes = (bytes?: number | null) => {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Icon, short label and accent color for a document, from its extension (or MIME type). */
export const documentKind = (name: string, mimeType?: string): { icon: any; label: string; color: string } => {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf" || mimeType === "application/pdf") return { icon: "document-text", label: "PDF", color: "#EF4444" };
  if (["doc", "docx", "odt", "rtf", "txt"].includes(ext)) return { icon: "document-text", label: ext.toUpperCase(), color: "#3B82F6" };
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return { icon: "grid", label: ext.toUpperCase(), color: "#10B981" };
  if (["ppt", "pptx", "odp", "key"].includes(ext)) return { icon: "easel", label: ext.toUpperCase(), color: "#F59E0B" };
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return { icon: "archive", label: ext.toUpperCase(), color: "#8B5CF6" };
  if (mimeType?.startsWith("audio/")) return { icon: "musical-notes", label: ext.toUpperCase() || "AUDIO", color: "#EC4899" };
  if (mimeType?.startsWith("image/")) return { icon: "image", label: ext.toUpperCase() || "IMAGE", color: "#06B6D4" };
  return { icon: "document", label: ext ? ext.toUpperCase() : "FILE", color: colors.primary };
};

/** File name safe for a storage key / URL (the original name is kept for display). */
export const safeFileName = (name: string) => (name || "file").replace(/[^\w.-]+/g, "_").slice(-120);

/** PUTs a local file to a presigned URL. Resolves only on a 2xx response. */
export const uploadToPresignedUrl = (uploadUrl: string, item: MediaItem, onProgress?: (fraction: number) => void) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", item.mimeType);
    xhr.upload.onprogress = (e) => { if (e.total) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.send({ uri: item.uri, type: item.mimeType, name: safeFileName(item.name) } as any);
  });

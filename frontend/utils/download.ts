import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File } from "expo-file-system";
import * as LegacyFS from "expo-file-system/legacy";
import { Platform, Share } from "react-native";
import { safeFileName } from "@/utils/media";

// Folder the user picked on Android (a SAF content URI), reused for later downloads
const DOWNLOAD_DIR_KEY = "downloadDirUri";

export class DownloadCancelled extends Error {
  constructor() {
    super("Download cancelled");
  }
}

/** Downloads into the app cache, reporting progress (0..1). Rejects on non-2xx. */
async function downloadToCache(url: string, name: string, onProgress?: (fraction: number) => void) {
  const dir = `${LegacyFS.cacheDirectory}downloads/`;
  await LegacyFS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const dest = `${dir}${Date.now()}_${safeFileName(name)}`;

  const task = LegacyFS.createDownloadResumable(url, dest, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
  });
  const res = await task.downloadAsync();
  if (!res || res.status < 200 || res.status >= 300) {
    await LegacyFS.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
    throw new Error(`Download failed (${res?.status ?? "no response"})`);
  }
  return res.uri;
}

/** Readable folder name from a SAF tree URI, e.g. ".../tree/primary%3ADownload" → "Download". */
const folderLabel = (dirUri: string) => {
  const last = decodeURIComponent(dirUri.split("/").pop() || "");
  return last.split(":").pop() || "the selected folder";
};

/** Android: copy a cached file into the user's chosen folder (asks for the folder the first time). */
async function saveToFolderAndroid(localUri: string, name: string, mimeType: string) {
  const writeInto = async (dirUri: string) => {
    const target = new Directory(dirUri).createFile(name, mimeType || "application/octet-stream");
    try {
      new File(localUri).copy(target); // native copy: no file contents in JS memory
    } catch {
      // Some storage providers reject a direct copy into a SAF file: write the bytes instead
      const base64 = await LegacyFS.readAsStringAsync(localUri, { encoding: LegacyFS.EncodingType.Base64 });
      await LegacyFS.writeAsStringAsync(target.uri, base64, { encoding: LegacyFS.EncodingType.Base64 });
    }
  };

  const remembered = await AsyncStorage.getItem(DOWNLOAD_DIR_KEY);
  if (remembered) {
    try {
      await writeInto(remembered);
      return folderLabel(remembered);
    } catch {
      // Permission revoked or folder removed: ask again below
      await AsyncStorage.removeItem(DOWNLOAD_DIR_KEY);
    }
  }

  let picked: Directory;
  try {
    picked = await Directory.pickDirectoryAsync();
  } catch {
    throw new DownloadCancelled();
  }
  if (!picked?.uri) throw new DownloadCancelled();
  await writeInto(picked.uri);
  await AsyncStorage.setItem(DOWNLOAD_DIR_KEY, picked.uri);
  return folderLabel(picked.uri);
}

/**
 * Downloads a chat file to the device.
 * Android: saved into a folder the user picks once (e.g. Download). iOS: share sheet ("Save to Files").
 * Resolves to a short description of where it went.
 */
export async function downloadFile(
  url: string,
  name: string,
  mimeType: string | undefined,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const localUri = await downloadToCache(url, name, onProgress);
  try {
    if (Platform.OS === "android") {
      const folder = await saveToFolderAndroid(localUri, name, mimeType || "application/octet-stream");
      return `Saved to ${folder}`;
    }
    await Share.share({ url: localUri, title: name });
    return "Ready to save";
  } finally {
    if (Platform.OS === "android") await LegacyFS.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
  }
}

import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils";
import { Directory, File, Paths } from "expo-file-system";
import * as LegacyFS from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import { MediaItem, uploadToPresignedUrl } from "./media";

// Chat photos, videos, voice notes and files are locked on the phone before upload (like WhatsApp):
//   1. every file gets its own new random key
//   2. the file is locked with that key, and only the locked copy is uploaded
//   3. the key goes inside the chat message, which is end-to-end encrypted
// So the server stores files it can't open, and never sees the keys.
//
// Locked file = nonce (24 bytes) + XChaCha20-Poly1305 ciphertext.
// Same strength as AES-256, and faster on phones when done in JavaScript.

const NONCE = 24;
const MEDIA_DIR =new Directory(Paths.cache, "media"); // unlocked copies, ready to show

const lock = (data: Uint8Array, key: Uint8Array) => {
  const nonce = randomBytes(NONCE);
  const sealed = xchacha20poly1305(key, nonce).encrypt(data);
  const out = new Uint8Array(NONCE + sealed.length);
  out.set(nonce, 0);
  out.set(sealed, NONCE);
  return out;
};

const unlock = (data: Uint8Array, key: Uint8Array) =>
  xchacha20poly1305(key, data.subarray(0, NONCE)).decrypt(data.subarray(NONCE));

// ── Sending ──

// Locks the file, uploads the locked copy, and returns the key to put in the message
export async function uploadLocked(uploadUrl: string, item: MediaItem, onProgress?: (fraction: number) => void) {
  const key = randomBytes(32);
  const locked = new File(Paths.cache, `upload_${bytesToHex(randomBytes(8))}`);
  locked.write(lock(await new File(item.uri).bytes(), key));
  try {
    await uploadToPresignedUrl(uploadUrl, { ...item, uri: locked.uri }, onProgress);
  } finally {
    locked.delete();
  }
  return bytesToHex(key);
}

// ── Receiving ──

// What a message stores for each file: its link, and its key (older messages have no key)
export type MediaRef = { url?: string; key?: string; name?: string } | string;
const asRef = (r: MediaRef) => (typeof r === "string" ? { url: r } : r ?? {});

// Where the unlocked copy of a file lives: one per link, with the file's extension so players know the type
const unlockedFile = (url: string, name?: string) => {
  const ext = name?.match(/\.[\w]{1,8}$/)?.[0]?.toLowerCase() ?? "";
  return new File(MEDIA_DIR, bytesToHex(sha256(url)).slice(0, 32) + ext);
};

const opening = new Map<string, Promise<string>>(); // two bubbles showing the same file download it once

// Returns a link the app can show: the unlocked copy on the phone, or the plain link for older messages
export function openMedia(ref: MediaRef, onProgress?: (fraction: number) => void): Promise<string> {
  const { url, key, name } = asRef(ref);
  if (!url) return Promise.reject(new Error("No file link"));
  if (!key) return Promise.resolve(url);

  const file = unlockedFile(url, name);
  if (file.exists) return Promise.resolve(file.uri);

  let job = opening.get(file.uri);
  if (!job) {
    job = (async () => {
      if (!MEDIA_DIR.exists) MEDIA_DIR.create({ intermediates: true });
      const download = `${LegacyFS.cacheDirectory}download_${bytesToHex(randomBytes(8))}`;
      try {
        const res = await LegacyFS.createDownloadResumable(url, download, {}, (p) => {
          if (p.totalBytesExpectedToWrite > 0) onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
        }).downloadAsync();
        if (!res || res.status !== 200) throw new Error(`Download failed (${res?.status ?? "no response"})`);
        // Write next to it first, then rename: a half-written file is never mistaken for a finished one
        const part = new File(MEDIA_DIR, `${bytesToHex(randomBytes(8))}.part`);
        part.write(unlock(await new File(download).bytes(), hexToBytes(key)));
        part.move(file);
        return file.uri;
      } finally {
        await LegacyFS.deleteAsync(download, { idempotent: true });
      }
    })();
    opening.set(file.uri, job);
    job.catch(() => undefined).finally(() => opening.delete(file.uri));
  }
  return job;
}

type Opened = { uri: string | null; failed: boolean };

const startState = (ref: MediaRef): Opened => {
  const { url, key, name } = asRef(ref);
  if (!url) return { uri: null, failed: true };
  if (!key) return { uri: url, failed: false };
  const file = unlockedFile(url, name);
  return { uri: file.exists ? file.uri : null, failed: false };
};

// For components: a ready-to-show link for each file (null while it's still downloading)
export function useMediaFiles(refs: MediaRef[]): Opened[] {
  const id = refs.map((r) => { const { url, key } = asRef(r); return `${url}#${key ?? ""}`; }).join("|");
  const [files, setFiles] = useState<Opened[]>(() => refs.map(startState));

  useEffect(() => {
    let alive = true;
    const start = refs.map(startState);
    setFiles(start);
    const set = (i: number, value: Opened) => alive && setFiles((prev) => prev.map((f, j) => (j === i ? value : f)));
    refs.forEach((ref, i) => {
      if (start[i].uri || start[i].failed) return;
      openMedia(ref).then(
        (uri) => set(i, { uri, failed: false }),
        (err) => {
          console.info("couldn't open chat media", err?.message);
          set(i, { uri: null, failed: true });
        },
      );
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return files;
}

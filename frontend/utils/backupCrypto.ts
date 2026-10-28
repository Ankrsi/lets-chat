import { gcm } from "@noble/ciphers/aes";
import { pbkdf2Async } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes } from "@noble/hashes/utils";
import * as SecureStore from "expo-secure-store";

// Chat backups are encrypted on the phone before they go to Google Drive, with a key made
// from a password only the user knows. Google (or anyone with the Drive file) can't read them.
//
// File layout: "LCB1" | salt (16 bytes) | nonce (12 bytes) | AES-256-GCM ciphertext
const MAGIC = new TextEncoder().encode("LCB1");
const ITERATIONS = 200_000;
const PASSWORD_KEY = "backupPassword";

const keyFrom = (password: string, salt: Uint8Array) =>
  pbkdf2Async(sha256, password, salt, { c: ITERATIONS, dkLen: 32 });

export const encryptBackup = async (data: Uint8Array, password: string) => {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const sealed = gcm(await keyFrom(password, salt), nonce).encrypt(data);
  const out = new Uint8Array(MAGIC.length + salt.length + nonce.length + sealed.length);
  out.set(MAGIC, 0);
  out.set(salt, 4);
  out.set(nonce, 20);
  out.set(sealed, 32);
  return out;
};

/** Throws "Wrong backup password" if the password doesn't match. */
export const decryptBackup = async (file: Uint8Array, password: string) => {
  if (!MAGIC.every((b, i) => file[i] === b)) throw new Error("This isn't a chat backup file.");
  const salt = file.subarray(4, 20);
  const nonce = file.subarray(20, 32);
  try {
    return gcm(await keyFrom(password, salt), nonce).decrypt(file.subarray(32));
  } catch {
    throw new Error("Wrong backup password.");
  }
};

// Remembered on this phone (encrypted by the system), so backups don't ask every time
export const savedBackupPassword = () => SecureStore.getItemAsync(PASSWORD_KEY);
export const saveBackupPassword = (password: string) => SecureStore.setItemAsync(PASSWORD_KEY, password);

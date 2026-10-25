// ══════════════════════════════════════════════════════════
// E2EE for chat, built on the `e2e-crypto` library.
//
//  • 1:1    — X3DH handshake + Double Ratchet
//  • Groups — Sender Keys, each member's key distributed over 1:1 sessions
//
// The library (E2EEClient) owns keys, encrypted storage and sessions. This file
// only wires it to this app: the /endToEnd API, the socket, SQLite and the
// message fields (`content` / `replyToMessage` / `newMessage`).
// Messages from peers without a bundle (old app versions) stay plaintext.
// ══════════════════════════════════════════════════════════

import { getConversationById, updateConversationLastMessageText } from '@/db/conversationRepo';
import { getMessageById, updateMessageContent } from '@/db/messageRepo';
import { ApiError, ENCRYPTAPI } from '@/utils/api';
import { getGlobalSocket, setGlobalDbTick } from '@/utils/globalRefs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { E2EEClient, isEnvelope, parseEnvelope, reactNativeStores } from 'e2e-crypto';
import * as SecureStore from 'expo-secure-store';

export { isEnvelope } from 'e2e-crypto';

/** Set to false to send/receive exactly like before e2e-crypto (for debugging). Incoming plaintext always works. */
export const E2EE_ENABLED = true;

/** Message types whose content is end-to-end encrypted. */
const E2E_MESSAGE_TYPES = ['text', 'contact', 'location', 'voice', 'audio', 'image', 'video', 'file'];

const WAITING_TEXT = '🔒 Waiting for this message. This may take a while.';

const parseJSON = (s: string) => { try { return JSON.parse(s); } catch { return s; } };

// A queued group message (or its reply) was decrypted once the sender's key arrived.
type PendingMeta = { conversationId: string; messageId: string; field: 'content' | 'replyToMessage' };

const e2e = new E2EEClient({
  ...reactNativeStores({ SecureStore, AsyncStorage }),
  uploadBundle: (bundle) => ENCRYPTAPI.post('/endToEnd/keys/upload', JSON.parse(bundle)),
  fetchBundle: async (userId) => {
    try {
      const res = await ENCRYPTAPI.get(`/endToEnd/keys/${userId}`);
      const d = res?.data;
      if (d?.v !== 'x3dh1' || !d.identityDHPub) return null;   // no e2e-crypto keys -> plaintext
      // The server hands out a single one-time prekey without saying which of the user's keys it
      // is, and the handshake must name its index, so the handshake runs without it (X3DH with the
      // signed prekey only).
      return {
        v: d.v,
        identitySignPub: d.identitySignPub,
        identityDHPub: d.identityDHPub,
        signedPreKeyPub: d.signedPreKeyPub,
        signedPreKeySig: d.signedPreKeySig,
        oneTimePreKeys: [],
      };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  onPendingDecrypted: async (meta: PendingMeta, plaintext) => {
    const value = parseJSON(plaintext);
    await updateMessageContent(
      meta.conversationId, meta.messageId,
      meta.field === 'content' ? value : null,
      meta.field === 'replyToMessage' ? value : null,
    );
    // The chat list stored the "waiting" placeholder as this conversation's last message.
    if (meta.field === 'content') {
      const row: any = await getMessageById(meta.messageId, meta.conversationId);
      const text = (typeof value === 'object' && value?.msg) || row?.messageType || '';
      await updateConversationLastMessageText(meta.conversationId, text, meta.messageId);
    }
    setGlobalDbTick();
  },
});

// ══════════════════════════════════════════════════════════
// Keys
// ══════════════════════════════════════════════════════════

/** Creates this device's identity on first run and publishes its public bundle. Call after login / on app start. */
export const initKey = () => e2e.init();

/** Re-fetches a peer's bundle (e.g. when opening their chat) so a reinstall is noticed. */
export const refreshPeerBundle = (peerId: string) => e2e.refreshBundle(peerId);

/** Whether this chat already has end-to-end encryption set up. */
export async function hasSecureChat(type: string, id: string): Promise<boolean> {
  if (type === 'group') return e2e.hasGroupKey(id);
  if (type === 'single') return e2e.hasDirectSession(id);
  return false;
}

/** Forces a fresh handshake with this peer on the next message. */
export const resetSession = (peerId: string) => e2e.resetDirect(peerId);

/** Rotate our sender key for a group. Call when members are removed or leave. */
export const rotateGroupKey = (conversationId: string) => e2e.resetGroup(conversationId);

// ══════════════════════════════════════════════════════════
// Outgoing
// ══════════════════════════════════════════════════════════

type Encryptor = (plaintext: string) => Promise<string | null>;

async function encryptorFor(conversationId: string, myId: string): Promise<Encryptor | null> {
  const conv: any = await getConversationById(conversationId);
  if (!conv) return null;
  const others: string[] = JSON.parse(conv.members || '[]').map(String).filter((m: string) => m !== String(myId));
  if (!others.length) return null;

  if (conv.type === 'group') {
    const distribute = (to: string, content: string) => {
      getGlobalSocket()?.emit('chat:send-group-key', { conversationId, to, senderId: myId, content });
    };
    return (plaintext) => e2e.encryptGroup(conversationId, others, plaintext, distribute);
  }
  return (plaintext) => e2e.encryptDirect(others[0], plaintext);
}

/**
 * Encrypts `content` and `replyToMessage` of a message about to be emitted, in place.
 * Save the plaintext copy locally before calling this. Leaves it plaintext if a
 * recipient has no E2EE keys yet.
 */
export async function encryptOutgoingMessage(socketData: any): Promise<void> {
  if (!E2EE_ENABLED || !E2E_MESSAGE_TYPES.includes(socketData.messageType)) return;
  if (__DEV__) console.log('[e2ee] encrypting', socketData.messageId, socketData.messageType, 'conv', socketData.conversationId);
  const encrypt = await encryptorFor(socketData.conversationId, socketData.senderId).catch((err) => {
    console.error('[e2ee] encrypt setup failed', err);
    throw err;
  });
  if (!encrypt) return;

  const content = await encrypt(JSON.stringify(socketData.content));
  if (!content) {
    console.warn(`[e2ee] ${socketData.conversationId}: a recipient has no E2EE keys, sending unencrypted`);
    return;
  }
  socketData.content = content;
  if (socketData.replyToMessage) {
    socketData.replyToMessage = await encrypt(JSON.stringify(socketData.replyToMessage));
  }
  if (__DEV__) console.log('[e2ee] sent', socketData.messageId, describe(content));
}

/** Encrypts `newMessage` of an edit payload in place. */
export async function encryptOutgoingEdit(payload: any): Promise<void> {
  if (!E2EE_ENABLED) return;
  const encrypt = await encryptorFor(payload.conversationId, payload.username);
  if (!encrypt) return;
  const enc = await encrypt(String(payload.newMessage));
  if (enc) payload.newMessage = enc;
}

// ══════════════════════════════════════════════════════════
// Incoming
// ══════════════════════════════════════════════════════════

// Dev log helper: which session/chain a message used, e.g. "1:1 n=3 pn=0 +handshake" or "group kid=… i=7".
const describe = (value: unknown) => {
  const env = parseEnvelope(value);
  if (!env) return 'plaintext';
  return env.e2e === 'sk1' ? `group kid=${env.kid.slice(0, 6)} i=${env.i}` : `1:1 n=${env.h.n} pn=${env.h.pn}${env.hs ? ' +handshake' : ''}`;
};

/**
 * Makes sure the sender's key bundle is saved locally before a 1:1 decrypt: uses the local copy if
 * there is one, otherwise fetches it from the bundle API and saves it. Decrypting doesn't need it
 * (the first message carries the sender's keys), so a failed fetch (e.g. offline) never blocks it.
 */
async function ensureSenderBundle(senderId: string): Promise<void> {
  try {
    await e2e.sessions.getBundle(senderId);
  } catch (err) {
    console.info('[e2ee] sender bundle fetch failed', senderId, err);
  }
}

/** Decrypts one field. Group messages whose sender key hasn't arrived are queued and return null. */
async function decryptField(msg: any, field: PendingMeta['field']): Promise<any | null> {
  const value = msg[field];
  if (parseEnvelope(value)?.e2e === 'sk1') {
    const meta: PendingMeta = { conversationId: msg.conversationId, messageId: msg.messageId, field };
    const r = await e2e.decryptGroupOrQueue(msg.conversationId, String(msg.senderId), value, meta);
    return r.status === 'ok' ? parseJSON(r.plaintext) : null;
  }
  await ensureSenderBundle(String(msg.senderId));
  return parseJSON(await e2e.decryptDirect(String(msg.senderId), value));
}

/**
 * Decrypts `content` / `replyToMessage` of a received message in place.
 * Plaintext messages pass through untouched.
 */
export async function decryptIncomingMessage(msg: any, myId: string): Promise<void> {
  if (String(msg.senderId) === String(myId)) return;
  const contentEncrypted = isEnvelope(msg.content);
  const replyEncrypted = isEnvelope(msg.replyToMessage);
  if (!contentEncrypted && !replyEncrypted) return;

  const encContent = msg.content;
  try {
    if (contentEncrypted) {
      const content = await decryptField(msg, 'content');
      if (content === null) {
        // Sender key still on its way: shown as a placeholder, filled in by onPendingDecrypted.
        if (replyEncrypted) await decryptField(msg, 'replyToMessage');
        msg.content = { msg: WAITING_TEXT };
        msg.replyToMessage = null;
        // A missing persisted sender key queues the message instead of throwing.
        requestResend(msg.conversationId, String(msg.senderId), msg.messageId, myId);
        return;
      }
      msg.content = content;
    }
    if (replyEncrypted) msg.replyToMessage = await decryptField(msg, 'replyToMessage');
    if (__DEV__) console.log('[e2ee] decrypted', msg.messageId, 'from', msg.senderId, describe(encContent));
  } catch (err) {
    // Already delivered (socket + offline sync)? Message keys are single-use, keep what we have.
    const existing: any = await getMessageById(msg.messageId, msg.conversationId);
    if (existing) {
      msg.content = existing.content;
      msg.replyToMessage = existing.replyToMessage;
      return;
    }
    // Usually sent to our previous install (app reinstalled), whose keys are gone:
    // ask the sender to resend it. Shown as "waiting" until it arrives.
    console.info('[e2ee] decrypt failed, requesting resend', msg.messageId, err);
    msg.content = { msg: WAITING_TEXT };
    msg.replyToMessage = null;
    requestResend(msg.conversationId, String(msg.senderId), msg.messageId, myId);
  }
}

/** Decrypts `newMessage` of an edit in place. Returns false if it can't be decrypted (skip the edit). */
export async function decryptIncomingEdit(data: any, myId: string): Promise<boolean> {
  if (String(data.username) === String(myId) || !isEnvelope(data.newMessage)) return true;
  try {
    if (parseEnvelope(data.newMessage)?.e2e === 'sk1') {
      data.newMessage = await e2e.decryptGroup(data.conversationId, String(data.username), data.newMessage);
    } else {
      await ensureSenderBundle(String(data.username));
      data.newMessage = await e2e.decryptDirect(String(data.username), data.newMessage);
    }
    return true;
  } catch (err) {
    console.info('[e2ee] edit decrypt failed', data.messageId, err);
    return false;
  }
}

/** A group member's sender key, delivered over our 1:1 session (`chat:send-group-key`). Also fills in queued messages. */
export async function handleGroupKeyPacket(senderId: string, content: unknown): Promise<void> {
  await ensureSenderBundle(String(senderId));   // the key packet is a 1:1 message
  await e2e.acceptSenderKey(String(senderId), content);
}

// ══════════════════════════════════════════════════════════
// Resend (`chat:resend-request`)
// ══════════════════════════════════════════════════════════
// A message we can't decrypt (sent to our previous install) is requested again from its sender,
// who re-encrypts it for our current keys and answers on the same event.

const requested = new Set<string>();   // ask once per message

function requestResend(conversationId: string, senderId: string, messageId: string, myId: string) {
  if (requested.has(messageId)) return;
  requested.add(messageId);
  getGlobalSocket()?.emit('chat:resend-request', { kind: 'request', to: senderId, senderId: myId, conversationId, messageId });
}

/** Handles `chat:resend-request`: a request for one of our messages, or the resent message we asked for. */
export async function handleResendRequest(p: any, myId: string): Promise<void> {
  if (!p || String(p.to) !== String(myId)) return;
  const peer = String(p.senderId);

  if (p.kind === 'request') {
    // Only our own message, only to a member of that chat.
    const conv: any = await getConversationById(p.conversationId);
    const row: any = await getMessageById(p.messageId, p.conversationId);
    if (!conv || !JSON.parse(conv.members || '[]').map(String).includes(peer)) return;
    if (!row || String(row.senderId) !== String(myId)) return;

    await e2e.refreshBundle(peer).catch(() => null);   // their new keys
    await e2e.resetDirect(peer);                         // fresh session
    let content: string | null;
    if (conv.type === 'group') {
      await e2e.resetGroup(p.conversationId);
      const encrypt = await encryptorFor(p.conversationId, myId);
      if (!encrypt) return;
      content = await encrypt(String(row.content));
    } else {
      content = await e2e.encryptDirect(peer, String(row.content));
    }
    if (!content) return;
    getGlobalSocket()?.emit('chat:resend-request', { kind: 'response', to: peer, senderId: myId, conversationId: p.conversationId, messageId: p.messageId, content });
    return;
  }

  if (p.kind === 'response') {
    const row: any = await getMessageById(p.messageId, p.conversationId);
    if (!row || String(row.senderId) !== peer) return;
    const plaintext = parseEnvelope(p.content)?.e2e === 'sk1'
      ? await e2e.decryptGroup(p.conversationId, peer, p.content)
      : await e2e.decryptDirect(peer, p.content);
    const content = parseJSON(plaintext);
    await updateMessageContent(p.conversationId, p.messageId, content, null);
    await updateConversationLastMessageText(p.conversationId, (typeof content === 'object' && content?.msg) || row.messageType, p.messageId);
    setGlobalDbTick();
  }
}

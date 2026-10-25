import axios from "axios";

// Internal hooks on conversation-service (see its chats.route.ts "internal hooks").
// Both are best effort: auth must not fail because the chat server is down.
const post = (path: string, data: Record<string, unknown>) =>
  axios
    .post(`${process.env.CONVERSATION_SERVICE_BASE_URL}/api/v1/chats/${path}`, { data }, {
      headers: { "x-internal-api-key": process.env.INTERNAL_API_KEY },
      timeout: 5000,
    })
    .catch((err) => console.error(`conversation-service ${path} failed:`, err?.response?.data || err.message));

/**
 * logout=false: warn the signed-in device that someone is trying to log in.
 * logout=true:  every device except `deviceId` signs out.
 */
export const notifyNewLogin = (phone: string, logout: boolean, deviceId: string, appCode: string) =>
  post("notifyNewLogin", { phone, logout, deviceId, app_code: appCode });

/** Tells this user's contacts to refetch their profile (name, photo, username). */
export const notifyProfileChanged = (phone: string) => post("contactsRefrash", { phone });

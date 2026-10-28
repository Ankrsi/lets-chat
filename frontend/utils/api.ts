import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from "@/utils/tokens";
import { router } from "expo-router";

const BASE_URLS: any = {
  // auth: "http://192.168.1.5:4008/api/v1",
  auth: "https://lets-chat-auth.onrender.com/api/v1",
  // chat: "http://192.168.1.5:4021/api/v1",
  chat: "https://lets-chat-conversation.up.railway.app/api/v1",
  // encrypt: "http://192.168.1.5:4025/api/v1",
  encrypt: "https://lets-chat-e2e.onrender.com/api/v1",
};

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

// User-facing text for a failed request: the server's message when there is one
export const apiErrorMessage = (err: any, fallback = "Something went wrong. Try again.") =>
  err?.data?.message || (err instanceof ApiError ? fallback : err?.message) || fallback;

// Ends the local session when the refresh token is no longer accepted
const clearSession = async () => {
  await clearTokens();
  if (router.canDismiss()) router.dismissAll(); // nothing to dismiss when already at the first screen
  router.replace("/screens/login");
};

// Helper for response parsing and error handling
const handleResponse = async (response: any) => {
  const contentType = response.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    console.info(response.url, response.status, data);
    throw new ApiError(`${response.status}, ${JSON.stringify(data)}` || data?.message || response.statusText || "Request failed", response.status, data);
  }

  return data;
};

// Each refresh token works once, so requests that hit 401 together share one refresh.
// Resolves to the new access token, or null if the server rejected the refresh token.
// Network errors are thrown instead, so being offline doesn't sign the user out.
let refreshing: Promise<string | null> | null = null;

const refreshAccessToken = () => {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return null;
      const resp = await fetch(`${BASE_URLS.auth}/auth/get-new-access-token`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken })
      });
      if (resp.status === 401) return null; // revoked (logout, login on another device) or expired
      if (!resp.ok) throw new ApiError("Could not refresh session", resp.status);
      const respJson = await resp.json();
      await saveTokens(respJson.data.accessToken, respJson.data.refreshToken);
      return respJson.data.accessToken as string;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
};

// Main fetch client factory
const createFetchClient = (type = "auth") => {
  const baseURL = BASE_URLS[type];

  const request = async (endpoint: any, method: any, body: any, customHeaders = {}) => {
    const token = await getAccessToken();

    let headers: any = {};

    if (body instanceof FormData) {
      const safeHeaders: Record<string, string> = { ...customHeaders };
      delete safeHeaders["Content-Type"];
      headers = safeHeaders;
    } else if (Object.keys(customHeaders).length > 0) {
      headers = { ...customHeaders };
    } else {
      headers = { "Content-Type": "application/json" };
    }

    if (token) headers.Authorization = `Bearer ${token}`;
    headers["x-lang"] = `en`;

    const options: any = {
      method,
      headers,
    };

    if (body && method !== "GET") {
      options.body = body instanceof FormData ? body : JSON.stringify(body);
    }

    let response = await fetch(`${baseURL}${endpoint}`, options);
    // A 401 with a token means it expired: refresh once and retry. Without a token, it's a real 401.
    if (response.status == 401 && token) {
      const accessToken = await refreshAccessToken();
      if (!accessToken) {
        await clearSession();
        throw new ApiError("Session expired", 401);
      }
      headers.Authorization = `Bearer ${accessToken}`;
      response = await fetch(`${baseURL}${endpoint}`, options);
    }
    return handleResponse(response);
  };

  // mimic axios methods
  return {
    get: (endpoint: string, headers?: Record<string, string>) =>
      request(endpoint, "GET", undefined, headers),

    post: (endpoint: string, body?: any, headers?: Record<string, string>) =>
      request(endpoint, "POST", body, headers),

    put: (endpoint: string, body?: any, headers?: Record<string, string>) =>
      request(endpoint, "PUT", body, headers),

    patch: (endpoint: string, body?: any, headers?: Record<string, string>) =>
      request(endpoint, "PATCH", body, headers),

    delete: (endpoint: string, body?: any, headers?: Record<string, string>) =>
      request(endpoint, "DELETE", body, headers),
  };
};

// Create instances
export const AuthAPI = createFetchClient("auth");
export const CHATAPI = createFetchClient("chat");
export const ENCRYPTAPI = createFetchClient("encrypt");

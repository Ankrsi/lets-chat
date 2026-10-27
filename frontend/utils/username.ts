import { useEffect, useState } from "react";
import { AuthAPI } from "@/utils/api";

// Same rules as auth-service (src/utils/username.ts); the server stays the source of truth.
const USERNAME_PATTERN = /^(?=.{3,20}$)[a-z0-9](?:[a-z0-9]|[._](?![._]))*[a-z0-9]$/;

export const normalizeUsername = (input: string) => input.trim().toLowerCase().replace(/^@/, "");

export const usernameFormatError = (username: string): string | null => {
  if (username.length < 3) return "At least 3 characters";
  if (username.length > 20) return "At most 20 characters";
  if (!USERNAME_PATTERN.test(username))
    return "Use letters, numbers, '.' or '_' — start and end with a letter or number";
  return null;
};

export type UsernameStatus =
  | { state: "idle" }
  | { state: "invalid"; message: string }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken" }
  | { state: "error"; message: string };

export function useUsernameStatus(input: string, current?: string | null): UsernameStatus {
  const [status, setStatus] = useState<UsernameStatus>({ state: "idle" });

  useEffect(() => {
    const username = normalizeUsername(input);
    if (!username || username === current) {
      setStatus({ state: "idle" });
      return;
    }
    const formatError = usernameFormatError(username);
    if (formatError) {
      setStatus({ state: "invalid", message: formatError });
      return;
    }

    setStatus({ state: "checking" });
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await AuthAPI.get(`/auth/username-available?username=${encodeURIComponent(username)}`);
        if (!cancelled) setStatus({ state: res.data.available ? "available" : "taken" });
      } catch (err: any) {
        // The server may reject names the local check allows (e.g. reserved words)
        if (!cancelled) setStatus({ state: "error", message: err?.data?.message || "Couldn't check username" });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input, current]);

  return status;
}

export const usernameStatusText = (status: UsernameStatus): { text: string; ok: boolean } | null => {
  switch (status.state) {
    case "invalid":
    case "error":
      return { text: status.message, ok: false };
    case "checking":
      return { text: "Checking…", ok: true };
    case "available":
      return { text: "✓ Available", ok: true };
    case "taken":
      return { text: "✗ Already taken", ok: false };
    default:
      return null;
  }
};

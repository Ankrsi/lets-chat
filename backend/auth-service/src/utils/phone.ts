import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Normalizes a phone number with country code ("+91 98765 43210", "919876543210")
 * to E.164 digits without "+", the format every chat service keys users by.
 * Returns null when the number is not a valid phone number.
 */
export const normalizePhone = (input: unknown): string | null => {
  if (input === undefined || input === null) return null;
  const raw = String(input).replace(/[\s()-]/g, "");
  const parsed = parsePhoneNumberFromString(raw.startsWith("+") ? raw : `+${raw}`);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number.slice(1);
};

export const toE164 = (phone: string) => `+${phone}`;

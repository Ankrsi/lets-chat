import { parsePhoneNumberFromString } from "libphonenumber-js";

export const normalizePhone = (input: unknown): string | null => {
  if (input === undefined || input === null) return null;
  const raw = String(input).replace(/[\s()-]/g, "");
  const parsed = parsePhoneNumberFromString(raw.startsWith("+") ? raw : `+${raw}`);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number.slice(1);
};

export const toE164 = (phone: string) => `+${phone}`;

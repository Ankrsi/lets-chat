import { Response, Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { CountryCode } from "libphonenumber-js/max";
import parsePhoneNumberFromString, { getCountries, getCountryCallingCode } from "libphonenumber-js";
import { getUsersByPhones } from "../../services/auth/phone.service";
import { TOPICS } from "../../kafka/kafkaClient";

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export const setUsersByPhones = asyncHandler(async (req: Request, res: Response) => {
  const phonesWithNames: { phone: string; name: string }[] = req.body.phonesWithNames;
  if (!Array.isArray(phonesWithNames) || phonesWithNames.length === 0) {
    return new ApiResponse(400, [], "Phone numbers not found or invalid format");
  }

  const currentUserPhone = req.user?.phone;
  if (!currentUserPhone) {
    return new ApiResponse(400, [], "User phone number not found");
  }

  const defaultCountry = getCountryOfPhone("+" + currentUserPhone.toString());
  if (!defaultCountry) {
    return new ApiResponse(400, [], "Unable to detect country from user phone");
  }

  const priorityCountries: CountryCode[] = [defaultCountry, defaultCountry == "IN" ? "GN" : "IN"];
  const allCountries = getCountries().filter(c => !priorityCountries.includes(c));
  const orderedCountries = [...priorityCountries, ...allCountries];

  const normalizedContacts = phonesWithNames
    .map(({ phone, name }) => {
      const phoneCountry = getCountryOfPhone(phone, defaultCountry, orderedCountries);
      const normalized = normalizePhoneToDbFormat(phone, phoneCountry || defaultCountry);
      return normalized ? { phone: normalized, name } : null;
    })
    .filter(Boolean) as { phone: string; name: string }[];

  if (normalizedContacts.length === 0) {
    return new ApiResponse(400, [], "No valid phone numbers after normalization");
  }

  const phoneNumbers = normalizedContacts?.map((entry) => Number(entry.phone));
  const users = await getUsersByPhones(phoneNumbers);

  const userMap = new Map(users.map((user: any) => [String(user.phone), user]));

  const response = normalizedContacts?.map(({ phone, name }) => {
    const user: any = userMap.get(phone);
    return {
      name,
      phone, // plain phone
      userId: user ? String(user._id) : null,
      full_name: user ? `${user.first_name} ${user.last_name}` : null,
      profile_image: user?.profile_image || null,
      email: user?.email || null,
      isOnboarded: !!user,
    };
  });

  // Save the contacts who use the app (the consumer merges them into the user's friend list).
  // Keyed by the user's phone so their chunks stay in order on one partition and can't
  // overwrite each other.
  const producer = req.app.get("producer");
  const friends = response.filter((c) => c.isOnboarded).map(({ name, phone }) => ({ name, phone }));
  const CHUNK_SIZE = 500;
  if (friends.length) {
    await producer?.send({
      topic: TOPICS.contacts,
      messages: chunkArray(friends, CHUNK_SIZE).map((contacts) => ({
        key: currentUserPhone.toString(),
        value: JSON.stringify({ userId: String(req.user?._id), phone: currentUserPhone.toString(), contacts }),
      })),
    });
  }

  return new ApiResponse(200, response, "Users fetched successfully");
});

function getCountryOfPhone(phone: string, defaultCountry?: CountryCode, countriesCode?: any): CountryCode | null {
  try {

    const cleaned = phone.trim();
    let parsed = null;

    if (cleaned.startsWith("+")) {
      parsed = parsePhoneNumberFromString(cleaned);
    } else {
      for (const country of countriesCode) {
        const callingCode = getCountryCallingCode(country);
        const attempt = parsePhoneNumberFromString("+" + callingCode + cleaned);
        if (attempt?.isValid()) {
          parsed = attempt;
          break;
        }
      }
    }

    return parsed?.country || null;
  } catch (err) {
    console.error(`Error parsing country from phone: | ${(err as Error).message}`, phone);
    return null;
  }
}

function normalizePhoneToDbFormat(rawPhone: string, defaultCountry: CountryCode): string | null {
  try {
    const cleaned = rawPhone.trim();

    let parsed = cleaned.startsWith("+")
      ? parsePhoneNumberFromString(cleaned)
      : parsePhoneNumberFromString("+" + cleaned);

    if (!parsed || !parsed.isValid()) {
      parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
    }

    return parsed && parsed.isValid() ? parsed.number.replace("+", "") : null;
  } catch (err) {
    console.error(`Error normalizing phone: | ${(err as Error).message}`, rawPhone);
    return null;
  }
}


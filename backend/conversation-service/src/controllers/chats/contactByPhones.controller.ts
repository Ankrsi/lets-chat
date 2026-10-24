import { t } from "../../../i18n";
import { Response, Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { CountryCode } from "libphonenumber-js/max";
// import parsePhoneNumberFromString, { getCountries, getCountryCallingCode } from "libphonenumber-js";
import parsePhoneNumberFromString, { getCountries, getCountryCallingCode } from "libphonenumber-js";
import AllContact from "../../models/contactModal/allContact.model";
import AllFriendsContact from "../../models/contactModal/allFriendsContact.model";
import { getUsersByPhones } from "../../services/auth/phone.service";
import { getWalletsByUserId } from "../../services/getWallet.service";
import { redisClient } from "../../redis/redisClient";
// import { CompressionTypes } from "kafkajs";

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
    return new ApiResponse(400, [], t("PHONE_NUMBERS_NOT_FOUND_OR_INVALID_FORMAT", req.language || "en") as string);
  }

  const currentUserPhone = req.user?.phone;
  if (!currentUserPhone) {
    return new ApiResponse(400, [], t("USER_PHONE_NUMBER_NOT_FOUND", req.language || "en") as string);
  }

  const defaultCountry = getCountryOfPhone("+" + currentUserPhone.toString());
  if (!defaultCountry) {
    return new ApiResponse(400, [], t("UNABLE_TO_DETECT_COUNTRY_FROM_USER_PHONE", req.language || "en") as string);
  }

  const priorityCountries: CountryCode[] = [defaultCountry, defaultCountry == "IN" ? "GN" : "IN"];
  const allCountries = getCountries().filter(c => !priorityCountries.includes(c));
  const orderedCountries = [...priorityCountries, ...allCountries];

  const normalizedContacts = phonesWithNames
    .map(({ phone, name }) => {
      // const phoneCountry = getCountryOfPhone(phone, defaultCountry);
      const phoneCountry = getCountryOfPhone(phone, defaultCountry, orderedCountries);
      const normalized = normalizePhoneToDbFormat(phone, phoneCountry || defaultCountry);
      return normalized ? { phone: normalized, name } : null;
    })
    .filter(Boolean) as { phone: string; name: string }[];

  if (normalizedContacts.length === 0) {
    return new ApiResponse(400, [], t("NO_VALID_PHONE_NUMBERS_AFTER_NORMALIZATION", req.language || "en") as string);
  }

  const phoneNumbers = normalizedContacts?.map((entry) => Number(entry.phone));
  const users = await getUsersByPhones(phoneNumbers);

  const userMap = new Map(users.map((user: any) => [String(user.phone), user]));

  const response = await Promise.all(
    normalizedContacts?.map(async ({ phone, name }) => {
      const user: any = userMap.get(phone);

      let wallets: Record<string, string | null> = {};
      if (user?._id) {
        const result = await getWalletsByUserId(String(user._id));

        // Transform to walletId key
        if (result && typeof result === "object") {
          const walletValue = Object.values(result)[0] ?? null;
          wallets = { walletId: walletValue };
        }
      }

      return {
        name,
        phone, // plain phone
        userId: user ? String(user._id) : null,
        full_name: user ? `${user.first_name} ${user.last_name}` : null,
        profile_image: user?.profile_image || null,
        email: user?.email || null,
        isOnboarded: !!user,
        wallets,
        identity_verification_status: user?.identity_verification_status || null
      };
    }),
  );

  const producer = req.app.get("producer");

  const CHUNK_SIZE = 500;
  // const chunks = chunkArray(normalizedContacts, CHUNK_SIZE);

  // for (const contacts of chunks) {
  //   await producer?.send({
  //     topic: 'contacts-save-db',
  //     compression: CompressionTypes.GZIP,
  //     messages: [
  //       {
  //         value: JSON.stringify({
  //           userId: String(req.user?._id),
  //           phone: currentUserPhone.toString(),
  //           contacts: contacts
  //         })
  //       },
  //     ],
  //   })
  // }

  const friendChunks = chunkArray(response, CHUNK_SIZE);

  await Promise.all(
    friendChunks.map((contacts) =>
      producer?.send({
        topic: 'friends-contacts-save-db',
        // compression: CompressionTypes.GZIP,
        messages: [
          {
            value: JSON.stringify({
              userId: String(req.user?._id),
              phone: currentUserPhone.toString(),
              contacts: contacts
            })
          },
        ],
      })
    )
  )

  return new ApiResponse(200, response, t("USERS_FETCHED_SUCCESSFULLY", req.language || "en") as string);
});

export const getContacts = asyncHandler(async (req: Request, res: Response) => {
  const currentUserPhone = req.user?.phone || req.params.no;
  if (!currentUserPhone) {
    return new ApiResponse(400, [], t("USER_PHONE_NUMBER_NOT_FOUND", req.language || "en") as string);
  }

  const allContacts = await AllContact.findOne({ phone: currentUserPhone.toString() }).select('contacts -_id').lean();
  if (!allContacts) {
    return new ApiResponse(200, [], t("NO_CONTACTS_FOUND", req.language || "en") as string);
  }
  return new ApiResponse(200, allContacts, t("CONTACTS_FETCHED_SUCCESSFULLY", req.language || "en") as string);
});

export const getFriendsContacts = asyncHandler(async (req: Request, res: Response) => {
  const currentUserPhone = req.user?.phone || req.params.no;
  if (!currentUserPhone) {
    return new ApiResponse(400, [], t("USER_PHONE_NUMBER_NOT_FOUND", req.language || "en") as string);
  }

  const allFriendsContacts = await AllFriendsContact.findOne({ phone: currentUserPhone.toString() }).select('contacts -_id').lean();
  if (!allFriendsContacts) {
    return new ApiResponse(200, [], t("NO_CONTACTS_FOUND", req.language || "en") as string);
  }
  return new ApiResponse(200, allFriendsContacts, t("CONTACTS_FETCHED_SUCCESSFULLY", req.language || "en") as string);
});

function getCountryOfPhone(phone: string, defaultCountry?: CountryCode, countriesCode?: any): CountryCode | null {
  try {
    console.info("Please dont keep unused variable", countriesCode)

    const cleaned = phone.trim();
    let parsed = null;

    if (cleaned.startsWith("+")) {
      parsed = parsePhoneNumberFromString(cleaned);
    } else {
      // parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
      // if (parsed?.countryCallingCode == null) {
      for (const country of countriesCode) {
        const callingCode = getCountryCallingCode(country);
        const attempt = parsePhoneNumberFromString("+" + callingCode + cleaned);
        if (attempt?.isValid()) {
          parsed = attempt;
          break;
        }
      }
      // }
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

    // let parsed;
    // if (cleaned.startsWith("+")) {
    //   parsed = parsePhoneNumberFromString(cleaned);
    // } else {
    //   parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
    //   if (!parsed || !parsed.isValid()) {
    //     parsed = parsePhoneNumberFromString("+" + cleaned);
    //   }
    // }

    return parsed && parsed.isValid() ? parsed.number.replace("+", "") : null;
  } catch (err) {
    console.error(`Error normalizing phone: | ${(err as Error).message}`, rawPhone);
    return null;
  }
}

// function chunkArray(arr: { phone: string; name: string }[], size: number): { phone: string; name: string }[][] {
//   return arr.reduce<{ phone: string; name: string }[][]>((acc, _, i) =>
//     i % size ? acc : [...acc, arr.slice(i, i + size)], []
//   );
// }

export const blockContactByWallet = asyncHandler(async (req: Request, res: Response) => {
  const { userPhone, otherPhone, type } = req.body;
  if (!userPhone || !otherPhone || !type) {
    return new ApiResponse(400, [], t("USER_OR_OTHER_PHONE_NUMBER_NOT_FOUND", req.language || "en") as string);
  }

  const update: any =
    type === "block"
      ? { $addToSet: { blockedPhones: otherPhone } }
      : { $pull: { blockedPhones: otherPhone } };

  const blocked = await AllFriendsContact.findOneAndUpdate(
    { phone: userPhone },
    update,
    { new: true }
  ).select("-_id blockedPhones")
  if (!blocked?.blockedPhones) { return new ApiResponse(200, [], t("NO_CONTACTS_FOUND", req.language || "en") as string); }

  if (blocked.blockedPhones?.length > 0) {
    await redisClient.del(`blocked:phones:${userPhone}`);
    await redisClient.sAdd(`blocked:phones:${userPhone}`, (blocked?.blockedPhones || [])?.map(String));
  }
  else {
    await redisClient.del(`blocked:phones:${req.user?.phone}`);
  }

  return new ApiResponse(200, null, t("CONTACTS_UPDATE_SUCCESSFULLY", req.language || "en") as string);
});

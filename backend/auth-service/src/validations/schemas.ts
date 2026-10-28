import Joi from "joi";
import { normalizePhone } from "../utils/phone";
import { normalizeUsername, usernameProblem } from "../utils/username";

// Accepts "+91 98765 43210" / 919876543210 and converts to "919876543210"
const phone = () =>
  Joi.alternatives(Joi.string(), Joi.number()).custom((value, helpers) => {
    const normalized = normalizePhone(value);
    return normalized ?? helpers.message({ custom: "Enter a valid phone number with country code" });
  });

const username = () =>
  Joi.string().custom((value: string, helpers) => {
    const normalized = normalizeUsername(value);
    const problem = usernameProblem(normalized);
    return problem ? helpers.message({ custom: problem }) : normalized;
  });

const name = () => Joi.string().trim().max(50);

const pin = () => Joi.string().pattern(/^\d{6}$/).messages({ "string.pattern.base": "Code must be 6 digits" });

export const setTwoStepSchema = Joi.object({ pin: pin().required(), currentPin: pin() });
export const disableTwoStepSchema = Joi.object({ pin: pin().required() });

export const generateOtpSchema = Joi.object({ phone: phone().required() });

export const verifyOtpSchema = Joi.object({
  phone: phone().required(),
  otp: Joi.string().pattern(/^\d{6}$/).required().messages({ "string.pattern.base": "OTP must be 6 digits" }),
  deviceId: Joi.string().trim().max(200).required(),
  fcm_token: Joi.string().max(4096),
  voip_token: Joi.string().max(4096),
  device_type: Joi.string().valid("android", "ios", "web").default("android"),
  appName: Joi.string().max(50).default("SP_MAIN"),
  forceLogin: Joi.boolean().default(false),
  pin: pin(),
  forgotPin: Joi.boolean().default(false),
});

export const registerSchema = Joi.object({
  username: username().required(),
  first_name: name().min(1).required(),
  last_name: name().allow("").default(""),
});

export const usernameQuerySchema = Joi.object({ username: username().required() });

export const refreshSchema = Joi.object({ refreshToken: Joi.string().required() });

export const updateProfileSchema = Joi.object({
  first_name: name().min(1),
  last_name: name().allow(""),
  about: Joi.string().trim().max(140).allow(""),
  email: Joi.string().trim().email().max(254).allow(null, ""),
  photoVisibility: Joi.string().valid("everyone", "nobody"),
}).min(1);

export const changeUsernameSchema = Joi.object({ username: username().required() });

export const deviceTokensSchema = Joi.object({
  fcm_token: Joi.string().max(4096).allow(null),
  voip_token: Joi.string().max(4096).allow(null),
}).min(1);

// Other services send phones exactly as they store them, so only reduce to digits here
// instead of re-validating against libphonenumber.
const storedPhone = () =>
  Joi.alternatives(Joi.string(), Joi.number()).custom((value, helpers) => {
    const digits = String(value).replace(/\D/g, "");
    return /^\d{6,15}$/.test(digits) ? digits : helpers.message({ custom: "Invalid phone" });
  });

export const phonesSchema = Joi.object({
  phones: Joi.array().items(Joi.alternatives(Joi.string(), Joi.number())).max(5000).required(),
  role: Joi.string(),
});

export const phoneSchema = Joi.object({ phone: storedPhone().required(), role: Joi.string() });

export const removePushTokenSchema = Joi.object({ phone: storedPhone().required(), token: Joi.string().required() });

export const blockSchema = Joi.object({ userPhone: storedPhone().required(), contactNo: storedPhone().required() });

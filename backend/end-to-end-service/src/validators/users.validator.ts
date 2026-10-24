import { body } from "express-validator";

export const userRegistrationValidator = [
  body("full_name").notEmpty().withMessage("Full name is required"),
  body("email").optional().isEmail().withMessage("Invalid email address"),
  body("phone")
    .notEmpty()
    .isMobilePhone("any") // <- Fixed: added 'any' locale
    .withMessage("Invalid phone number"),
  body("role")
    .notEmpty()
    .isIn(["individual", "merchant", "agent", "subagent"])
    .withMessage("Invalid role"),
  body("passcode")
    .notEmpty()
    .isNumeric()
    .isLength({ min: 4, max: 6 })
    .withMessage("Passcode must be 4–6 digit number"),

  // body("country").notEmpty().withMessage("Country code is required"),
  body().custom((value, { req }) => {
    if (!req.body.email && !req.body.phone) {
      throw new Error("Either email or phone is required");
    }
    return true;
  }),
];

export const personalInfoValidator = [
  body("first_name").notEmpty().withMessage("First name is required"),
  body("last_name").notEmpty().withMessage("Last name is required"),
  body("email").optional().isEmail().withMessage("Invalid email address"),
  body("phone")
    .optional()
    .isMobilePhone("any")
    .withMessage("Invalid phone number"),
  body("passcode")
    .notEmpty()
    .isNumeric()
    .isLength({ min: 4, max: 6 })
    .withMessage("Passcode must be 4–6 digit number"),
  body("role")
    .optional()
    .isIn(["individual", "merchant", "agent", "subagent"])
    .withMessage("Invalid role"),
  body("date_of_birth")
    .optional()
    .isISO8601()
    .withMessage("Invalid date format"),
  body().custom((value, { req }) => {
    if (!req.body.email && !req.body.phone) {
      throw new Error("Either email or phone is required");
    }
    return true;
  }),
];

import Joi from "joi";

export const statusPrivacySchema = Joi.object({
  phoneNumbers: Joi.array()
    .items(
      Joi.string()
        .pattern(/^[0-9]{7,15}$/)
        .messages({
          "string.pattern.base": "Phone number must be 10-15 digits",
        })
    )
    .when("type", {
      is: Joi.string().valid("my_contacts"),
      then: Joi.optional(),
      otherwise: Joi.required(),
    })
    .messages({
      "array.base": "phoneNumbers must be an array",
    }),
  type: Joi.string()
    .valid("my_contacts_except", "only_share_with", "my_contacts")
    .required()
    .messages({
      "any.required": "Privacy type is required",
      "any.only": "Type must be one of: my_contacts_except, only_share_with, my_contacts",
    }),
});
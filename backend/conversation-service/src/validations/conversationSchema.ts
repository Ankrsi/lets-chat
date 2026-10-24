import Joi from "joi";

export const conversationSchema = Joi.object({
  type: Joi.string().valid("single", "group").default("single"),

  memberIds: Joi.array()
    .items(
      Joi.string()
        .pattern(/^[0-9]{7,15}$/)
        .required()
    )
    .min(1)
    .required(),

  name: Joi.when("type", {
    is: "group",
    then: Joi.string().min(2).max(50).required(),
    otherwise: Joi.forbidden(),
  }),

  avatar: Joi.string().uri().optional(),

}).custom((value, helpers) => {
  if (value.type === "single") {
    const uniqueMembers = [...new Set(value.memberIds)];
    if (uniqueMembers.length > 2) {
      return helpers.error("any.invalid");
    }
  }
  return value;
}, "Custom Validation");
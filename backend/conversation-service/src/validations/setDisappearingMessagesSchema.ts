import Joi from "joi";

export const setDisappearingMessagesSchema = Joi.object({
  conversationId: Joi.string()
    .required()
    .messages({
      "any.required": "Conversation ID is required",
      "string.empty": "Conversation ID cannot be empty",
    }),
  duration: Joi.string()
    .valid("0s", "24h", "7d", "90d")
    .required()
    .messages({
      "any.required": "Duration is required",
      "any.only": "Duration must be one of: 0s (off), 24h (24 hours), 7d (7 days), 90d (90 days)",
    }),
  timestamp: Joi.string().isoDate().required()
})
import Joi from "joi";

export const unblockUserSchema = Joi.object({
    no: Joi.string()
        .pattern(/^[0-9]{7,15}$/)
        .required()
        .messages({
            "any.required": "Phone number is required",
            "string.pattern.base": "Phone number must be 10-15 digits",
            "string.empty": "Phone number cannot be empty",
        }),
    conversationId: Joi.string()
        .required()
        .messages({
            "any.required": "Conversation ID is required",
            "string.empty": "Conversation ID cannot be empty",
        }),
});
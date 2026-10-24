import Joi from "joi";

export const setDestructingMessagesSchema = Joi.object({
    conversationId: Joi.string()
        .required()
        .messages({
            "any.required": "Conversation ID is required",
            "string.empty": "Conversation ID cannot be empty",
        }),
    duration: Joi.string()
        .valid("0s", "5m", "10m", "15m", "30m", "1h", "2h")
        .required()
        .messages({
            "any.required": "Duration is required",
            "any.only": "Duration must be one of: 0s (off), 5m (5 min), 10m (10 min), 15m (15 min), 30m (30 min), 1h (1 hrs), 2h (2 hrs)",
        }),
    timestamp: Joi.string().isoDate().required()
});

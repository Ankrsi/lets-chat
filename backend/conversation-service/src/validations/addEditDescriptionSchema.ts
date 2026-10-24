import Joi from "joi";

export const addEditDescriptionSchema = Joi.object({
    conversationId: Joi.string().required(),
    desc: Joi.string().required(),
});
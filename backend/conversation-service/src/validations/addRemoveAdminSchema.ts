import Joi from "joi";

export const addRemoveAdminSchema = Joi.object({
    conversationId: Joi.string().required(),
    member: Joi.string().pattern(/^[0-9]{7,15}$/).required(),
    add: Joi.boolean().required(),
});
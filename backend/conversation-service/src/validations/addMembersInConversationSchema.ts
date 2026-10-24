import Joi from "joi";

export const addMembersInConversationSchema = Joi.object({
    conversationId: Joi.string().required(),
    members: Joi.array()
        .items(Joi.string().pattern(/^[0-9]{7,15}$/))
        .min(1)
        .required()
});
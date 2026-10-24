import Joi from "joi";

export const removeMembersInConversationSchema = Joi.object({
    conversationId: Joi.string().required(),
    member: Joi.string().required(),
});
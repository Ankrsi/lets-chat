import Joi from "joi";

export const taxiConversationSchema = Joi.object({
  memberIds: Joi.array()
    .items(
      Joi.string()
        .pattern(/^[0-9]{7,15}$/)
        .required()
    )
    .min(1)
    .required(),

  bookingId: Joi.string().required(),

})
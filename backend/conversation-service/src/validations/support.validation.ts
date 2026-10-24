import Joi from 'joi';

/**
 * Support Ticket Validations
 */

export const validateCreateTicket = (data: any) => {
  const schema = Joi.object({
    category_type: Joi.string()
      // .valid("RIDE", "TRANSACTION", "WALLET", "FOOD_ORDER", "ECOMMERCE_ORDER", "KYC", "ACCOUNT", "GENERAL", "CONVERSATION")
      .required()
      .messages({
        'string.empty': 'Category type is required',
        'any.required': 'Category type is required',
        'any.only': 'Invalid category type',
      }),
    // category_id: Joi.string().optional(),
    subject: Joi.string().max(500).required().messages({
      'string.empty': 'Subject is required',
      'any.required': 'Subject is required',
      'string.max': 'Subject cannot exceed 500 characters',
    }),
    description: Joi.string().max(5000).required().messages({
      'string.empty': 'Description is required',
      'any.required': 'Description is required',
      'string.max': 'Description cannot exceed 5000 characters',
    }),
    // priority: Joi.string()
    //   .valid('LOW', 'MEDIUM', 'HIGH', 'URGENT')
    //   .optional()
    //   .default('MEDIUM'),
    image: Joi.string().uri().optional(),
  });

  return schema.validate(data, { abortEarly: false });
};

export const validateAddMessage = (data: any) => {
  const schema = Joi.object({
    message: Joi.string().max(10000).required().messages({
      'string.empty': 'Message cannot be empty',
      'any.required': 'Message is required',
      'string.max': 'Message cannot exceed 10000 characters',
    }),
    is_private: Joi.boolean().optional().default(false),
  });

  return schema.validate(data, { abortEarly: false });
};

import { t } from "../../../i18n";
import { Response, Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { validateCreateTicket } from "../../validations/support.validation";
import { createTicketService } from "../../services/support/createTicket.service";
import { uploadToS3 } from "../../utils/s3Upload";
import { getAllTicketsService } from "../../services/support/getAllTickets.service";
import { getTicketChatHistoryService } from "../../services/support/getChatTicketHistory.service";

// POST /api/support/tickets
export const createTicket = asyncHandler(async (req: Request, res: Response) => {

  if (!req.user) {
    return new ApiResponse(401, null, t("UNAUTHORIZED", req.language || "en") as string);
  }

  const { error, value } = validateCreateTicket(req.body);
  if (error) {
    return new ApiResponse(
      400,
      error.details.map((e: any) => e.message),
      t("VALIDATION_ERROR", req.language || "en") as string,
    );
  }

  if (req.file) {
    const file = req.file;
    const uploadedUrl = await uploadToS3({
      file,
      folder: `support-tickets/${req.user._id}`,
    });
    req.body.image = uploadedUrl;
  }

  const ticket = await createTicketService({
    user_id: req.user._id,
    phone_number: req.user.phone_number,
    category_type: value.category_type,
    // category_id: value.category_id,
    subject: value.subject,
    description: value.description,
    // priority: value.priority || "MEDIUM",
    image: req.body.image,
    created_by: "USER",
  });

  if(ticket?.statusCode && ticket?.statusCode != 201){
    return new ApiResponse(ticket.statusCode, ticket.message || ticket.data, t("TICKET_NOT_CREATED", req.language || "en") as string);
  }

  return new ApiResponse(201, ticket, t("TICKET_CREATED", req.language || "en") as string);
  // } catch {
  //   return new ApiResponse(500, null, t("SERVER_ERROR", req.language || "en") as string);
  // }
});

// GET /api/support/tickets
export const getAllTickets = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user._id as string;
  if (!userId) return new ApiResponse(401, null, t("USER_NOT_FOUND", req.language || "en") as string);
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = parseInt(req.query.skip as string) || 0;

    const { tickets, total } = await getAllTicketsService({ userId, limit, skip });

    return new ApiResponse(
      200,
      { tickets, pagination: { total, limit, skip } },
      t("TICKETS_FETCHED", req.language || "en") as string,
    );
  } catch {
    return new ApiResponse(500, null, t("SERVER_ERROR", req.language || "en") as string);
  }
});

// GET /api/support/tickets/chats/:ticketId
export const getChatHistory = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user._id as string;
  if (!userId) return new ApiResponse(401, null, t("USER_NOT_FOUND", req.language || "en") as string);
  const ticketId = req.params.ticketId;
  if (!ticketId) return new ApiResponse(400, null, t("TICKET_ID_REQUIRED", req.language || "en") as string);

  try {
    const chatHistory = await getTicketChatHistoryService({ ticketId });
    return new ApiResponse(200, chatHistory, t("CHAT_HISTORY_FETCHED", req.language || "en") as string);

  } catch {
    return new ApiResponse(500, null, t("SERVER_ERROR", req.language || "en") as string);
  }
});

// update status socket to  user
export const updateTicketStatusSocket = asyncHandler(async (req: Request, res: Response) => {
  const { ticketId, status } = req.body;
  if (!ticketId) return new ApiResponse(401, null, t("TICKET_NOT_FOUND", req.language || "en") as string);
  if (!status) return new ApiResponse(400, null, t("STATUS_REQUIRED", req.language || "en") as string);
  try {
    const io = req.app.get("io");
    const messagePayload = {
      ticketId, status
    };
    io.to(`ticket:${ticketId}`).emit('ticket:status-changed', messagePayload);
  } catch {
    return new ApiResponse(500, null, t("SERVER_ERROR", req.language || "en") as string);
  }
});
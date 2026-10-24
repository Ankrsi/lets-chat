import { Server } from "socket.io";
import { ApiError } from "../../utils/apiError";

type SocketErrorPayload = {
  code: string;
  message: string;
  statusCode?: number;
//   retryable?: boolean;
};


export const emitTransactionError = (
  io: Server,
  socketId: any,
  errorFrom: string,  // WALLET_SERVICE_ERROR (OR) TRANSACTION_SERVICE_ERROR
  error: unknown,
//   retry: boolean
) => {
  let payload: SocketErrorPayload = {
    code: errorFrom,
    message: "Something went wrong",
    // retryable: retry
  };

  if (error instanceof ApiError) {
    payload = {
      code: errorFrom,
      message: error.message,
      statusCode: error.statusCode,
    //   retryable: retry
    };
  } else if (error instanceof Error) {
    payload = {
      code: errorFrom,
      message: error.message,
    //   retryable: retry
    };
  }

    io.to(socketId).emit("transaction:error", payload);

//   io.to(socket.id).emit("transaction:error", payload);
};

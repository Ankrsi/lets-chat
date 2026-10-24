import { Server, Socket } from "socket.io";
import { getAuth, getUserById } from "../../services/auth/auth.service";
import { ApiError } from "../../utils/apiError";
import { createLog, validateCall } from "../../apis/webhook.api";
import { emitTransactionError } from "../../services/transactionService/emitSocketError";
import { redisClient, redisPublisher } from "../../redis/redisClient";
import { ApiResponse } from "../../utils/apiResponse";
import { updateCryptoOrderPayment, updateCryptoSellOrderPayment } from "../../services/transactionService/updateCryptoOrder";
import { updateChargingOrderPayment } from "../../services/transactionService/updateEvSession";
import { settleEcommerceOrder } from "../../services/transactionService/updateOrder";
import { updateInvestmentOrderPayment } from "../../services/transactionService/updateInvestmentOrder";

/* ===================================================================
    Socket payment handling page.
    1) Check and verify the user from auth service.
    2) Call wallet service to validate and make acid.
    3) Call Transactions service to make log into db.
    4) Notify the user(sender) about the transaction.
   =================================================================== */



/* =========================================================
   🧠 IN-MEMORY STORE (TEMP - NOT SCALABLE)
   ========================================================= */
export const transactionUserMap = new Map<string, string>()


/* ===================================================================
    Generate an unique idempotency key to prevent duplicate transaction
   =================================================================== */
function generateIdempotencyKey(userId: string, prefix = "OMNIIA") {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `${prefix}_${userId}_${timestamp}`;
}


/* ===================================================================
    Notify sender with normal error without creating failed DB logs
   =================================================================== */
async function notifyUserWithNormalError(io: Server, phone: string, message: string) {
  try {
    const socketId = await redisClient.hGet("userSocketMap", String(phone)) || "";
    io.to(JSON.parse(socketId)).emit("transaction:error", { message: message })
  } catch (err: unknown) {
    console.error(`Error while notify user with normal error | ${(err as Error).message}`)
  }
}

/* =========================================================
   Create an failed log through transaction service
   ========================================================= */
async function createFailedLog(validatedData: any, success: boolean, phone: string, transactionType: string) {
  try {
    return await createLog({ ...validatedData, success, user_phone: phone, transactionType })
  } catch (err: unknown) {
    console.error(`Error while create failed log | ${(err as Error).message}`)
  }
}

/* =========================================================
   Create an success log through transaction service
   ========================================================= */
async function createSuccessLog(
  data: any,
  success: boolean,
  phone: string,
  transactionType: string,
  driverNumber: string,
  conversationId: string,
  type: string
) {
  try {
    return await createLog({ ...data, success, user_phone: phone, transactionType, driverNumber, conversationId, type })
  } catch (err: unknown) {
    console.error(`Error while creating success log | ${(err as Error).message}`)
  }
}

/* =========================================================
     CORE EVENT PUBLISHER (REDIS + KAFKA)
   ========================================================= */

// Notify the user with redis about the transaction
async function nofityUserAboutTransaction(
  logData: any,
  phone: string,
  driverNumber: string,
  conversationId: string,
  type: string
) {
  try {

    if (logData.length > 0) {
      transactionUserMap.set(logData[0].referenceId, phone);
      console.info("txnUserMap: ", transactionUserMap.entries());
    }

    if (logData[0].status === "completed") {
      switch (type) {
        case "ORDER":
          // Settle the order now rather than only handing an event to a topic;
          // Kafka stays as the retry path. Settlement is idempotent.
          await settleEcommerceOrder(logData[0]);
          break;

        case "CRYPTO":
          if (logData[0].direction === "debit") {
            await updateCryptoOrderPayment(logData[0]);
          } else if (logData[0].direction === "credit") {
            await updateCryptoSellOrderPayment(logData[0]);
          } else {
            console.info("unknown direction");
          }
          break;

        case "EVCHARGE":
          await updateChargingOrderPayment(logData[0]);

          console.info(`[EVCHARGE] Payment success handled`);

          break;


        case "INVESTMENT":
          if (logData[0].direction === "debit") {
            await updateInvestmentOrderPayment(logData[0]);
          }
          break;

        case "TAXI":
          // taxi logic
          break;

        default:
          console.info(`Unhandled transaction type: ${type}`);
      }
    }

    await redisPublisher.publish("updateusertransaction", JSON.stringify({ logData, conversationId }));

    // Publish to extra receivers (driver, merchant, delivery partner…)
    const extraNumbers = [driverNumber].filter(Boolean);

    for (const number of extraNumbers) {
      const datasWithNumber = { logData, phoneNumber: number };
      await redisPublisher.publish("update-receiver", JSON.stringify(datasWithNumber));
    }

    // const messages = logData.map((txn: any) => {
    //   // store referenceId → user mobile mapping
    //   transactionUserMap.set(txn.referenceId, phone);

    //   return {
    //     key: txn.walletId, // ensures ordering per wallet
    //     value: JSON.stringify(txn),
    //   };
    // });

    // console.info(`✅ Published ${messages.length} txns to Kafka`);

  } catch (err: unknown) {
    console.error(`Error while notify user about transactions ${(err as Error).message}`)
  }
}

/* =========================================================
   MAIN SOCKET HANDLER
   ========================================================= */

export const transactionHandler = async (io: Server, socket: Socket) => {

  /*
    This event will listen for client emit to start transactions
  */
  socket.on("transaction:create", async (txnData) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        throw new ApiError('Token Not found, please login again', 401)
      }

      let { lang } = socket.handshake.auth
      if (!lang) lang = 'en'

      const payload = await getAuth(token);

      const userData = await getUserById({ user_id: payload._id.toString() })
      console.info('userData |', userData, "txnData |", txnData)

      // Create an unique Idem key to make safe transaction
      const idempotency_key = generateIdempotencyKey(payload._id)

      const safeTxnData =
        typeof txnData === "string" ? JSON.parse(txnData) : txnData;

      const validateData = { ...safeTxnData, idempotency_key, user: userData.user, token, lang }

      // Calling wallet service to validate the wallet and payment details and to make transaction
      const validateResult = await validateCall(validateData)
      console.info("transaction:validate | Wallet validation successful:", validateResult);


      const {
        result,
        driverNumber: driverNum,
        conversationId: conversation_id,
        type: txn_type,
        transactionType,
        user_phone
      } = validateResult

      const { success, message, data: validatedData } = result

      let logResult: any

      // If validation failed and small error means notify immediatly user about the error
      if (!success && (!validatedData || Object.keys(validatedData).length === 0)) {

        await notifyUserWithNormalError(io, String(user_phone), message)
        return new ApiResponse(200, 'successfully validate failed result got it')

      } else if (!success && (validatedData || Object.keys(validatedData).length !== 0)) {

        // If validation failed and the error want to make log, calling transaction service
        logResult = await createFailedLog(validatedData, success, user_phone, transactionType)

        // Add errorMessage inside logResult.data
        if (logResult?.data?.length > 0) {
          logResult.data[0].errorMessage = validatedData.errorMessage;
        }

      } else {

        // If the validation success create an success log with transaction service
        logResult = await createSuccessLog(validatedData, success, String(user_phone), transactionType, String(driverNum), conversation_id, txn_type)

      }


      const { data: logData, phone, driverNumber, conversationId, type } = logResult;

      // Notify the user about the transaction with redis
      await nofityUserAboutTransaction(logData, String(phone), String(driverNumber), String(conversationId), type)

    } catch (error) {
      console.error("❌ Webhook Error (validate-and-acid):", (error as Error).message);
      // throw new Error("Error while communicating with Wallet Service");
      emitTransactionError(io, socket.id, "Please try again later", error);
      return;
    }

  });

};




// .
// .
// .
// End of socket event for transactions.

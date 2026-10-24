import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { redisPublisher } from "../../redis/redisClient";
import { transactionUserMap } from "../../socket/handlers/transactionHandler";
import {
  updateCryptoOrderPayment,
  updateCryptoSellOrderPayment,
} from "../../services/transactionService/updateCryptoOrder";
import { updateChargingOrderPayment } from "../../services/transactionService/updateEvSession";
import { settleEcommerceOrder } from "../../services/transactionService/updateOrder";
import { updateInvestmentOrderPayment } from "../../services/transactionService/updateInvestmentOrder";

export const createdTxn = asyncHandler(async (req: Request, res: Response) => {
  console.info("Transaction created controller event service");

  const payload = req.body;
  console.info("paylod got it in created txn in superenent service | ", payload);

  const { data, phone, driverNumber, conversationId, type } = payload;

  if (data.length > 0) {
    transactionUserMap.set(data[0].referenceId, phone);
    console.info("txnUserMap: ", transactionUserMap.entries());
  }

  if (data[0].status === "completed") {
    switch (type) {
      case "ORDER":
        // Settle the order now rather than only handing an event to a topic;
        // Kafka stays as the retry path. Settlement is idempotent.
        await settleEcommerceOrder(data[0]);
        break;

      case "CRYPTO":
        if (data[0].direction === "debit") {
          await updateCryptoOrderPayment(data[0]);
        } else if (data[0].direction === "credit") {
          await updateCryptoSellOrderPayment(data[0]);
        } else {
          console.info("unknown direction");
        }
        break;

      case "EVCHARGE":
        await updateChargingOrderPayment(data[0]);

        console.info(`[EVCHARGE] Payment success handled`);

        break;

      case "INVESTMENT":
        if (data[0].direction === "debit") {
          await updateInvestmentOrderPayment(data[0]);
        }
        break;

      case "TAXI":
        // taxi logic
        break;

      default:
        console.info(`Unhandled transaction type: ${type}`);
    }
  }

  await redisPublisher.publish("updateusertransaction", JSON.stringify({ data, conversationId }));

  // Publish to extra receivers (driver, merchant, delivery partner…)
  const extraNumbers = [driverNumber].filter(Boolean);

  for (const number of extraNumbers) {
    const datasWithNumber = { data, phoneNumber: number };
    await redisPublisher.publish("update-receiver", JSON.stringify(datasWithNumber));
  }

  const messages = data.map((txn: any) => {
    // store referenceId → user mobile mapping
    transactionUserMap.set(txn.referenceId, phone);

    return {
      key: txn.walletId, // ensures ordering per wallet
      value: JSON.stringify(txn),
    };
  });

  console.info(`✅ Published ${messages.length} txns to Kafka`);

  return new ApiResponse(200, "successfully txn created and send to save in db");
});

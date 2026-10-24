
/*
 ⚠️ This service is created for just testing purpose of wallet events
*/

import { Producer } from "kafkajs";
import { Server, Socket } from "socket.io";
import { ApiError } from "../../utils/apiError";
import { getAuth } from "../../services/auth/auth.service";

// this will create an unique and new idempotency key for each transaction
function generateIdempotencyKey(userId: string, prefix = "OMNIIA") {
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
    return `${prefix}_${userId}_${timestamp}`;
}

// this is for map transaction's reference id with user's mobile number
export const transactionUserMap = new Map<string, string>()

/* 
 This function will handle all wallet transaction related socket events
*/
export const eventHandler = async (io: Server, socket: Socket, kafkaProducer: Producer, redisPub: any) => {

    // creating room for other servers to make event transactions
    socket.on("wallet:joinRoom", async ({ service }) => {
        socket.join(service)
        console.info(`✅ ${service} joined wallet event room`)
    })

    /*
       This event will listen to client's action with payload to start the transaction.
       And send the data to wallet service to validate the data and make acid transaction.
    */
    socket.on('wallet:start-transaction', async (txnData) => {
        try {
            console.info('txnData | ',txnData)
            const token = socket.handshake.auth?.token || socket.handshake.query?.token;
            if (!token) {
                throw new ApiError('Token not found please login', 401)
            }
            const payload = await getAuth(token)

            const idempotency_key = generateIdempotencyKey(payload._id)

            const room = 'wallet-services'
            io.to(room).emit("wallet:txn-validate", { ...txnData, idempotency_key, user: payload });
        } catch (err) {
            console.error(
                `create transaction socket error | ${(err as Error).message}`
            );
        }
    })


    /*
       This is event will listen for success validation and acid transaction completed data
       and then this will emit event to transactions-service to create
       success transactions log
     */
    socket.on("wallet:acid-completed", async ({ result, room, driverNumber }) => {
        try {

            const { data, success, user_phone, transactionType } = result


            io.to(room).emit("transaction:make-log", { ...data, success, user_phone, transactionType, driverNumber })
        } catch (err) {
            console.error(
                `wallet validation and acid completed socket error | ${(err as Error).message}`
            );
        }
    })


    /*
        This is event will listen for created failed or success logs from transactions service
        and then this will :
        1) update the users first about transaction
        2) send logs to kafka to store in mongodb through redis
      */
    socket.on("wallet:log-created", async ({ data, phone, driverNumber }) => {
        try {

            console.info('phone', phone)
            console.info('data', data)

            if (data.length > 0) {
                transactionUserMap.set(data[0].referenceId, phone);
            }


            // publish the entire txn array only once
            await redisPub.publish("updating-user", JSON.stringify({ data, phone }));

            // Publish to extra receivers (driver, merchant, delivery partner…)
            const extraNumbers = [driverNumber].filter(Boolean);

            for (const number of extraNumbers) {
                const datasWithNumber = { data, phoneNumber: number };
                await redisPub.publish("updating-receiver", JSON.stringify(datasWithNumber));
            }

            const messages = data.map((txn: any) => {

                // store referenceId → user mobile mapping
                transactionUserMap.set(txn.referenceId, phone);

                return {
                    key: txn.walletId, // ensures ordering per wallet
                    value: JSON.stringify(txn),
                };
            });

            await kafkaProducer.send({
                topic: "saving-transaction",
                messages,
            })

        } catch (err) {
            console.error(
                `transaction creating data socket error | ${(err as Error).message}`
            );
        }
    })

}


// .
// .
// .
// End of socket event for transactions.
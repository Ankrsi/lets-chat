
/*
 ⚠️ This service is created for just testing purpose of wallet events
*/

import { kafka } from "./kafkaClient";
import { redisPublisher } from "../redis/redisClient";
import ChatMessage from "../models/chatModal/chats.model";

export const walletEventConsumer = async () => {

    const consumer = kafka.consumer({
    groupId: "wallet-transactions",
    retry: { retries: 10, initialRetryTime: 300 },
  });

  await consumer.connect();
  await consumer.subscribe({ topic: "saving-transaction", fromBeginning: false });
  await consumer.subscribe({ topic: "save-transaction-in-chat", fromBeginning: false });

  await consumer.run({

    eachMessage: async ({topic, message}) => {
      if(topic === "saving-transaction") {
        if(!message.value) return;
        
        try{

          const txn = JSON.parse(message.value.toString());
          
        // send to redis
        // when publish emit two events one for update db and another for notify current user who started txn
        await redisPublisher.publish('txnlog-publisher', JSON.stringify(txn));
          
        }catch(err){
          console.error("❌ Error db saving txn in kafka consumer:", err);
        }
      }
      else if(topic === "save-transaction-in-chat"){
        if(!message.value) return;
        try{
          const chatTxn = JSON.parse(message.value.toString());
          await ChatMessage.create(chatTxn);
          console.info("✅ Chat txn saved in db from kafka consumer");
        }catch(err){
          console.error("❌ Error db saving txn in chat kafka consumer:", err);
        }
      }
    }
  })
}

// .
// .
// .
// End of saving transaction into Postgres



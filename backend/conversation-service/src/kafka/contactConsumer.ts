import AllFriendsContact from "../models/contactModal/allFriendsContact.model";
import { kafka, TOPICS } from "./kafkaClient";

export const contactConsumer = async () => {

  const consumer = kafka.consumer({
    groupId: "contacts-group",
    retry: { retries: 10, initialRetryTime: 300 },
  });

  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.contacts, fromBeginning: false });

  await consumer.run({

    eachMessage: async ({ message }: any) => {
      if (!message.value) return;

      try {
        const { userId, phone, contacts } = JSON.parse(message.value.toString());
        let oldData = await AllFriendsContact.findOne({
          phone: phone
        }).select("-_id contacts").lean();
        let newData = (contacts as any[])
          .filter(c => c.isOnboarded !== false)
          .map(({ name, phone }) => ({ name, phone }))
        const map = new Map<string, { name: string; phone: string }>();
        for (const c of [...newData, ...(oldData?.contacts || [])] as { name: string; phone: string }[]) {
          if (!map.has(c.phone)) map.set(c.phone, c);
        }
        const actualData = [...map.values()];
        await AllFriendsContact.findOneAndUpdate(
          { phone: phone },
          {
            $set: {
              phone,
              contacts: actualData
            }, $setOnInsert: { userId: userId }
          },
          { new: true, upsert: true }
        );
        console.info(`Friends Contacts Saving to DB...`);
      } catch (err) {
        console.error("❌ Error db saving friends contact in kafka consumer:", err);
      }
    }
  })
}

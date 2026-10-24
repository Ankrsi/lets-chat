import AllContact from "../models/contactModal/allContact.model";
import AllFriendsContact from "../models/contactModal/allFriendsContact.model";
import { kafka } from "./kafkaClient";

export const contactConsumer = async () => {

  const consumer = kafka.consumer({
    groupId: "contacts-group",
    // maxBytes: 5 * 1024 * 1024,
    // maxBytesPerPartition: 1024 * 1024,
    retry: { retries: 10, initialRetryTime: 300 },
  });

  await consumer.connect();
  await consumer.subscribe({ topic: "contacts-save-db", fromBeginning: false });
  await consumer.subscribe({ topic: "friends-contacts-save-db", fromBeginning: false });

  await consumer.run({

    eachMessage: async ({ topic, message }: any) => {
      if (topic === "contacts-save-db") {
        if (!message.value) return;

        try {
          const { userId, phone, contacts } = JSON.parse(message.value.toString());
          let user = await AllContact.findOne({ phone: phone });

          if (!user) {
            user = new AllContact({
              userId,
              phone,
              contacts
            });
            await user.save();
          }

          const existing = new Map(user.contacts.map(c => [c.phone, c.name]));

          for (const c of contacts) {
            existing.set(c.phone, c.name);
          }

          user.contacts = Array.from(existing, ([phone, name]) => ({ phone, name }));
          await user.save();

          console.info(`Contacts Saving to DB...`);
        } catch (err) {
          console.error("❌ Error db saving contact in kafka consumer:", err);
        }
      }
      if (topic === "friends-contacts-save-db") {
        if (!message.value) return;

        try {
          const { userId, phone, contacts } = JSON.parse(message.value.toString());
          let oldData = await AllFriendsContact.findOne({
            phone: phone
          }).select("-_id contacts").lean();
          let newData = (contacts as any[])
            .filter(c => c.isOnboarded)
            .map(({ name, phone }) => ({ name, phone }))
          const map = new Map<string, { name: string; phone: string }>();
          for (const c of [...newData, ...(oldData?.contacts || [])]) {
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
    }
  })
}

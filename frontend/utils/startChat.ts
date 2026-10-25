import { saveConversation } from "@/db/conversationRepo";
import { apiErrorMessage, CHATAPI } from "@/utils/api";
import { Router } from "expo-router";
import { Alert } from "react-native";

/**
 * Opens the one-to-one chat with a phone number. The server returns the existing
 * conversation if there is one, otherwise creates it.
 */
export async function openChatWith(phone: string, router: Router) {
  try {
    const res = await CHATAPI.post("/chats/createConversations", { type: "single", memberIds: [String(phone)] });
    const conv = res.data.conv;
    await saveConversation(conv);
    router.push({ pathname: "/screens/room", params: { id: conv._id } });
  } catch (err) {
    Alert.alert("Couldn't open chat", apiErrorMessage(err, "This person may not be using the app yet."));
  }
}

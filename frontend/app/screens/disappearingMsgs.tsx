import { getDisappearingMessage, setDisappearingMessages } from "@/db/conversationRepo";
import React from "react";
import MessageTimerScreen from "../components/MessageTimerScreen";

const options = [
    { label: "Off", value: "0s" },
    { label: "24 hours", value: "24h" },
    { label: "7 days", value: "7d" },
    { label: "90 days", value: "90d" },
];

const load = async (id: string) => ((await getDisappearingMessage(id)) as any)?.disappearingMessagesTime;

export default function DisappearingMessagesScreen() {
    return (
        <MessageTimerScreen
            title="Disappearing messages"
            icon="timer-outline"
            heading="Make messages disappear"
            description="For more privacy and storage, new messages in this chat disappear for everyone after the selected time."
            options={options}
            load={load}
            save={setDisappearingMessages}
            endpoint="/chats/setDisappearingMessages"
        />
    );
}

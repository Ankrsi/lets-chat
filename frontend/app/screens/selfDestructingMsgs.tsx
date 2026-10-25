import { getSelfDestructingMessage, setSelfDestructingMessages } from "@/db/conversationRepo";
import React from "react";
import MessageTimerScreen from "../components/MessageTimerScreen";

const options = [
    { label: "Off", value: "0s" },
    { label: "5 minutes", value: "5m" },
    { label: "10 minutes", value: "10m" },
    { label: "15 minutes", value: "15m" },
    { label: "1 hour", value: "1h" },
    { label: "24 hours", value: "24h" },
    { label: "7 days", value: "7d" },
    { label: "90 days", value: "90d" },
];

const load = async (id: string) => ((await getSelfDestructingMessage(id)) as any)?.destructingMessagesTime;

export default function SelfDestructingMessagesScreen() {
    return (
        <MessageTimerScreen
            title="Self-destructing messages"
            icon="flame-outline"
            heading="Make messages self-destruct"
            description="New messages in this chat delete themselves for everyone once the selected time has passed."
            options={options}
            load={load}
            save={setSelfDestructingMessages}
            endpoint="/chats/setDestructingMessages"
        />
    );
}

import { Provider, Notification } from "apn";

function stringifyData(data: any = {}): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key in data) {
        const value = data[key];
        result[key] =
            typeof value === "string" ? value : JSON.stringify(value);
    }
    return result;
}

const VOIP_TOPIC = "com.mafado.omniia.voip";

interface FCMMessageParams {
    token: string;
    data: Record<string, string>;
}

interface FCMMessagesParams {
    tokens: string[];
    data: Record<string, string>;
}

let options = {
    token: {
        key: process.env.VOIP_AUTH_KEY!.replace(/\\n/g, '\n'),
        keyId: process.env.VOIP_KEY_ID!,
        teamId: process.env.VOIP_TEAM_ID!,
    },
    production: process.env.production == "true"
};

let apnProvider = new Provider(options);

// apn@2.2.0 only sends "apns-expiration" when expiry > 0, so `expiry = 0` drops the header
// and APNs falls back to store-and-forward: an offline device gets a stale call when it
// reconnects. Force "apns-expiration: 0" (deliver now or discard) and the voip push type.
const withNoStoreVoipHeaders = (notification: Notification) => {
    // headers() exists at runtime but is missing from apn's typings
    const n = notification as Notification & { headers: () => Record<string, string | number> };
    const baseHeaders = n.headers.bind(n);
    n.headers = () => ({
        ...baseHeaders(),
        "apns-expiration": "0",
        "apns-push-type": "voip",
    });
    return notification;
};

export const sendVoipToDevice = async ({ token, data }: FCMMessageParams) => {
    try {
        const safeData = stringifyData(data);
        let notification = new Notification();
        notification.topic = VOIP_TOPIC;
        notification.payload = safeData;
        notification.expiry = 0;
        withNoStoreVoipHeaders(notification);

        return await apnProvider.send(notification, token);

    } catch (error) {
        console.error("Error sending notification: ", error);
    }
}

export const sendVoipsToDevice = async ({ tokens, data }: FCMMessagesParams) => {
    try {
        const safeData = stringifyData(data);
        let notification = new Notification();
        notification.topic = VOIP_TOPIC;
        notification.payload = safeData;
        withNoStoreVoipHeaders(notification);

        return await apnProvider.send(notification, tokens);

    } catch (error) {
        console.error("Error sending notification: ", error);
    }
}

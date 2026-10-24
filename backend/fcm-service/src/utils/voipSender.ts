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

const VoipNotificationType: Record<string, string> = {
    // taxi_driver: process.env.client == "true" ? "com.mafado.partner.voip" : "com.NGApp.partner.voip",
    taxi_driver: "com.mafado.partner.voip",
    // individual: process.env.client == "true" ? "com.mafado.omniia.voip" : "com.superapp.NGApp.voip"
    individual: "com.mafado.omniia.voip"
};
console.info("VoipNotificationType: ", VoipNotificationType);

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
        // key: "src/utils/AuthKey_3BK888US97.p8",
        // key: "src/utils/AuthKey_89NW93HZG6.p8",
        key: process.env.VOIP_AUTH_KEY!.replace(/\\n/g, '\n'),
        keyId: process.env.VOIP_KEY_ID!,
        teamId: process.env.VOIP_TEAM_ID!,
        // teamId: "3F476WD2WZ",
    },
    production: process.env.production == "true"
    // production: false
};

let apnProvider = new Provider(options);
console.info("APN Provider initialized with options: ", options);
console.info("APN Provider initialized keys: ", options.token.key);

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
        // notification.pushType = "voip";
        notification.topic = VoipNotificationType[data?.role];
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
        // const expirySeconds = Math.floor(Date.now() / 1000) + 30;
        const safeData = stringifyData(data);
        let notification = new Notification();
        // notification.pushType = "voip";
        notification.topic = VoipNotificationType[data?.role];
        notification.payload = safeData;
        // notification.expiry = expirySeconds;
        withNoStoreVoipHeaders(notification);

        return await apnProvider.send(notification, tokens);

    } catch (error) {
        console.error("Error sending notification: ", error);
    }
}

import { sendMessageToDevice } from "../utils/fcmSender";

interface Device {
  token: string;
  device_type: "android" | "ios";
}

interface MulticastNotificationInput {
  devices: Device[];
  notification: { title: string; body: string };
  data?: Record<string, any>;
  android?: any;
  apns?: any;
}

export async function sendMulticastNotificationService({
  devices,
  notification,
  data,
  android,
  apns,
}: MulticastNotificationInput) {
  if (!Array.isArray(devices) || devices.length === 0) {
    throw new Error("Devices array is required");
  }

  console.info("Sending multicast notification to devices:", devices);

  const results = await Promise.all(
    devices.map((device) =>
      sendMessageToDevice({
        token: device.token,
        notification,
        data,
        device_type: device.device_type,
        android,
        apns,
      }).then(
        (res) => ({ token: device.token, success: true, response: res }),
        (err) => ({ token: device.token, success: false, error: err.message }),
      ),
    ),
  );

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  return {
    successCount,
    failureCount,
    results,
  };
}

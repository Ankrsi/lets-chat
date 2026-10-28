import Storage from "expo-sqlite/kv-store";

// Message notifications on/off, saved on this phone. On until the user turns it off.
const KEY = "notifications.messages";

export const messageNotificationsOn = () => {
  try {
    return Storage.getItemSync(KEY) !== "off";
  } catch {
    return true;
  }
};

export const setMessageNotifications = (on: boolean) => {
  try {
    Storage.setItemSync(KEY, on ? "on" : "off");
  } catch (err) {
    console.info("notification setting not saved", err);
  }
};

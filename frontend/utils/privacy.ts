import Storage from "expo-sqlite/kv-store";

// Privacy switches saved on this phone ("on" / "off"). Both are on until the user turns them off.
const isOn = (key: string) => {
  try {
    return Storage.getItemSync(key) !== "off";
  } catch {
    return true;
  }
};

const save = (key: string, on: boolean) => {
  try {
    Storage.setItemSync(key, on ? "on" : "off");
  } catch (err) {
    console.info("privacy setting not saved", err);
  }
};

// Read receipts: when off, opening a chat doesn't tell the sender you read it
export const readReceiptsOn = () => isOn("privacy.readReceipts");
export const setReadReceipts = (on: boolean) => save("privacy.readReceipts", on);

// Online status: when off, nobody sees you as "online"
export const onlineStatusOn = () => isOn("privacy.onlineStatus");
export const setOnlineStatus = (on: boolean) => save("privacy.onlineStatus", on);

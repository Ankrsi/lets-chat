import * as LocalAuthentication from "expo-local-authentication";
import Storage from "expo-sqlite/kv-store";

// Biometric lock setting, read synchronously so the lock is up before the first screen shows
const KEY = "security.biometricLock";

export const isAppLockOn = () => {
  try {
    return Storage.getItemSync(KEY) === "on";
  } catch {
    return false;
  }
};

export const setAppLock = (on: boolean) => {
  try {
    Storage.setItemSync(KEY, on ? "on" : "off");
  } catch (err) {
    console.info("app lock setting not saved", err);
  }
};

// Fingerprint / face, or at least a screen lock (PIN, pattern) to fall back on
export const canUseAppLock = async () =>
  (await LocalAuthentication.getEnrolledLevelAsync()) > LocalAuthentication.SecurityLevel.NONE;

export const unlockWithBiometrics = async (promptMessage = "Unlock Chat App") => {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    fallbackLabel: "Use phone PIN",
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  });
  return result.success;
};

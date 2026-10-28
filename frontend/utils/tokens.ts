import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

// Login tokens live in SecureStore (encrypted by the phone's keystore), not plain AsyncStorage.
// Older app versions kept them in AsyncStorage: they are moved over the first time they're read.
const ACCESS = "token";
const REFRESH = "refreshToken";

const read = async (key: string) => {
  const value = await SecureStore.getItemAsync(key);
  if (value) return value;
  const old = await AsyncStorage.getItem(key);
  if (old) {
    await SecureStore.setItemAsync(key, old);
    await AsyncStorage.removeItem(key);
  }
  return old;
};

export const getAccessToken = () => read(ACCESS);
export const getRefreshToken = () => read(REFRESH);

export const saveTokens = async (accessToken: string, refreshToken?: string) => {
  await SecureStore.setItemAsync(ACCESS, accessToken);
  if (refreshToken) await SecureStore.setItemAsync(REFRESH, refreshToken);
};

export const clearTokens = async () => {
  await SecureStore.deleteItemAsync(ACCESS);
  await SecureStore.deleteItemAsync(REFRESH);
  await AsyncStorage.multiRemove([ACCESS, REFRESH]);
};

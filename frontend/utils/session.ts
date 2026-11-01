import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from "@/db/sqlite";
import * as Application from 'expo-application';
import * as Contacts from 'expo-contacts';
import { Router } from 'expo-router';
import { Platform } from 'react-native';
import { CHATAPI } from '@/utils/api';
import { initKey } from '@/utils/e2ee';
import { setGlobalDbTick, setGlobalUsername } from '@/utils/globalRefs';
import { initializeSocket, offlineMsgStoreApi, restorePreviousConversations } from '@/utils/socket';

// Profile as returned by auth-service (verify-otp, verify-user, /profile/*)
export interface AuthUser {
  _id: string;
  phone: string;
  username: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  about: string;
  email: string | null;
  profile_image: string | null;
  isRegistered: boolean;
  twoStepEnabled?: boolean;
  photoVisibility?: "everyone" | "nobody";
}

export async function getDeviceId(): Promise<string> {
  if (Platform.OS === 'android') {
    return Application.getAndroidId() ?? 'unknown';
  }
  return await Application.getIosIdForVendorAsync() ?? 'unknown';
}

export async function saveUser(user: AuthUser) {
  // The chats on this phone belong to one number: a different number logging in starts empty
  const owner = await AsyncStorage.getItem("dbOwner");
  if (owner && owner !== String(user.phone)) await clearLocalData();
  await AsyncStorage.setItem("dbOwner", String(user.phone));

  await AsyncStorage.multiSet([
    ["username", String(user.phone)],
    ["userHandle", user.username ?? ""],
    ["first_name", user.first_name ?? ""],
    ["last_name", user.last_name ?? ""],
    ["about", user.about ?? ""],
    ["email", user.email ?? ""],
    ["profile", user.profile_image ?? ""],
    ["twoStepEnabled", user.twoStepEnabled ? "1" : "0"],
    ["photoVisibility", user.photoVisibility ?? "everyone"],
  ]);
  setGlobalUsername(String(user.phone));
}

async function clearLocalData() {
  db.execSync("DELETE FROM messages; DELETE FROM message_receipts; DELETE FROM conversations; DELETE FROM calls;");
  await AsyncStorage.multiRemove(["contactsFriend", "twoStepEnabled", "photoVisibility"]);
}

// Finds which of the phone's contacts use the app and saves them ("contactsFriend").
// Runs at login, on every app start and when the contacts screen opens, so a failed try
// (no permission yet, offline) fixes itself next time. `ask`: show the permission prompt if needed.
// Returns false when there's no contacts permission.
export async function syncContacts(ask = false): Promise<boolean> {
  let { status, canAskAgain } = await Contacts.getPermissionsAsync();
  if (status !== "granted" && ask && canAskAgain) ({ status } = await Contacts.requestPermissionsAsync());
  if (status !== "granted") return false;

  try {
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
    });

    // Every number of every contact: a friend may use the app with their second number
    const seen = new Set<string>();
    const phonesWithNames: { name: string; phone: string }[] = [];
    for (const c of data ?? []) {
      for (const p of c.phoneNumbers ?? []) {
        const phone = (p.number || "").replace(/[^\d+]/g, "");
        if (!/^\+?\d{8,15}$/.test(phone) || seen.has(phone)) continue;
        seen.add(phone);
        phonesWithNames.push({ name: c.name, phone });
      }
    }
    if (!phonesWithNames.length) return true;

    const res = await CHATAPI.post("/contacts/my-contacts", { phonesWithNames: phonesWithNames.slice(0, 5000) });
    // One entry per person (the same number can be saved twice in different formats)
    const friends = new Map<string, any>();
    for (const u of res.data ?? []) if (u.isOnboarded && !friends.has(u.phone)) friends.set(u.phone, u);
    await AsyncStorage.setItem("contactsFriend", JSON.stringify([...friends.values()]));
    setGlobalDbTick(); // names everywhere in the app refresh
  } catch (err) {
    console.info("contact sync failed, will try again next time", err);
  }
  return true;
}

export async function finishLogin(router: Router) {
  const phone = await AsyncStorage.getItem("username");
  await initKey().catch((err) => console.info("e2ee initKey failed", err));
  await syncContacts(true);
  await restorePreviousConversations();
  await initializeSocket();
  await offlineMsgStoreApi(phone as string);
  if (router.canDismiss()) router.dismissAll(); // nothing to dismiss when already at the first screen
  router.replace("/screens/chat");
}

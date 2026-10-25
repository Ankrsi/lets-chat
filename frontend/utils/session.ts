import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Contacts from 'expo-contacts';
import { Router } from 'expo-router';
import { Platform } from 'react-native';
import { CHATAPI } from '@/utils/api';
import { initKey } from '@/utils/e2ee';
import { setGlobalUsername } from '@/utils/globalRefs';
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
}

export async function getDeviceId(): Promise<string> {
  if (Platform.OS === 'android') {
    return Application.getAndroidId() ?? 'unknown';
  }
  return await Application.getIosIdForVendorAsync() ?? 'unknown';
}

/**
 * Caches the profile locally. Note: "username" has always held the phone number
 * (the chat identity used across the app); the chosen username is "userHandle".
 */
export async function saveUser(user: AuthUser) {
  await AsyncStorage.multiSet([
    ["username", String(user.phone)],
    ["userHandle", user.username ?? ""],
    ["first_name", user.first_name ?? ""],
    ["last_name", user.last_name ?? ""],
    ["about", user.about ?? ""],
    ["email", user.email ?? ""],
    ["profile", user.profile_image ?? ""],
  ]);
  setGlobalUsername(String(user.phone));
}

export async function syncContacts() {
  try {
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
    });
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.log("No contacts available");
      return;
    }
    let filterData: any = data.filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
    filterData = filterData.map((c: any) => {
      try {
        let raw = c.phoneNumbers?.[0]?.number || "";
        let cleaned = raw.replace(/[^\d+]/g, "");
        if (!/^\+?\d{8,15}$/.test(cleaned)) {
          return null;
        }
        return {
          name: c.name,
          phone: cleaned,
        };
      }
      catch (err) {
        return null
      }
    }).filter(Boolean) || [];
    try {
      const res = await CHATAPI.post("/contacts/my-contacts", {
        phonesWithNames: filterData,
      });
      const friends = res.data?.filter((usr: any) => usr.isOnboarded);
      await AsyncStorage.setItem("contacts", JSON.stringify(res.data));
      await AsyncStorage.setItem("contactsFriend", JSON.stringify(friends));
      let username = await AsyncStorage.getItem("username");
      setGlobalUsername(username);
    } catch (err) {
      console.error("Error fetching contacts:", err);
    }
  } catch (err) {
    console.error("Error fetching contacts:", err);
  }
}

/** Runs once the user is logged in and registered, then opens the chat list. */
export async function finishLogin(router: Router) {
  const phone = await AsyncStorage.getItem("username");
  await initKey().catch((err) => console.info("e2ee initKey failed", err));
  await syncContacts();
  await restorePreviousConversations();
  await initializeSocket();
  await offlineMsgStoreApi(phone as string);
  if (router.canDismiss()) router.dismissAll(); // nothing to dismiss when already at the first screen
  router.replace("/screens/chat");
}

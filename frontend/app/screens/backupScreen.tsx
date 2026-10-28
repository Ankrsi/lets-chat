import { SettingsStyle } from "@/app/styles";
import { db } from "@/db/sqlite";
import { colors, radius, statusBarStyle } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { reloadAppAsync } from "expo";
import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { decryptBackup, encryptBackup, saveBackupPassword, savedBackupPassword } from "@/utils/backupCrypto";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// The chat database, and the backup kept in the app's private Google Drive folder
const DB_DIR = `${FileSystem.documentDirectory}SQLite/`;
const DB_PATH = `${DB_DIR}chat.db`;
const DOWNLOAD_PATH = `${FileSystem.cacheDirectory}restore.enc`;
const UPLOAD_PATH = `${FileSystem.cacheDirectory}backup.enc`;
const DRIVE = "https://www.googleapis.com/drive/v3/files";

GoogleSignin.configure({
  webClientId: "994506985190-sfpc5s8m8rdk1j8cgkrd5smif11hfp3a.apps.googleusercontent.com",
  scopes: ["https://www.googleapis.com/auth/drive.appdata"],
});

type Backup = { id: string; modifiedTime: string; size: string };

// One backup per phone number, so a Google account shared by two numbers never mixes chats
const backupName = async () => `chat_backup_${await AsyncStorage.getItem("username")}.enc`;

// A fresh Google access token (it expires after about an hour)
const getToken = async () => (await GoogleSignin.getTokens()).accessToken;

const findBackup = async (token: string): Promise<Backup | null> => {
  const q = encodeURIComponent(`name='${await backupName()}'`);
  const res = await fetch(`${DRIVE}?q=${q}&spaces=appDataFolder&fields=files(id,modifiedTime,size)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Couldn't reach Google Drive. Try again.");
  return (await res.json()).files?.[0] ?? null;
};

const backUp = async (token: string, password: string) => {
  // New messages wait in a side file (WAL); merge them into chat.db first so the backup has everything
  db.execSync("PRAGMA wal_checkpoint(TRUNCATE);");
  const encrypted = await encryptBackup(await new File(DB_PATH).bytes(), password);
  new File(UPLOAD_PATH).write(encrypted);

  try {
    const old = await findBackup(token);
    const auth = { Authorization: `Bearer ${token}` };

    // 1. Create the file in the app's private Drive folder, 2. upload the encrypted bytes into it
    const created = await fetch(DRIVE, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ name: await backupName(), parents: ["appDataFolder"] }),
    });
    if (!created.ok) throw new Error("Upload failed. Your previous backup is kept.");
    const { id } = await created.json();

    const upload = await FileSystem.uploadAsync(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, UPLOAD_PATH, {
      httpMethod: "PATCH",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { ...auth, "Content-Type": "application/octet-stream" },
    });
    if (upload.status < 200 || upload.status >= 300) {
      await fetch(`${DRIVE}/${id}`, { method: "DELETE", headers: auth });
      throw new Error("Upload failed. Your previous backup is kept.");
    }

    // Only after the new one is safely uploaded
    if (old) await fetch(`${DRIVE}/${old.id}`, { method: "DELETE", headers: auth });
  } finally {
    await FileSystem.deleteAsync(UPLOAD_PATH, { idempotent: true });
  }
};

const restore = async (token: string, backup: Backup, password: string) => {
  // Download and decrypt first, so a failed download or wrong password never touches your chats
  const res = await FileSystem.downloadAsync(`${DRIVE}/${backup.id}?alt=media`, DOWNLOAD_PATH, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) throw new Error("Download failed. Your chats were not changed.");
  let chats: Uint8Array;
  try {
    chats = await decryptBackup(await new File(DOWNLOAD_PATH).bytes(), password);
  } finally {
    await FileSystem.deleteAsync(DOWNLOAD_PATH, { idempotent: true });
  }
  await saveBackupPassword(password);

  // Swap the database while it's closed, drop the old side files, then restart
  db.closeSync();
  try {
    await FileSystem.deleteAsync(`${DB_PATH}-wal`, { idempotent: true });
    await FileSystem.deleteAsync(`${DB_PATH}-shm`, { idempotent: true });
    new File(DB_PATH).write(chats);
  } finally {
    // Restart either way: the database is closed, and the restart opens it again
    await reloadAppAsync("Backup restored");
  }
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const formatSize = (bytes: string) => `${(Number(bytes) / (1024 * 1024)).toFixed(1)} MB`;

export default function BackupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // what's running, shown to the user

  // Password box. "create": first backup on this phone; "enter": restoring
  const [ask, setAsk] = useState<{ mode: "create" | "enter"; done: (pw: string | null) => void } | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const askPassword = (mode: "create" | "enter") =>
    new Promise<string | null>((done) => {
      setPw("");
      setPw2("");
      setAsk({ mode, done });
    });
  const closeAsk = (value: string | null) => {
    ask?.done(value);
    setAsk(null);
  };
  const submitPassword = () => {
    if (pw.length < 6) return Alert.alert("Too short", "Use at least 6 characters.");
    if (ask?.mode === "create" && pw !== pw2) return Alert.alert("Passwords don't match", "Type the same password twice.");
    closeAsk(pw);
  };

  const loadBackup = async () => setBackup(await findBackup(await getToken()));

  // Already connected before: pick up where we left off
  useEffect(() => {
    if (!GoogleSignin.getCurrentUser()) return;
    setBusy("Connecting…");
    GoogleSignin.signInSilently()
      .then(async (res) => {
        setEmail(res.data?.user.email ?? null);
        await loadBackup();
      })
      .catch(() => setEmail(null))
      .finally(() => setBusy(null));
  }, []);

  const connect = async () => {
    setBusy("Connecting…");
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await GoogleSignin.signIn();
      if (res.type !== "success") return;
      setEmail(res.data.user.email);
      await loadBackup();
    } catch (err: any) {
      Alert.alert("Couldn't connect", err?.message ?? "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    await GoogleSignin.signOut();
    setEmail(null);
    setBackup(null);
  };

  const runBackup = async () => {
    let password = await savedBackupPassword();
    if (!password) {
      password = await askPassword("create");
      if (!password) return;
      await saveBackupPassword(password);
    }
    setBusy("Backing up…");
    try {
      await backUp(await getToken(), password);
      await loadBackup();
      Alert.alert("Backup done", "Your chats are saved to Google Drive.");
    } catch (err: any) {
      Alert.alert("Backup failed", err?.message ?? "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const askRestore = () =>
    Alert.alert("Restore backup?", "Your chats on this phone will be replaced with the backup. The app restarts after.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restore",
        style: "destructive",
        onPress: async () => {
          const password = await askPassword("enter");
          if (!password) return;
          setBusy("Restoring…");
          try {
            await restore(await getToken(), backup!, password);
          } catch (err: any) {
            setBusy(null);
            Alert.alert("Restore failed", err?.message ?? "Try again.");
          }
        },
      },
    ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={colors.surface} />
      <View style={SettingsStyle.header}>
        <TouchableOpacity style={SettingsStyle.backBtn} onPress={() => router.back()} disabled={!!busy}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={SettingsStyle.headerTitle}>Backup & Restore</Text>
      </View>

      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={s.body}>
        {/* Google Drive account */}
        <View style={s.card}>
          <Ionicons name="logo-google" size={26} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Google Drive</Text>
            <Text style={s.sub}>{email ?? "Not connected"}</Text>
            {email && (
              <Text style={s.sub}>
                {backup ? `Last backup: ${formatDate(backup.modifiedTime)} · ${formatSize(backup.size)}` : "No backup yet"}
              </Text>
            )}
          </View>
          {!busy && (
            <TouchableOpacity onPress={email ? disconnect : connect}>
              <Text style={[s.link, email && { color: colors.danger }]}>{email ? "Disconnect" : "Connect"}</Text>
            </TouchableOpacity>
          )}
        </View>

        {busy ? (
          <View style={s.busy}>
            <ActivityIndicator color={colors.primary} />
            <Text style={s.sub}>{busy}</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity style={[s.btn, !email && s.disabled]} onPress={runBackup} disabled={!email}>
              <Ionicons name="cloud-upload-outline" size={20} color={colors.textOnPrimary} />
              <Text style={s.btnText}>Back up now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnOutline, !backup && s.disabled]} onPress={askRestore} disabled={!backup}>
              <Ionicons name="cloud-download-outline" size={20} color={colors.primary} />
              <Text style={s.btnOutlineText}>Restore backup</Text>
            </TouchableOpacity>
          </>
        )}

        <Text style={s.note}>
          Backups are encrypted with your backup password before they leave this phone, so only you can read
          them. Keep the password safe: without it a backup can't be restored. Photos and videos stay online
          and are not part of the backup.
        </Text>
      </ScrollView>

      <Modal visible={!!ask} transparent animationType="fade" onRequestClose={() => closeAsk(null)}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.title}>{ask?.mode === "create" ? "Create a backup password" : "Enter backup password"}</Text>
            <Text style={s.sub}>
              {ask?.mode === "create"
                ? "Your backup is locked with this password. You'll need it to restore on a new phone."
                : "The password you set when you made this backup."}
            </Text>
            <TextInput style={s.input} value={pw} onChangeText={setPw} placeholder="Password" placeholderTextColor={colors.textMuted} secureTextEntry autoFocus />
            {ask?.mode === "create" && (
              <TextInput style={s.input} value={pw2} onChangeText={setPw2} placeholder="Type it again" placeholderTextColor={colors.textMuted} secureTextEntry />
            )}
            <View style={s.dialogButtons}>
              <TouchableOpacity onPress={() => closeAsk(null)}>
                <Text style={[s.link, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitPassword}>
                <Text style={s.link}>{ask?.mode === "create" ? "Save" : "Restore"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  body: { padding: 16, gap: 14 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 16,
  },
  title: { fontSize: 15, fontWeight: "700", color: colors.text },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  link: { fontSize: 14, fontWeight: "700", color: colors.primary },
  busy: { alignItems: "center", gap: 8, paddingVertical: 24 },
  btn: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
  },
  btnText: { color: colors.textOnPrimary, fontSize: 15, fontWeight: "700" },
  btnOutline: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
  },
  btnOutlineText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.4 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  dialogButtons: { flexDirection: "row", justifyContent: "flex-end", gap: 24, marginTop: 6 },
  note: { fontSize: 12, color: colors.textMuted, lineHeight: 18, textAlign: "center", marginTop: 8 },
});

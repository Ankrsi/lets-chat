import * as FileSystem from "expo-file-system/legacy";
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, getAuth, signInWithCredential } from '@react-native-firebase/auth';
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { styles } from "../styles";

const DB_NAME = "chat.db";
const DB_PATH = FileSystem.documentDirectory + `SQLite/${DB_NAME}`;
const BACKUP_FILE_NAME = "chat_backup.db";

GoogleSignin.configure({
    webClientId: '994506985190-sfpc5s8m8rdk1j8cgkrd5smif11hfp3a.apps.googleusercontent.com',
    scopes: ['https://www.googleapis.com/auth/drive.appdata']
});

type Status = "idle" | "loading" | "success" | "error";
type ActionType = "backup" | "restore" | null;

interface BackupInfo {
    id: string;
    name: string;
    modifiedTime: string;
    size: string;
}

const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
};

const formatBytes = (bytes: string) => {
    const b = parseInt(bytes);
    if (!b) return "Unknown size";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

// DRIVE API
const findBackupOnDrive = async (accessToken: string): Promise<BackupInfo | null> => {
    const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${BACKUP_FILE_NAME}'&spaces=appDataFolder&fields=files(id,name,modifiedTime,size)`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    return data.files?.[0] ?? null;
};

const uploadToDrive = async (accessToken: string, dbBase64: string): Promise<boolean> => {
    const metadata = { name: BACKUP_FILE_NAME, mimeType: "application/octet-stream", parents: ['appDataFolder'] };
    const boundary = "backup_boundary_xyz";
    const body =
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: base64\r\n\r\n${dbBase64}\r\n` +
        `--${boundary}--`;

    const res = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body,
        }
    );
    return res.ok;
};

const deleteFromDrive = async (accessToken: string, fileId: string) => {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
    });
};

// BACKUP
const backupToGoogleDrive = async (
    accessToken: string,
    onProgress: (msg: string) => void
): Promise<void> => {
    onProgress("Reading local database...");
    const dbBase64 = await FileSystem.readAsStringAsync(DB_PATH, {
        encoding: FileSystem.EncodingType.Base64,
    });

    onProgress("Checking existing backup...");
    const existing = await findBackupOnDrive(accessToken);

    onProgress("Uploading new backup...");
    const uploaded = await uploadToDrive(accessToken, dbBase64);
    if (!uploaded) throw new Error("Upload failed — previous backup kept.");

    if (existing?.id) {
        onProgress("Deleting old backup...");
        await deleteFromDrive(accessToken, existing.id);
    }

    onProgress("Backup complete!");
};

// RESTORE
const restoreFromGoogleDrive = async (
    accessToken: string,
    onProgress: (msg: string) => void
): Promise<void> => {
    onProgress("Locating backup on Drive...");
    const existing = await findBackupOnDrive(accessToken);
    if (!existing) throw new Error("No backup found on Google Drive.");

    onProgress("Downloading backup...");

    const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error("Download failed.");

    const blob = await res.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    onProgress("Restoring database...");
    await FileSystem.makeDirectoryAsync(
        FileSystem.documentDirectory + 'SQLite',
        { intermediates: true }
    );

    await FileSystem.writeAsStringAsync(DB_PATH, base64, {
        encoding: FileSystem.EncodingType.Base64,
    });

    onProgress("Restored! Please restart the app.");
};

const BackupScreen: React.FC = () => {
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null);
    const [connecting, setConnecting] = useState(false);
    const [status, setStatus] = useState<Status>("idle");
    const [activeAction, setActiveAction] = useState<ActionType>(null);
    const [progressMsg, setProgressMsg] = useState("");
    const [modalVisible, setModalVisible] = useState(false);

    useEffect(() => {
        restorePreviousSignIn();
    }, []);

    const restorePreviousSignIn = async () => {
        try {
            setConnecting(true);

            const currentUser = GoogleSignin.getCurrentUser();
            if (!currentUser) return;

            const userInfo = await GoogleSignin.signInSilently();
            const grantedScopes = userInfo.data?.scopes ?? [];
            const hasDriveScope = grantedScopes.includes('https://www.googleapis.com/auth/drive.appdata');

            if (!hasDriveScope) {
                await GoogleSignin.signOut();
                return;
            }

            const tokens = await GoogleSignin.getTokens();
            const credential = GoogleAuthProvider.credential(userInfo.data?.idToken);
            const result = await signInWithCredential(getAuth(), credential);

            setAccessToken(tokens.accessToken);
            setUserEmail(result.user.email ?? null);

            const info = await findBackupOnDrive(tokens.accessToken);
            setBackupInfo(info);
        } catch (e) {
            console.info('No previous session:', e);
        } finally {
            setConnecting(false);
        }
    };

    const connectGoogle = async () => {
        try {
            setConnecting(true);

            await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
            const signInResult = await GoogleSignin.signIn();

            let idToken = signInResult.data?.idToken;
            if (!idToken) {
                idToken = signInResult.data?.idToken;
            }
            if (!idToken) {
                throw new Error('No ID token found');
            }

            const googleCredential = GoogleAuthProvider.credential(signInResult?.data?.idToken);

            const result = await signInWithCredential(getAuth(), googleCredential);
            if (!result) return;

            const tokens = await GoogleSignin.getTokens();
            const token = tokens.accessToken;

            setAccessToken(token);
            setUserEmail(result.user.email ?? null);

            const info = await findBackupOnDrive(token);
            setBackupInfo(info);
        } catch (e: any) {
            Alert.alert("Sign in failed", e.message);
        } finally {
            setConnecting(false);
        }
    };

    const disconnectGoogle = async () => {
        await GoogleSignin.signOut();
        setAccessToken(null);
        setUserEmail(null);
        setBackupInfo(null);
    };

    const runAction = async (action: ActionType) => {
        if (!accessToken) {
            Alert.alert("Not connected", "Please connect to Google Drive first.");
            return;
        }
        setActiveAction(action);
        setStatus("loading");
        setProgressMsg("");
        setModalVisible(true);
        try {
            if (action === "backup") {
                await backupToGoogleDrive(accessToken, setProgressMsg);
            } else {
                await restoreFromGoogleDrive(accessToken, setProgressMsg);
            }
            setStatus("success");
            const info = await findBackupOnDrive(accessToken);
            setBackupInfo(info);
        } catch (e: any) {
            setStatus("error");
            setProgressMsg(e.message || "Something went wrong.");
        }
    };

    const confirmRestore = () => {
        Alert.alert(
            "Restore Backup?",
            "This will overwrite your current data with the backup from Google Drive. You will need to restart the app after restoring.",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Restore", style: "destructive", onPress: () => runAction("restore") },
            ]
        );
    };

    const closeModal = () => {
        setModalVisible(false);
        setStatus("idle");
        setActiveAction(null);
        setProgressMsg("");
    };

    return (
        <SafeAreaView style={{ ...styles.container, paddingTop: 0 }}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />

            <View style={s.header}>
                <Text style={s.headerTitle}>Backup & Restore</Text>
                <Text style={s.headerSub}>Keep your chats safe on Google Drive</Text>
            </View>

            <ScrollView contentContainerStyle={s.scroll}>
                <View style={s.card}>
                    <View style={s.cardRow}>
                        <View style={s.driveIcon}>
                            <Text style={s.driveIconText}>G</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle}>Google Drive</Text>
                            {userEmail ? (
                                <>
                                    <Text style={s.cardMeta}>{userEmail}</Text>
                                    {backupInfo ? (
                                        <>
                                            <Text style={s.cardMeta}>Last backup: {formatDate(backupInfo.modifiedTime)}</Text>
                                            <Text style={s.cardMeta}>Size: {formatBytes(backupInfo.size)}</Text>
                                        </>
                                    ) : (
                                        <Text style={s.cardMetaDim}>No backup found</Text>
                                    )}
                                </>
                            ) : (
                                <Text style={s.cardMetaDim}>Not connected</Text>
                            )}
                        </View>

                        {connecting ? (
                            <ActivityIndicator size="small" color="#4ade80" />
                        ) : userEmail ? (
                            <TouchableOpacity onPress={disconnectGoogle} style={s.disconnectBtn}>
                                <Text style={s.disconnectText}>Disconnect</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity onPress={connectGoogle} style={s.connectBtn}>
                                <Text style={s.connectText}>Connect</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                <View style={[s.actionCard, !userEmail && s.cardDisabled]}>
                    <View style={s.actionInfo}>
                        <Text style={s.actionIcon}>☁️</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={s.actionTitle}>Back Up Now</Text>
                            <Text style={s.actionDesc}>
                                Upload your current database to Google Drive. Previous backup will be replaced.
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={[s.btnPrimary, !userEmail && s.btnDisabled]}
                        onPress={() => runAction("backup")}
                        disabled={!userEmail}
                    >
                        <Text style={s.btnPrimaryText}>Back Up</Text>
                    </TouchableOpacity>
                </View>

                <View style={[s.actionCard, (!userEmail || !backupInfo) && s.cardDisabled]}>
                    <View style={s.actionInfo}>
                        <Text style={s.actionIcon}>📲</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={s.actionTitle}>Restore Backup</Text>
                            <Text style={s.actionDesc}>
                                Download and restore your backup from Google Drive. Current data will be overwritten.
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={[s.btnSecondary, (!userEmail || !backupInfo) && s.btnDisabled]}
                        onPress={confirmRestore}
                        disabled={!userEmail || !backupInfo}
                    >
                        <Text style={s.btnSecondaryText}>Restore</Text>
                    </TouchableOpacity>
                </View>

                <View style={s.note}>
                    <Text style={s.noteText}>
                        ⚠️ After restoring, the app must be restarted for changes to take effect.
                    </Text>
                </View>
            </ScrollView>

            {/* Progress Modal */}
            <Modal visible={modalVisible} transparent animationType="fade">
                <View style={s.overlay}>
                    <View style={s.modalBox}>
                        <Text style={s.modalTitle}>
                            {activeAction === "backup" ? "Backing Up..." : "Restoring..."}
                        </Text>

                        {status === "loading" && (
                            <>
                                <ActivityIndicator size="large" color="#4ade80" style={{ marginVertical: 20 }} />
                                <Text style={s.progressMsg}>{progressMsg}</Text>
                            </>
                        )}

                        {status === "success" && (
                            <>
                                <Text style={s.successIcon}>✅</Text>
                                <Text style={s.progressMsg}>{progressMsg}</Text>
                                <TouchableOpacity
                                    style={[s.btnPrimary, { width: "100%", marginTop: 12 }]}
                                    onPress={closeModal}
                                >
                                    <Text style={s.btnPrimaryText}>Done</Text>
                                </TouchableOpacity>
                            </>
                        )}

                        {status === "error" && (
                            <>
                                <Text style={s.errorIcon}>❌</Text>
                                <Text style={s.errorMsg}>{progressMsg}</Text>
                                <TouchableOpacity
                                    style={[s.btnSecondary, { width: "100%", marginTop: 12 }]}
                                    onPress={closeModal}
                                >
                                    <Text style={s.btnSecondaryText}>Close</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

export default BackupScreen;

const s = StyleSheet.create({
    header: {
        paddingTop: 60, paddingBottom: 24, paddingHorizontal: 24,
        borderBottomWidth: 1, borderBottomColor: "#1e1e2a",
    },
    headerTitle: { fontSize: 26, fontWeight: "700", color: "#f0f0f5", letterSpacing: 0.3 },
    headerSub: { fontSize: 13, color: "#5a5a72", marginTop: 4 },

    scroll: { padding: 20, gap: 16 },

    card: {
        backgroundColor: "#13131a", borderRadius: 16,
        padding: 16, borderWidth: 1, borderColor: "#1e1e2a",
    },
    cardRow: { flexDirection: "row", alignItems: "center", gap: 14 },
    cardDisabled: { opacity: 0.5 },
    driveIcon: {
        width: 44, height: 44, borderRadius: 12,
        backgroundColor: "#1a2a4a", justifyContent: "center", alignItems: "center",
    },
    driveIconText: { fontSize: 20, fontWeight: "800", color: "#4b9fff" },
    cardTitle: { fontSize: 15, fontWeight: "600", color: "#e0e0ea" },
    cardMeta: { fontSize: 12, color: "#5a5a72", marginTop: 2 },
    cardMetaDim: { fontSize: 12, color: "#3a3a50", marginTop: 2 },

    connectBtn: {
        backgroundColor: "#1a3a2a", borderRadius: 8,
        paddingHorizontal: 12, paddingVertical: 7,
        borderWidth: 1, borderColor: "#2a5a3a",
    },
    connectText: { fontSize: 12, color: "#4ade80", fontWeight: "600" },
    disconnectBtn: {
        backgroundColor: "#2a1a1a", borderRadius: 8,
        paddingHorizontal: 12, paddingVertical: 7,
        borderWidth: 1, borderColor: "#4a2a2a",
    },
    disconnectText: { fontSize: 12, color: "#f87171", fontWeight: "600" },

    actionCard: {
        backgroundColor: "#13131a", borderRadius: 16,
        padding: 18, borderWidth: 1, borderColor: "#1e1e2a", gap: 14,
    },
    actionInfo: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
    actionIcon: { fontSize: 28 },
    actionTitle: { fontSize: 15, fontWeight: "600", color: "#e0e0ea", marginBottom: 4 },
    actionDesc: { fontSize: 12, color: "#5a5a72", lineHeight: 18 },

    btnPrimary: {
        backgroundColor: "#4ade80", borderRadius: 12,
        paddingVertical: 13, alignItems: "center",
    },
    btnPrimaryText: { color: "#0a0a0f", fontWeight: "700", fontSize: 15 },

    btnSecondary: {
        backgroundColor: "transparent", borderRadius: 12,
        paddingVertical: 13, alignItems: "center",
        borderWidth: 1, borderColor: "#2e2e3e",
    },
    btnSecondaryText: { color: "#e0e0ea", fontWeight: "600", fontSize: 15 },
    btnDisabled: { opacity: 0.4 },

    note: {
        backgroundColor: "#1a1208", borderRadius: 12,
        padding: 14, borderWidth: 1, borderColor: "#2e2208",
    },
    noteText: { fontSize: 12, color: "#a07830", lineHeight: 18 },

    overlay: {
        flex: 1, backgroundColor: "rgba(0,0,0,0.75)",
        justifyContent: "center", alignItems: "center", padding: 24,
    },
    modalBox: {
        backgroundColor: "#13131a", borderRadius: 20,
        padding: 28, width: "100%", alignItems: "center",
        borderWidth: 1, borderColor: "#1e1e2a", gap: 8,
    },
    modalTitle: { fontSize: 18, fontWeight: "700", color: "#f0f0f5", marginBottom: 4 },
    progressMsg: { fontSize: 13, color: "#5a5a72", textAlign: "center" },
    successIcon: { fontSize: 48, marginVertical: 8 },
    errorIcon: { fontSize: 48, marginVertical: 8 },
    errorMsg: { fontSize: 13, color: "#f87171", textAlign: "center" },
});
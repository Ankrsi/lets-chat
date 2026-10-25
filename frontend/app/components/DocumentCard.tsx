import { colors } from "@/theme";
import { downloadFile, DownloadCancelled } from "@/utils/download";
import { documentKind, formatBytes } from "@/utils/media";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// Where each file was saved this session, so the card keeps its "saved" state across re-renders
const savedThisSession = new Map<string, string>();

interface Props {
  url?: string;
  name: string;
  size?: number | null;
  mimeType?: string;
  /** Preview mode (before sending): shows the card without download behaviour. */
  preview?: boolean;
  /** Long press on the card (message options) */
  onLongPress?: () => void;
}

export default function DocumentCard({ url, name, size, mimeType, preview, onLongPress }: Props) {
  const kind = documentKind(name, mimeType);
  const sizeText = formatBytes(size);
  const [progress, setProgress] = useState<number | null>(null);
  const [saved, setSaved] = useState<string | null>(url ? savedThisSession.get(url) ?? null : null);
  const downloading = progress !== null;

  const startDownload = async () => {
    if (!url) return;
    setProgress(0);
    try {
      const where = await downloadFile(url, name, mimeType, setProgress);
      savedThisSession.set(url, where);
      setSaved(where);
    } catch (err: any) {
      if (!(err instanceof DownloadCancelled)) {
        Alert.alert("Download failed", err?.message || "Couldn't download this file. Try again.");
      }
    } finally {
      setProgress(null);
    }
  };

  const onPress = () => {
    if (preview || downloading) return;
    if (!url) return Alert.alert("Unavailable", "This document has no download link.");
    Alert.alert(
      saved ? "Download again?" : "Download file?",
      `"${name}"${sizeText ? ` (${sizeText})` : ""}\n\nOnly download files from people you trust. Files can contain harmful content.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Download", onPress: startDownload },
      ],
    );
  };

  const meta = downloading
    ? `Downloading… ${Math.round((progress ?? 0) * 100)}%`
    : saved ?? [kind.label, sizeText].filter(Boolean).join(" · ");

  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={preview ? 1 : 0.7} style={[styles.card, preview && styles.cardPreview]}>
      <View style={[styles.iconBox, preview && styles.iconBoxPreview, { backgroundColor: kind.color + "1A" }]}>
        <Ionicons name={kind.icon} size={preview ? 34 : 22} color={kind.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, preview && styles.namePreview]} numberOfLines={2}>{name}</Text>
        <Text style={[styles.meta, saved && !downloading && styles.metaSaved]} numberOfLines={1}>{meta}</Text>
        {downloading && (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round((progress ?? 0) * 100)}%` }]} />
          </View>
        )}
      </View>
      {!preview && (
        downloading
          ? <ActivityIndicator size="small" color={colors.primary} />
          : <Ionicons name={saved ? "checkmark-circle" : "download-outline"} size={22} color={saved ? colors.success : colors.textSecondary} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderRadius: 12,
    padding: 10,
    minWidth: 220,
    maxWidth: 260,
  },
  cardPreview: { backgroundColor: "#FFFFFF", padding: 18, borderRadius: 18, minWidth: 0, maxWidth: 360, width: "86%", gap: 14 },
  iconBox: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  iconBoxPreview: { width: 64, height: 64, borderRadius: 16 },
  name: { fontSize: 14, fontWeight: "600", color: colors.text },
  namePreview: { fontSize: 16 },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  metaSaved: { color: colors.success, fontWeight: "600" },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 6, overflow: "hidden" },
  fill: { height: 4, backgroundColor: colors.primary },
});

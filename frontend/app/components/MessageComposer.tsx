import { colors } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { RoomStyles } from "../styles";

export interface ComposerHandle {
  setText: (value: string) => void;
  insert: (value: string) => void;
  focus: () => void;
}

interface Props {
  emojiOpen: boolean;
  onToggleEmoji: () => void;
  onFocusInput: () => void;
  onAttach: () => void;
  onCamera: () => void;
  onCameraVideo: () => void;
  onSend: (text: string) => void;
  onTyping: () => void;
  onStartRecord: () => Promise<boolean>;
  onStopRecord: () => void;
}

const MessageComposer = React.memo(forwardRef<ComposerHandle, Props>(function MessageComposer(
  { emojiOpen, onToggleEmoji, onFocusInput, onAttach, onCamera, onCameraVideo, onSend, onTyping, onStartRecord, onStopRecord },
  ref,
) {
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);
  // Recording indicator while the mic is held
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (recordingSince === null) return;
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [recordingSince]);

  const pressMic = async () => {
    setRecordingSince(Date.now());
    if (!(await onStartRecord())) setRecordingSince(null);
  };
  const releaseMic = () => {
    setRecordingSince(null);
    onStopRecord();
  };
  const elapsed = recordingSince ? Math.floor((Date.now() - recordingSince) / 1000) : 0;

  useImperativeHandle(ref, () => ({
    setText: (value: string) => setText(value),
    insert: (value: string) => {
      setText((prev) => prev + value);
      onTyping();
    },
    focus: () => inputRef.current?.focus(),
  }), [onTyping]);

  const change = (value: string) => {
    setText(value);
    if (value) onTyping();
  };

  const send = () => {
    const value = text;
    if (!value.trim()) return;
    // Clear the native field directly (a controlled multiline input can lag waiting for JS),
    // then start the send on the next frame so the empty box paints before the send work runs
    inputRef.current?.clear();
    setText("");
    requestAnimationFrame(() => onSend(value));
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
      {recordingSince !== null ? (
        <View style={[RoomStyles.inputContainer, { alignItems: "center" }]}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger }} />
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text }}>
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </Text>
          <Text style={{ flex: 1, fontSize: 13, color: colors.textSecondary, textAlign: "right" }}>
            {elapsed < 1 ? "Hold to record" : "Release to send"}
          </Text>
        </View>
      ) : (
      <View style={RoomStyles.inputContainer}>
        <TouchableOpacity onPress={onToggleEmoji}>
          <Ionicons
            name={emojiOpen ? "keypad" : "happy-outline"}
            size={22}
            color={emojiOpen ? colors.primary : colors.textMuted}
          />
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          placeholder="Message"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={change}
          style={RoomStyles.textInput}
          multiline
          onFocus={onFocusInput}
        />
        <TouchableOpacity onPress={onAttach} hitSlop={6} accessibilityLabel="Attach">
          <Ionicons name="attach" size={22} color={colors.textMuted} />
        </TouchableOpacity>
        {/* Hidden while typing (like WhatsApp) to leave room for the text */}
        {!text && (
          <TouchableOpacity onPress={onCamera} onLongPress={onCameraVideo} delayLongPress={350} hitSlop={6} accessibilityLabel="Camera: tap for photo, hold for video">
            <Ionicons name="camera-outline" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      )}

      {!text ? (
        <TouchableOpacity
          style={[RoomStyles.sendBtn, recordingSince !== null && { backgroundColor: colors.danger, transform: [{ scale: 1.12 }] }]}
          onPressIn={pressMic}
          onPressOut={releaseMic}
          accessibilityLabel="Hold to record a voice message"
        >
          <Ionicons name="mic" size={22} color="#fff" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={send} style={RoomStyles.sendBtn}>
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}));

export default MessageComposer;

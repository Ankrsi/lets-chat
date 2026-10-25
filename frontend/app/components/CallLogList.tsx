import React, { useCallback, useContext, useState } from "react";
import {
    View, Text, FlatList, TouchableOpacity,
} from "react-native";
import { getCallLogs } from "@/db/callsRepo";
import { useFocusEffect } from "expo-router";
import { ContactContext } from "@/contexts/FriendContactContext";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { CallLogsStyles } from "../styles";
import { colors } from "@/theme";
import { getGlobalUsername } from "@/utils/globalRefs";
import { useDbUpdate } from "@/contexts/DbUpdateContext";

// Call history list, shown in the "Calls" section of the Chats tab
const CallLogList = () => {
    const { dbTick } = useDbUpdate();
    const username = getGlobalUsername();
    const { viewName } = useContext(ContactContext);
    const [calls, setCalls] = useState<any[]>([]);

    useFocusEffect(
        useCallback(() => {
            (async () => {
                const data = await getCallLogs();
                setCalls(data ?? []);
            })();
        }, [dbTick])
    );

    const getUserProfile = (memberId: any) => {
        const details = viewName.get(memberId);
        if (!details) return { name: memberId, phone: memberId, profile_image: null };
        if (details.name === 'SelfMe') details.name = 'Me';
        return details;
    };

    function formatDuration(ms: number) {
        if (!ms || ms <= 0) return '00:00';
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0) {
            return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
        }
        return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
    }

    function formatTime(dateStr: string) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const isYesterday = date.toDateString() === yesterday.toDateString();
        const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (isToday) return `Today, ${time}`;
        if (isYesterday) return `Yesterday, ${time}`;
        return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + `, ${time}`;
    }

    const renderItem = ({ item }: any) => {
        const isOutgoing = item.callerId === username;
        const isMissed = item.status === 'missed';
        const isRinging = item.status === 'ringing';
        const profile = getUserProfile(item?.callerId);
        const initials = (profile.name || 'U')
            .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

        const duration = formatDuration(
            Math.max(0, new Date(item.endedAt).getTime() - new Date(item.startedAt).getTime())
        );

        const statusText = isMissed
            ? 'Missed call'
            : isRinging
            ? 'No answer'
            : duration;

        return (
            <TouchableOpacity style={CallLogsStyles.row} activeOpacity={0.7}>

                {/* Avatar */}
                <View style={CallLogsStyles.avatarWrap}>
                    {profile.profile_image ? (
                        <Image
                            source={{ uri: profile.profile_image }}
                            style={CallLogsStyles.avatar}
                            cachePolicy="disk"
                        />
                    ) : (
                        <View style={CallLogsStyles.avatarFallback}>
                            <Text style={CallLogsStyles.avatarInitials}>{initials}</Text>
                        </View>
                    )}
                </View>

                {/* Info */}
                <View style={CallLogsStyles.info}>
                    <Text style={CallLogsStyles.name} numberOfLines={1}>
                        {profile.name || 'Unknown'}
                    </Text>
                    <View style={CallLogsStyles.subRow}>
                        {/* Direction arrow */}
                        <Ionicons
                            name={isOutgoing ? 'arrow-up-outline' : 'arrow-down-outline'}
                            size={13}
                            color={isMissed || isRinging ? colors.danger : colors.success}
                        />
                        <Text style={[
                            CallLogsStyles.statusText,
                            (isMissed || isRinging) && CallLogsStyles.statusMissed,
                        ]}>
                            {statusText}
                        </Text>
                        <Text style={CallLogsStyles.dot}>·</Text>
                        <Text style={CallLogsStyles.timeText}>{formatTime(item.startedAt)}</Text>
                    </View>
                </View>

                {/* Call type button */}
                <TouchableOpacity
                    style={CallLogsStyles.callTypeBtn}
                    hitSlop={10}
                >
                    <Ionicons
                        name={item.type === 'audio' ? 'call-outline' : 'videocam-outline'}
                        size={22}
                        color={colors.primary}
                    />
                </TouchableOpacity>

            </TouchableOpacity>
        );
    };

    return (
        <View style={CallLogsStyles.body}>

            {/* Section label */}
            {calls.length > 0 && (
                <Text style={CallLogsStyles.sectionLabel}>RECENT</Text>
            )}

            <FlatList
                data={calls}
                keyExtractor={(item) => item.callId}
                renderItem={renderItem}
                ItemSeparatorComponent={() => <View style={CallLogsStyles.separator} />}
                contentContainerStyle={{ paddingBottom: 20 }}
                ListEmptyComponent={
                    <View style={CallLogsStyles.empty}>
                        <View style={CallLogsStyles.emptyIcon}>
                            <Ionicons name="call-outline" size={32} color={colors.primary} />
                        </View>
                        <Text style={CallLogsStyles.emptyTitle}>No call logs</Text>
                        <Text style={CallLogsStyles.emptySub}>Your recent calls will appear here</Text>
                    </View>
                }
            />
        </View>
    );
};

export default CallLogList;

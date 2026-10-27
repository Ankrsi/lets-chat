import { useEffect, useRef } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
} from 'react-native';

interface Props {
    visible: boolean;
    onCancel: () => void;
}

export default function NewDeviceNotifyModal({ visible, onCancel }: Props) {
    const slideAnim = useRef(new Animated.Value(100)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 60,
                    friction: 8,
                    useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 60,
                    friction: 8,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 0.9,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible]);

    return (
        <Modal transparent visible={visible} animationType="none">
            {/* Backdrop */}
            <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
                <Animated.View
                    style={[
                        styles.card,
                        {
                            opacity: fadeAnim,
                            transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
                        },
                    ]}
                >
                    {/* Icon */}
                    <View style={styles.iconWrapper}>
                        <View style={styles.iconRing}>
                            <Text style={styles.icon}>🔐</Text>
                        </View>
                    </View>

                    {/* Content */}
                    <Text style={styles.title}>New Device Detected</Text>
                    <Text style={styles.subtitle}>
                        You're trying to login from a new device.
                    </Text>

                    {/* Warning box */}
                    <View style={styles.warningBox}>
                        <Text style={styles.warningIcon}>⚠️</Text>
                        <Text style={styles.warningText}>
                            Please take a{' '}
                            <Text style={styles.warningBold}>Chat Backup</Text>{' '}
                            before continuing. Your messages may not transfer automatically.
                        </Text>
                    </View>

                    {/* Buttons */}
                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={styles.cancelBtn}
                            onPress={onCancel}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.anywayBtn}
                            // onPress={onAnyway}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.anywayText}>BackUp</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 28,
        width: '100%',
        maxWidth: 360,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.25,
        shadowRadius: 40,
        elevation: 20,
    },

    // Icon
    iconWrapper: {
        marginBottom: 20,
    },
    iconRing: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#FFF3E0',
        borderWidth: 2,
        borderColor: '#FFB74D',
        justifyContent: 'center',
        alignItems: 'center',
    },
    icon: {
        fontSize: 32,
    },

    // Text
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1A1A2E',
        marginBottom: 8,
        textAlign: 'center',
        letterSpacing: -0.3,
    },
    subtitle: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 20,
    },

    // Warning box
    warningBox: {
        flexDirection: 'row',
        backgroundColor: '#FFF8E1',
        borderRadius: 12,
        padding: 14,
        marginBottom: 24,
        borderLeftWidth: 3,
        borderLeftColor: '#F59E0B',
        alignItems: 'flex-start',
        gap: 10,
    },
    warningIcon: {
        fontSize: 16,
        marginTop: 1,
    },
    warningText: {
        flex: 1,
        fontSize: 13,
        color: '#78350F',
        lineHeight: 19,
    },
    warningBold: {
        fontWeight: '700',
        color: '#92400E',
    },

    // Buttons
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
    },
    cancelText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#374151',
    },
    anywayBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: '#EF4444',
        alignItems: 'center',
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    anywayText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },
});
import React, { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet } from "react-native";

export default function BottomSheet({ visible, onClose, sheetHeight = 350, children }: any) {
    const slideAnim = useRef(new Animated.Value(sheetHeight)).current;

    useEffect(() => {
        if (visible) {
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: sheetHeight,
                duration: 200,
                useNativeDriver: true
            }).start();
        }
    }, [visible]);

    return (
        <Modal transparent visible={visible} animationType="fade">

            {/* Dark background overlay */}
            <Pressable style={styles.overlay} onPress={onClose} />

            {/* Bottom sheet */}
            <Animated.View
                style={[
                    styles.sheet,
                    {
                        height: sheetHeight,
                        transform: [{ translateY: slideAnim }]
                    }
                ]}
            >
                {children}
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)"
    },
    sheet: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "#ffffff",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        elevation: 20
    }
});


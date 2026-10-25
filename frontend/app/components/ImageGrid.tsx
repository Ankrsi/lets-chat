import React, { useState } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
} from "react-native";
import ImageViewing from "react-native-image-viewing";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";

const MAX_WIDTH = Dimensions.get("window").width * 0.62;
const GAP = 3;
const RADIUS = 12;

type ImageItem = { url?: string } | string;

interface Props {
    urls: ImageItem[];
    caption?: any[]; // per-image captions (older messages); new captions render in the bubble
    /** Long press on the card (message options) */
    onLongPress?: () => void;
}

const ImageGrid: React.FC<Props> = ({ urls = [], caption = [], onLongPress }) => {
    const count = urls.length;

    const [visible, setVisible] = useState(false);
    const [index, setIndex] = useState(0);
    // Images that failed to load (bad or unreachable URL): show a placeholder instead
    const [failed, setFailed] = useState<Record<number, boolean>>({});

    const images = urls.map((u: any) => ({
        uri: u?.url || u,
    }));

    const openViewer = (i: number) => {
        if (failed[i]) return; // the full-screen viewer would only spin forever
        setIndex(i);
        setVisible(true);
    };

    const render = (
        img: ImageItem,
        style: any,
        index: number,
        cornerStyle?: any,
        overlay?: React.ReactNode,
    ) => (
        <TouchableOpacity key={index} activeOpacity={0.9} onPress={() => openViewer(index)} onLongPress={onLongPress}>
            {failed[index] ? (
                <View style={[style, cornerStyle, styles.failed]}>
                    <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                    <Text style={styles.failedText}>Image unavailable</Text>
                </View>
            ) : (
                <Image
                    source={{ uri: (img as any)?.url || img }}
                    style={[style, cornerStyle, styles.loading]}
                    cachePolicy="disk"
                    transition={150}
                    onError={(e) => {
                        console.info("chat image failed to load", (img as any)?.url || img, e?.error);
                        setFailed((prev) => ({ ...prev, [index]: true }));
                    }}
                />
            )}
            {overlay}
            {!!caption[index] && <Text style={styles.caption}>{caption[index]}</Text>}
        </TouchableOpacity>
    );

    // ===== 1 IMAGE =====
    if (count === 1) {
        return (
            <>
                {render(urls[0], styles.single, 0)}
                <ImageViewing
                    images={images}
                    imageIndex={index}
                    visible={visible}
                    onRequestClose={() => setVisible(false)}
                />
            </>
        )
    }

    // ===== 2 IMAGES =====
    if (count === 2) {
        return (
            <>
                <View style={styles.row}>
                    {/* {urls.map((img, i) => render(img, styles.half, i))} */}
                    {render(urls[0], styles.half, 0, { borderTopLeftRadius: RADIUS, borderBottomLeftRadius: RADIUS })}
                    {render(urls[1], styles.half, 1, { borderTopRightRadius: RADIUS, borderBottomRightRadius: RADIUS })}
                </View>
                <ImageViewing
                    images={images}
                    imageIndex={index}
                    visible={visible}
                    onRequestClose={() => setVisible(false)}
                />
            </>
        );
    }

    // ===== 3 IMAGES =====
    if (count === 3) {
        return (
            <>
                <View>
                    <View style={styles.row}>
                        {render(urls[0], styles.half, 0, { borderTopLeftRadius: RADIUS })}
                        {render(urls[1], styles.half, 1, { borderTopRightRadius: RADIUS })}
                    </View>
                    {render(urls[2], styles.full, 2, { borderBottomLeftRadius: RADIUS, borderBottomRightRadius: RADIUS })}
                </View>
                <ImageViewing
                    images={images}
                    imageIndex={index}
                    visible={visible}
                    onRequestClose={() => setVisible(false)}
                />
            </>
        );
    }

    // ===== 4+ IMAGES =====
    const display = urls.slice(0, 4);

    return (
        <>
            <View>
                <View style={styles.row}>
                    {render(display[0], styles.half, 0, { borderTopLeftRadius: RADIUS })}
                    {render(display[1], styles.half, 1, { borderTopRightRadius: RADIUS })}
                </View>

                <View style={styles.row}>
                    {render(display[2], styles.half, 2, { borderBottomLeftRadius: RADIUS })}

                    {render(
                        display[3],
                        styles.half,
                        3,
                        { borderBottomRightRadius: RADIUS },
                        count > 4 ? (
                            <View style={styles.overlay}>
                                <Text style={styles.overlayText}>+{count - 4}</Text>
                            </View>
                        ) : null
                    )}
                </View>
            </View>
            <ImageViewing
                images={images}
                imageIndex={index}
                visible={visible}
                onRequestClose={() => setVisible(false)}
            />
        </>
    );
};

export default ImageGrid;

const styles = StyleSheet.create({
    row: {
        flexDirection: "row",
    },

    single: {
        width: MAX_WIDTH,
        height: MAX_WIDTH,
        borderRadius: RADIUS,
    },

    half: {
        width: (MAX_WIDTH - GAP) / 2,
        height: (MAX_WIDTH - GAP) / 2,
        marginRight: GAP,
        marginBottom: GAP,
    },

    full: {
        width: MAX_WIDTH,
        height: MAX_WIDTH * 0.65,
        marginBottom: GAP,
        borderRadius: 10,
    },

    overlay: {
        position: "absolute",
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0,0,0,0.6)",
        justifyContent: "center",
        alignItems: "center",
        borderRadius: 10,
    },

    overlayText: {
        color: "#fff",
        fontSize: 26,
        fontWeight: "bold",
    },

    // Light tile while the image downloads
    loading: { backgroundColor: colors.surfaceAlt },
    failed: {
        backgroundColor: colors.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
    },
    failedText: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
    caption: { fontSize: 14, color: colors.text, marginTop: 4 },
});
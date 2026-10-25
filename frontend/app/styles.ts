import { Platform, StyleSheet } from "react-native";
import { colors, font, radius, shadow } from "@/theme";

export const startStyle = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#FFFFFF' },

    // Green top
    topSection: {
        flex: 1,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        borderBottomLeftRadius: 52,
        borderBottomRightRadius: 52,
        overflow: 'hidden',
    },
    bubble: {
        position: 'absolute',
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.07)',
    },
    bubbleLg: { width: 210, height: 210, top: -50, right: -55 },
    bubbleSm: { width: 130, height: 130, bottom: 10, left: -35 },

    // Logo
    logoCircle: {
        width: 118,
        height: 118,
        borderRadius: 59,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 18,
        elevation: 12,
    },
    logoEmoji: { fontSize: 58 },

    // White bottom
    bottomSection: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingBottom: Platform.OS === 'android' ? 25 : 50,
    },

    // Text
    textBlock: { alignItems: 'center', marginBottom: 16 },
    appName: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.5, marginBottom: 6 },
    tagline: { fontSize: 15, color: colors.textSecondary, letterSpacing: 0.2 },
    description: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 10, paddingHorizontal: 16 },

    // Dots
    dots: { flexDirection: 'row', gap: 6, marginBottom: 36 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
    dotActive: { width: 20, backgroundColor: colors.primary },

    // Buttons
    ctaWrap: { width: '100%', alignItems: 'center', gap: 12, marginBottom: 30 },
    btnGreen: {
        backgroundColor: colors.primary,
        paddingVertical: 16,
        paddingHorizontal: 60,
        borderRadius: 32,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 6,
    },
    btnGreenText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
    btnGhost: { paddingVertical: 10, paddingHorizontal: 24 },
    btnGhostText: { color: colors.primary, fontSize: 15, fontWeight: '600' },

    // Terms
    terms: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18, paddingHorizontal: 10 },
    termsLink: { color: colors.primary, fontWeight: '600' },
})

export const LoginStyles = StyleSheet.create({
    scroll: {
        flexGrow: 1,
        backgroundColor: colors.surface,
        paddingBottom: 32,
    },

    // Header
    header: {
        alignItems: 'flex-start',
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'android' ? 56 : 80,
        paddingBottom: 16,
        backgroundColor: colors.surface,
    },
    headerEmoji: { fontSize: 52, marginBottom: 12 },
    headerTitle: {
        fontSize: 30,
        fontWeight: '800',
        color: colors.text,
        letterSpacing: -0.8,
    },
    headerSub: {
        fontSize: 16,
        color: colors.textSecondary,
        marginTop: 6,
        fontWeight: '500',
    },
    headerDesc: {
        fontSize: 14,
        color: colors.textMuted,
        marginTop: 8,
        lineHeight: 20,
    },

    // Card
    card: {
        marginHorizontal: 24,
        marginTop: 12,
        backgroundColor: colors.surface,
    },

    // Tabs
    tabRow: {
        flexDirection: 'row',
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.md,
        padding: 4,
        marginBottom: 24,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: radius.sm,
    },
    tabActive: { backgroundColor: colors.surface, ...shadow(1) },
    tabText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
    tabTextActive: { color: colors.text, fontWeight: '700' },

    // Form
    formBlock: { gap: 4 },
    inputLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textSecondary,
        marginBottom: 8,
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: colors.surfaceAlt,
        borderRadius: radius.md,
        paddingHorizontal: 14,
        backgroundColor: colors.surfaceAlt,
        minHeight: 54,
    },
    inputIcon: { marginRight: 10 },
    input: {
        flex: 1,
        fontSize: 16,
        color: colors.text,
        paddingVertical: Platform.OS === 'android' ? 12 : 15,
    },
    hint: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 8,
        marginBottom: 4,
    },

    // Button
    btn: {
        backgroundColor: colors.primary,
        height: 54,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24,
        ...shadow(2),
        shadowColor: colors.primary,
    },
    btnText: {
        color: colors.textOnPrimary,
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.2,
    },

    // Footer
    footer: {
        marginTop: 'auto',
        paddingTop: 28,
        fontSize: 12,
        color: colors.textMuted,
        textAlign: 'center',
        paddingHorizontal: 32,
        lineHeight: 18,
    },
    footerLink: { color: colors.primary, fontWeight: '600' },
});

export const VerifyStyles = StyleSheet.create({
    // Header
    header: {
        alignItems: 'flex-start',
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'android' ? 56 : 80,
        paddingBottom: 12,
        backgroundColor: colors.surface,
    },
    backBtn: {
        position: 'absolute',
        top: Platform.OS === 'android' ? 14 : 56,
        left: 20,
        padding: 8,
    },
    backIcon: { fontSize: 22, color: colors.text },
    headerEmoji: { fontSize: 52, marginBottom: 12 },
    headerTitle: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.8 },
    headerSub: { fontSize: 16, color: colors.textSecondary, marginTop: 6, fontWeight: '500' },
    headerHighlight: { color: colors.text, fontWeight: '700' },
    headerDesc: { fontSize: 14, color: colors.textMuted, marginTop: 8, lineHeight: 20 },
    warningBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.dangerSoft,
        borderRadius: radius.pill,
        paddingVertical: 6,
        paddingHorizontal: 12,
        marginTop: 14,
    },
    warningText: { fontSize: 12, color: colors.danger, fontWeight: '600' },

    // Card
    card: {
        marginHorizontal: 24,
        marginTop: 8,
        backgroundColor: colors.surface,
    },

    // Input
    inputLabel: { fontSize: 13, marginTop: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: colors.surfaceAlt,
        borderRadius: radius.md,
        paddingHorizontal: 14,
        backgroundColor: colors.surfaceAlt,
        minHeight: 60,
    },
    inputIcon: { marginRight: 10 },
    input: {
        flex: 1,
        fontSize: 24,
        fontWeight: '700',
        color: colors.text,
        letterSpacing: 10,
        paddingVertical: Platform.OS === 'android' ? 12 : 14,
    },
    hint: { fontSize: 12, color: colors.textMuted, marginTop: 8, marginBottom: 4 },

    // Buttons
    btnPrimary: {
        backgroundColor: colors.primary,
        height: 54,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24,
        ...shadow(2),
        shadowColor: colors.primary,
    },
    btnPrimaryText: { color: colors.textOnPrimary, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
    btnGhost: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
    btnGhostText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});

export const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#0a0a0f",
        paddingTop: 25,
    },

    /* HEADER */
    header: {
        flexDirection: "row",
        alignItems: "center"
    },
    profile: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    headerTitle: {
        color: "white",
        fontSize: 26,
        fontWeight: "600",
        marginLeft: 12,
    },
    headerRight: {
        flexDirection: "row",
        marginLeft: "auto",
        gap: 2,
    },
    iconButton: {
        marginLeft: 10,
    },
    iconText: {
        color: "#4ade80",
        fontSize: 22,
    },

    /* POPUP MENU */
    popupBackground: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
        zIndex: 100,
    },

    popup: {
        position: 'absolute',
        right: 10,
        top: 40,
        width: 180,
        backgroundColor: '#fff',
        paddingVertical: 10,
        borderRadius: 10,
        elevation: 5,
    },
    popupItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10
    },
    popupIcon: {
        fontSize: 17,
        marginRight: 10,
    },
    popupText: {
        fontSize: 16,
        color: "#333",
    },

    /* SEARCH BAR */
    searchBar: {
        marginVertical: 20,
        paddingHorizontal: 15,
        flexDirection: "row",
        alignItems: "center",
        height: 48,
        backgroundColor: "#13131a",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#1e1e2a",
    },
    searchIcon: {
        color: "#BEBED8",
        fontSize: 18,
        marginRight: 10,
    },
    searchInput: {
        color: "white",
        fontSize: 16,
        flex: 1,
    },

    /* CHAT LIST */
    chatRow: {
        flexDirection: "row",
        paddingHorizontal: 12,
        paddingVertical: 5,
        marginBottom: 2,
    },
    chatAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
    },
    chatContent: {
        flex: 1,
        marginLeft: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#1e1e2a",
    },
    chatTopRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    chatName: {
        color: "white",
        fontSize: 16,
        fontWeight: "600",
        flex: 1,
    },
    chatDate: {
        color: "#C8C8D3",
        fontSize: 13,
    },
    chatMsg: {
        fontWeight: "300",
        color: "#DCDCEF",
        marginTop: 4,
        marginBottom: 10,
    },
    line: {
        height: 1,
        backgroundColor: "#8A86C2",
        marginTop: 4,
    },
    chatUnreadMsg: {
        backgroundColor: "#25d366",
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginTop: 5,
    },
    chatUnreadMsgText: { color: "white", fontSize: 12 },

    /* BOTTOM TABS */
    bottomTabs: {
        flexDirection: "row",
        height: 80,
        borderTopWidth: 1,
        borderTopColor: "#4c4b50",
        backgroundColor: "#13131a",
        justifyContent: "space-around",
        alignItems: "center",
    },

    tabItem: {
        alignItems: "center",
    },
    tabItemActive: {
        alignItems: "center",
    },
    tabIcon: { color: "#A0A0C2", fontSize: 26 },
    tabIconActive: { color: "#00E2C2", fontSize: 26 },
    tabText: { color: "#ffffff", fontSize: 12 },
    tabTextActive: { color: "#00E2C2", fontSize: 12 },
    selectedChatRow: {
        backgroundColor: "#8b8c8dff",
        borderRadius: 1,
    },

    /* room */
    message: {
        marginVertical: 4,
        padding: 10,
        borderRadius: 10,
        marginHorizontal: 8,
        maxWidth: "80%",
    },
    me: { backgroundColor: "#e2f7d3ff", alignSelf: "flex-end" },
    them: { backgroundColor: "#999494ff", alignSelf: "flex-start" },
    optionRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginVertical: 10,
    },
    menuOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.2)",
        justifyContent: "flex-start",
        alignItems: "flex-end",
        marginTop: "10%"
    },
    menuBox: {
        backgroundColor: "white",
        marginTop: 60,
        marginRight: 10,
        borderRadius: 6,
        paddingVertical: 8,
        elevation: 6,
        minWidth: 170,
        display: 'flex',
        gap: 12
    },
    chatFooter: {
        backgroundColor: "transparent",
        padding: 10,
        flexDirection: "row",
        alignItems: "flex-end",
    },
    roomOverlay: {
        position: "absolute",
        top: -1000,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "transparent",
        zIndex: 5,
    },
    inputContainer: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fff",
        borderRadius: 25,
        paddingHorizontal: 10,
        elevation: 2,
    },
    textInput: {
        flex: 1,
        paddingVertical: 15,
        paddingHorizontal: 10,
        fontSize: 15,
        color: "#000",
        maxHeight: 100
    },
    optionBox: {
        width: "100%",
        position: "absolute",
        bottom: 60,
        backgroundColor: "#fff",
        borderRadius: 15,
        padding: 12,
        elevation: 6,
        zIndex: 10,
        marginHorizontal: 10,
    },
    sendBtn: {
        backgroundColor: "#128C7E",
        width: 45,
        height: 45,
        borderRadius: 22.5,
        alignItems: "center",
        justifyContent: "center",
        marginLeft: 6,
    },
    sendIcon: {
        color: "#fff",
        fontSize: 18,
        transform: [{ rotate: "-10deg" }],
    },
    chatLists: {
        flex: 1
    },
    addUserInCall: {
        position: "absolute",
        top: 60,
        right: 25,
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: "rgba(255,255,255,0.15)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.4)",
    },
    addUserPlus: {
        color: "#fff",
        fontSize: 32,
        marginTop: -2
    },
    contactItemBottomSheet: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 15,
        paddingVertical: 12,
        borderBottomWidth: 0.5,
        borderColor: "#eee",
    },
    contactAvatarBottomSheet: {
        width: 45,
        height: 45,
        borderRadius: 25,
        marginRight: 12
    },
    contactNameBottomSheet: {
        fontSize: 16,
        fontWeight: "500",
        color: "#000"
    },
    contactSubTextBottomSheet: {
        fontSize: 13,
        color: "gray"
    },

    contactSelectedUserContainerBottomSheet: {
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 5,
        width: 70,
    },

    contactSelectedUserAvatarBottomSheet: {
        width: 50,
        height: 50,
        borderRadius: 25,
        marginBottom: 5,
    },

    contactSelectedUserNameBottomSheet: {
        fontSize: 12,
        color: "#000",
        textAlign: "center",
        width: 60,
    },

    contactRemoveBtnBottomSheet: {
        position: "absolute",
        bottom: 20,
        right: 5,
        backgroundColor: "red",
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: "center",
        justifyContent: "center",
    },

    videoCallRemote: {
        flex: 1
    },

    videoCallLocal: {
        position: "absolute",
        width: 120,
        height: 160,
        top: 70,
        left: 20,
        borderRadius: 15
    },
    videoCallEndBtn: {
        position: "absolute",
        bottom: 30,
        alignSelf: "center",
        backgroundColor: "#ff4040",
        width: 50,
        height: 50, borderRadius: 35,
        alignItems: "center",
        justifyContent: "center"
    },
    videoCallEndText: {
        color: "#fff",
        fontSize: 18
    },
    createGroupBody: {
        marginHorizontal: 15
    },
    createGroupTitle: {
        fontSize: 22,
        fontWeight: "700",
        marginBottom: 20,
        color: "#fff"
    },
    createGroupLabel: {
        fontSize: 14,
        marginBottom: 6,
        color: "#fff"
    },
    createGroupInput: {
        borderWidth: 1,
        borderColor: "#ddd",
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
        color: "#fff"
    },
    createGroupTextArea: {
        height: 100,
        textAlignVertical: "top",
    },
    createGroupBtn: {
        backgroundColor: "#0a84ff",
        padding: 15,
        borderRadius: 10,
        alignItems: "center"
    },
    createGroupBtnText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 16,
    },
    createGroupIconContainer: {
        width: 115,
        height: 115,
        borderRadius: 60,
        backgroundColor: "#eaeaea",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
    },
    createGroupIconImage: {
        width: "100%",
        height: "100%",
    },
    createGroupIconPlaceholder: {
        color: "#888",
        fontSize: 14,
    },
    createGroupIconLabel: {
        marginTop: 10,
        fontSize: 15,
        color: "#7e7e7eff",
    },

    headerSubtitle: {
        color: "#f0f0f0",
        fontSize: 13,
        marginTop: 3,
        marginLeft: 15
    },

    selectContactSearchBox: {
        paddingHorizontal: 10,
        paddingVertical: 10,
    },

    selectContactSearchInput: {
        borderRadius: 30,
        paddingHorizontal: 18,
        paddingVertical: 12,
        fontSize: 15,
        borderWidth: 0.5,
        borderColor: "#ddd",
        color: "#fff"
    },

    contactItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 15,
        paddingVertical: 12,
        borderBottomWidth: 1.5,
        borderBottomColor: "#1e1e2a",
    },
    avatar: {
        width: 45,
        height: 45,
        borderRadius: 25,
        marginRight: 12
    },
    name: {
        fontSize: 16,
        fontWeight: "500",
        color: "#fff"
    },
    subText: {
        fontSize: 13,
        color: "#bbb9b9ff"
    },
    loader: {
        flex: 1,
        position: 'absolute',
        backgroundColor: "rgba(0,0,0,0.5)",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        justifyContent: "center",
        alignItems: "center"
    },
    chatRoomVideoLog: {
        backgroundColor: "#fff",
        padding: 10,
        borderRadius: 10,
        marginVertical: 5,
        width: 175,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        flexDirection: "row",
        alignItems: "center",
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        gap: 12,
    },
    chatRoomVideoLogIcon: {
        width: 45,
        height: 45,
        borderRadius: 50,
        alignItems: "center",
        justifyContent: "center",
    },
    senderName: {
        color: "#fff",
        fontSize: 13,
        fontWeight: "600",
        marginBottom: 2,
    },
    systemMessage: {
        alignSelf: "center",
        backgroundColor: "#f0f0f0",
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 18,
        marginVertical: 10,
        maxWidth: "80%",
        alignItems: "center",
    },
    systemMessageText: {
        fontSize: 14,
        color: "#666",
        textAlign: "center",
        fontWeight: "500",
    },
    systemMessageSubText: {
        fontSize: 12,
        color: "#888",
        textAlign: "center",
        marginTop: 2,
    },
    systemMessageTime: {
        fontSize: 11,
        color: "#999",
        textAlign: "center",
        marginTop: 4,
    },
    callCard: {
        flexDirection: "row",
        alignItems: "center",
        padding: 12,
        borderRadius: 12,
        maxWidth: "75%",
        marginVertical: 4,
    },
    callIcon: {
        fontSize: 22,
        marginRight: 10,
    },
    callTitle: {
        fontSize: 14,
        fontWeight: "600",
    },
    callSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },

    /* FILTER BUTTONS */
    filterContainer: {
        flexDirection: "row",
        gap: 8,
        marginVertical: 10,
    },
    filterButton: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: "#191922",
        borderColor: "#1e1e2a",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    filterButtonActive: {
        backgroundColor: "#717974",
    },
    filterButtonText: {
        color: "#C8C8D3",
        fontSize: 12,
        fontWeight: "500",
    },
    filterButtonTextActive: {
        color: "#fff",
        fontWeight: "600",
    },
    filterBadge: {
        backgroundColor: "#E74C3C",
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 2,
        minWidth: 20,
        alignItems: "center",
        justifyContent: "center",
    },
    filterBadgeText: {
        color: "#fff",
        fontSize: 10,
        fontWeight: "700",
    },

    /* FLOATING ACTION BUTTON */
    fabContainer: {
        position: "absolute",
        bottom: "15%",
        right: 20,
        zIndex: 50,
    },
    fab: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: "#4ade80",
        alignItems: "center",
        justifyContent: "center",
        elevation: 8,
        shadowColor: "#282929",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    fabIcon: {
        color: "#fff",
        fontSize: 36,
        fontWeight: "bold",
        marginTop: -2,
    },
    fabMenu: {
        position: "absolute",
        bottom: 65,
        right: 0,
        backgroundColor: "#424244",
        borderRadius: 12,
        paddingVertical: 8,
        elevation: 8,
        minWidth: 180,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    fabMenuItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 10,
    },
    fabMenuItemIcon: {
        fontSize: 18,
    },
    fabMenuItemText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "500",
    },
    cardContactPhone: {
        fontSize: 13,
        color: "#666",
        marginVertical: 4,
    },
    cardContactActions: {
        flexDirection: "row",
        gap: 1,
        marginTop: 6,
    },
    cardContactBtn: {
        backgroundColor: "#4CAF50",
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 8,
        marginRight: 8,
    },
    cardContactBtnText: {
        color: "#fff",
        fontSize: 12,
    },
    roomMapCard: {
        borderRadius: 14,
        overflow: "hidden",
        backgroundColor: "#f2f2f2",
        elevation: 2,
    },
    roomMapMap: {
        width: 240,
        height: 140,
    },
    roomMapFooter: {
        padding: 8,
    },
    roomMapTitle: {
        fontWeight: "600",
        fontSize: 14,
    },
    roomMapCoords: {
        fontSize: 12,
        color: "#666",
    },
    editBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#075E54',
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    }
});

export const statusStyles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.surface,
        height: 64,
        paddingHorizontal: 20,
    },
    headerTitle: { flex: 1, fontSize: font.title, fontWeight: "800", color: colors.text, letterSpacing: -0.6 },
    headerBtn: {
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
    },
    myCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.surface,
        marginHorizontal: 16,
        marginTop: 16,
        padding: 14,
        borderRadius: radius.lg,
        ...shadow(1),
    },
    card: {
        backgroundColor: colors.surface,
        marginHorizontal: 16,
        borderRadius: radius.lg,
        paddingVertical: 4,
        ...shadow(1),
    },
    section: {
        fontSize: 12,
        fontWeight: "700",
        color: colors.textMuted,
        letterSpacing: 0.8,
        marginTop: 22,
        marginBottom: 8,
        marginLeft: 22,
    },
    item: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    // Ring around the avatar: accent = unseen updates, gray = viewed
    ring: {
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 2.5,
        borderColor: colors.primary,
        padding: 2.5,
        marginRight: 14,
        alignItems: "center",
        justifyContent: "center",
    },
    ringSeen: { borderColor: colors.border },
    ringNone: { borderColor: "transparent" },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: colors.surfaceAlt,
    },
    name: {
        fontSize: 16,
        fontWeight: "700",
        color: colors.text,
    },
    time: {
        color: colors.textSecondary,
        marginTop: 3,
        fontSize: 13,
    },
    addIcon: {
        position: "absolute",
        bottom: 0,
        right: 12,
        backgroundColor: colors.primary,
        borderRadius: 11,
        width: 22,
        height: 22,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: colors.surface,
    },
    empty: { alignItems: "center", paddingTop: 70, paddingHorizontal: 40 },
    emptyText: { fontSize: 15, color: colors.textSecondary, marginTop: 12, textAlign: "center" },
});

export const SettingsStyle = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },

    // Header (shared by settings, profile and the reels sub-screens)
    header: {
        backgroundColor: colors.surface,
        flexDirection: "row",
        alignItems: "center",
        paddingTop: Platform.OS === "android" ? 10 : 8,
        paddingBottom: 12,
        paddingHorizontal: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 6,
    },
    searchBtn: { padding: 4, marginLeft: "auto" },
    headerTitle: { fontSize: font.h2 + 2, fontWeight: "800", color: colors.text, letterSpacing: -0.4, flex: 1, marginLeft: 2 },

    scroll: { paddingBottom: 40 },

    // Profile card
    profileCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.surface,
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: radius.lg,
        padding: 16,
        ...shadow(1),
    },
    profileAvatar: {
        width: 62,
        height: 62,
        borderRadius: 31,
        backgroundColor: colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 14,
    },
    profileInfo: { flex: 1 },
    profileName: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
    profileStatus: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    profilePhone: { fontSize: 13, color: colors.primary, marginTop: 4, fontWeight: "700" },

    // Section
    section: { marginTop: 22, marginHorizontal: 16 },
    sectionTitle: {
        fontSize: 12,
        fontWeight: "700",
        color: colors.textMuted,
        letterSpacing: 0.8,
        marginBottom: 8,
        marginLeft: 6,
    },
    sectionCard: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        overflow: "hidden",
        ...shadow(1),
    },

    // Icon box
    iconBox: {
        width: 36,
        height: 36,
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 14,
    },

    // Row
    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
        paddingHorizontal: 14,
        minHeight: 56,
    },
    rowLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
    rowLabel: { fontSize: 15, color: colors.text, fontWeight: "600" },
    rowRight: { flexDirection: "row", alignItems: "center", gap: 4 },
    rowValue: { fontSize: 14, color: colors.textMuted },

    // Divider
    divider: { height: 1, backgroundColor: colors.divider, marginLeft: 64 },

    // Version
    version: { textAlign: "center", fontSize: 12, color: colors.textMuted, marginTop: 28 },
});

export const ConvStyle = StyleSheet.create({
    // Header (normal + selection overlays share headerInner)
    header: {
        backgroundColor: colors.surface,
        height: 64,
        paddingHorizontal: 4,
    },
    headerInner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        height: 64,
    },
    headerBack: { marginRight: 12 },
    headerTitle: { flex: 1, fontSize: font.title, fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
    headerActions: { flexDirection: 'row', gap: 8 },
    headerIconBtn: {
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Body
    body: {
        flex: 1,
        backgroundColor: colors.surface,
    },

    // Search
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginTop: 4,
        marginBottom: 12,
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.md,
        paddingHorizontal: 14,
        paddingVertical: 11,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: colors.text,
        padding: 0,
    },

    // Filter chips
    filterRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 8,
        marginBottom: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 7,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 6,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    chipTextActive: { color: colors.textOnPrimary },
    chipBadge: {
        backgroundColor: colors.primarySoft,
        borderRadius: radius.pill,
        minWidth: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 5,
    },
    chipBadgeText: { color: colors.primaryDark, fontSize: 10, fontWeight: '800' },

    // Chat row
    chatRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 11,
        backgroundColor: colors.surface,
    },
    chatRowSelected: { backgroundColor: colors.primarySoft },
    selectedCheck: { marginRight: 8 },

    // Avatar
    avatarWrap: { position: 'relative', marginRight: 14 },
    avatar: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: colors.surfaceAlt,
    },
    onlineDot: {
        position: 'absolute',
        bottom: 1,
        right: 1,
        width: 13,
        height: 13,
        borderRadius: 7,
        backgroundColor: colors.online,
        borderWidth: 2,
        borderColor: colors.surface,
    },

    // Chat content
    chatContent: { flex: 1 },
    chatTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    chatBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    chatPreviewRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
    chatName: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1, letterSpacing: -0.2 },
    chatTime: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
    chatMsg: { fontSize: 14, color: colors.textSecondary, flex: 1 },
    chatMeta: { flexDirection: 'row', alignItems: 'center' },

    // Unread badge
    badge: {
        backgroundColor: colors.primary,
        borderRadius: radius.pill,
        minWidth: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
    },
    badgeText: { color: colors.textOnPrimary, fontSize: 11, fontWeight: '700' },

    // Separator
    separator: { height: 1, backgroundColor: colors.divider, marginLeft: 82 },

    // Empty state
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
    emptyTitle: { fontSize: font.h2, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 8 },
    emptySub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

    fab: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        width: 58,
        height: 58,
        borderRadius: 20,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        ...shadow(3),
        shadowColor: colors.primary,
    },
    fabMenu: {
        position: 'absolute',
        bottom: 92,
        right: 20,
        gap: 12,
    },
    fabMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        justifyContent: 'flex-end',
    },
    fabMenuIcon: {
        width: 46,
        height: 46,
        borderRadius: 16,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        ...shadow(2),
    },
    fabMenuText: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.text,
        backgroundColor: colors.surface,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: radius.md,
        overflow: 'hidden',
        ...shadow(1),
    },

    // Kept for screens that still read these; BottomTabBar has its own styles
    tabBar: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.divider,
        paddingVertical: 8,
    },
    tabItem: { flex: 1, alignItems: 'center', gap: 3 },
    tabText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
    checkWrap: {
        width: 0,
        overflow: 'visible',
        marginRight: 6,
    },
});

export const ContactsStyles = StyleSheet.create({
    header: {
        backgroundColor: colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 10,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 6,
    },
    headerText: { flex: 1 },
    headerTitle: { fontSize: font.h1, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 1, fontWeight: '500' },

    body: {
        flex: 1,
        backgroundColor: colors.surface,
    },

    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginTop: 4,
        marginBottom: 12,
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.md,
        paddingHorizontal: 14,
        paddingVertical: 11,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: colors.text,
        padding: 0,
    },

    sectionLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textMuted,
        letterSpacing: 0.8,
        marginHorizontal: 20,
        marginBottom: 6,
        marginTop: 4,
    },

    contactItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 11,
        backgroundColor: colors.surface,
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: colors.surfaceAlt,
        marginRight: 14,
    },
    contactInfo: { flex: 1 },
    name: { fontSize: 16, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
    subText: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

    separator: { height: 1, backgroundColor: colors.divider, marginLeft: 80 },

    empty: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
        paddingHorizontal: 40,
    },
    emptyTitle: { fontSize: font.h2, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 6 },
    emptySub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});

export const SelectContactsStyles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 10,
        backgroundColor: colors.surface,
        gap: 6,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: font.h1,
        fontWeight: '800',
        color: colors.text,
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 13,
        color: colors.textSecondary,
        fontWeight: '500',
    },

    body: {
        flex: 1,
        backgroundColor: colors.surface,
    },

    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginTop: 4,
        marginBottom: 10,
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.md,
        paddingHorizontal: 14,
        paddingVertical: 2,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: colors.text,
        paddingVertical: 9,
    },

    sectionLabel: {
        fontSize: 12,
        color: colors.textMuted,
        fontWeight: '700',
        paddingHorizontal: 20,
        paddingVertical: 6,
        letterSpacing: 0.8,
    },

    contactItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 14,
        backgroundColor: colors.surface,
        height: 68,
    },
    contactItemSelected: {
        backgroundColor: colors.primarySoft,
    },
    avatarWrapper: {
        position: 'relative',
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.surfaceAlt,
    },
    checkBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.surface,
    },
    name: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 2,
        letterSpacing: -0.2,
    },
    subText: {
        fontSize: 13,
        color: colors.textSecondary,
    },
    selRing: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selRingActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    separator: {
        height: 1,
        backgroundColor: colors.divider,
        marginLeft: 78,
    },

    empty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
        gap: 8,
    },
    emptyTitle: {
        fontSize: font.h2,
        color: colors.text,
        fontWeight: '700',
    },
    emptySub: {
        fontSize: 14,
        color: colors.textSecondary,
    },

    // Selected people strip, above the Next button
    stripContainer: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        paddingVertical: 12,
        backgroundColor: colors.background,
    },
    stripAvatarWrap: {
        position: 'relative',
    },
    stripAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 2,
        borderColor: colors.primaryMuted,
    },
    stripRemove: {
        position: 'absolute',
        top: -5,
        right: -3,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 5,
        ...shadow(1),
    },
    stripName: {
        fontSize: 11,
        color: colors.textSecondary,
        fontWeight: '600',
        maxWidth: 52,
    },

    bottomBar: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: colors.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    nextBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        borderRadius: radius.md,
        height: 54,
        gap: 10,
        ...shadow(2),
        shadowColor: colors.primary,
    },
    nextBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textOnPrimary,
    },
    countBadge: {
        backgroundColor: 'rgba(255,255,255,0.22)',
        borderRadius: radius.pill,
        paddingHorizontal: 9,
        paddingVertical: 1,
    },
    countBadgeText: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textOnPrimary,
    },
});

export const CreateGroupStyles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.surface,
    },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 10,
        backgroundColor: colors.surface,
        gap: 6,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: font.h1,
        fontWeight: '800',
        color: colors.text,
        letterSpacing: -0.5,
    },

    scrollBg: {
        flex: 1,
        backgroundColor: colors.background,
    },

    card: {
        backgroundColor: colors.surface,
        marginHorizontal: 16,
        marginTop: 14,
        borderRadius: radius.lg,
        paddingHorizontal: 16,
        paddingVertical: 18,
        ...shadow(1),
    },

    // Group photo picker
    iconPickerWrap: {
        width: 96,
        height: 96,
        borderRadius: 32,
        backgroundColor: colors.primarySoft,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: colors.primaryMuted,
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    iconImage: {
        width: 96,
        height: 96,
        borderRadius: 32,
    },
    iconAddText: {
        fontSize: 11,
        color: colors.primary,
        fontWeight: '700',
        marginTop: 3,
    },
    iconLabel: {
        textAlign: 'center',
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 10,
    },

    fieldLabel: {
        fontSize: 12,
        color: colors.textSecondary,
        fontWeight: '700',
        letterSpacing: 0.4,
        marginBottom: 8,
    },
    fieldLabelOptional: {
        color: colors.textMuted,
        fontWeight: '500',
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.md,
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 10,
    },
    input: {
        flex: 1,
        fontSize: 15,
        color: colors.text,
        paddingVertical: 2,
    },
    textArea: {
        minHeight: 60,
        textAlignVertical: 'top',
    },
    charCount: {
        fontSize: 11,
        color: colors.textMuted,
        fontWeight: '600',
    },

    // Members row
    memberItem: {
        alignItems: 'center',
        gap: 5,
        width: 56,
    },
    memberAvatarWrap: { position: 'relative' },
    memberAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: colors.surfaceAlt,
    },
    memberName: {
        fontSize: 11,
        color: colors.textSecondary,
        fontWeight: '600',
        maxWidth: 56,
        textAlign: 'center',
    },
    addMoreBtn: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: colors.primarySoft,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: colors.primaryMuted,
        alignItems: 'center',
        justifyContent: 'center',
    },

    topBtnWrap: {
        flex: 1,
        justifyContent: 'flex-end',
        marginTop: 30,
    },
    btnWrap: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: colors.surface,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    createBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        borderRadius: radius.md,
        height: 54,
        gap: 8,
        ...shadow(2),
        shadowColor: colors.primary,
    },
    createBtnDisabled: {
        backgroundColor: colors.primaryMuted,
        elevation: 0,
        shadowOpacity: 0,
    },
    createBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.textOnPrimary,
    },

    loaderOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.75)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export const RoomStyles = StyleSheet.create({
    // "N unread messages" divider above the first unread message
    unreadDivider: {
        alignSelf: "center",
        backgroundColor: colors.primarySoft,
        borderRadius: radius.pill,
        paddingHorizontal: 14,
        paddingVertical: 5,
        marginVertical: 10,
    },
    unreadDividerText: { fontSize: 12, fontWeight: "700", color: colors.primaryDark },
    // Jump back to the latest message after scrolling up
    scrollDownBtn: {
        position: "absolute",
        right: 14,
        bottom: 14,
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
        ...shadow(2),
    },
    container: {
        flex: 1,
        backgroundColor: colors.surface,
    },

    // ── Header ──
    header: {
        backgroundColor: colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
    },
    chatAvatar: {
        width: 38,
        height: 38,
        borderRadius: 19,
        marginRight: 8,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    iconButton: {
        padding: 6,
    },
    iconText: {
        fontSize: 22,
    },

    // ── Chat list ──
    chatLists: {
        flex: 1,
        backgroundColor: colors.background,
    },

    // ── Message bubbles ──
    message: {
        minWidth: 80, // short replies ("ok") still fit the time + ticks
        maxWidth: '78%',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 18,
        marginVertical: 2,
        ...shadow(1),
    },
    me: {
        alignSelf: 'flex-end',
        backgroundColor: colors.bubbleMine,
        borderBottomRightRadius: 6,
    },
    them: {
        alignSelf: 'flex-start',
        backgroundColor: colors.bubbleTheirs,
        borderBottomLeftRadius: 6,
    },
    selectedChatRow: {
        backgroundColor: colors.primarySoft,
    },

    // ── System message (group_create) ──
    systemMessage: {
        backgroundColor: colors.surface,
        borderRadius: 10,
        padding: 10,
        maxWidth: '85%',
        alignItems: 'center',
    },
    systemMessageText: {
        fontSize: 13,
        color: colors.text,
        fontWeight: '500',
        textAlign: 'center',
    },
    systemMessageSubText: {
        fontSize: 12,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    systemMessageTime: {
        fontSize: 11,
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: 2,
    },

    // ── Reply bubble ──
    replyPreview: {
        backgroundColor: '#1f2c33',
        padding: 8,
        borderLeftWidth: 3,
        borderLeftColor: colors.primary,
        marginBottom: 2,
        marginHorizontal: 6,
        borderRadius: 6,
        flexDirection: 'row',
        alignItems: 'center',
    },
    replyPreviewText: {
        color: colors.primaryMuted,
        fontWeight: '600',
        fontSize: 12,
        marginBottom: 2,
    },
    replyPreviewMsg: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
    },

    // ── Footer ──
    chatFooter: {
        backgroundColor: colors.surface,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
    },
    inputContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'flex-end',
        backgroundColor: colors.surfaceAlt,
        borderRadius: 24,
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 8,
    },
    textInput: {
        flex: 1,
        fontSize: 15,
        color: colors.text,
        maxHeight: 120,
        padding: 1,
    },
    sendBtn: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    sendIcon: {
        color: '#fff',
        fontSize: 18,
    },
    // Full-screen tap catcher behind the attachment menu
    roomOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 20,
        elevation: 20,
    },

    // ── Attachment tray ──
    // Attachment tray. The clip sits directly above the input bar (bottom = its top edge) and hides
    // anything below that edge, so the card slides out of the input instead of over it.
    optionClip: {
        position: 'absolute',
        bottom: '5%',
        left: 0,
        right: 0,
        overflow: 'hidden',
        paddingTop: 16, // room for the card shadow
        paddingHorizontal: 10,
        paddingBottom: 8, // gap between the card and the input
        zIndex: 10,
    },
    optionBox: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        paddingTop: 8,
        paddingBottom: 6,
        paddingHorizontal: 8,
        ...shadow(3),
    },
    optionHandle: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.border,
        marginBottom: 12,
    },
    optionGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    optionRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 16,
    },
    optionItem: {
        width: '33.333%',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    optionIcon: {
        width: 58,
        height: 58,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.text,
    },

    // ── Call card ──
    callCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 10,
        padding: 10,
        minWidth: 180,
    },
    callTitle: {
        fontSize: 14,
        fontWeight: '500',
    },
    callSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },

    // ── Map card ──
    roomMapCard: {
        borderRadius: 10,
        overflow: 'hidden',
        width: 200,
    },
    roomMapMap: {
        width: 200,
        height: 120,
    },
    roomMapFooter: {
        backgroundColor: '#fff',
        padding: 6,
    },
    roomMapTitle: {
        fontSize: 13,
        fontWeight: '500',
        color: colors.text,
    },
    roomMapCoords: {
        fontSize: 11,
        color: colors.textSecondary,
    },

    // ── Contact card ──
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 10,
    },
    name: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.text,
    },
    cardContactPhone: {
        fontSize: 12,
        color: colors.textSecondary,
        marginTop: 2,
    },
    cardContactActions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
    },
    cardContactBtn: {
        flex: 1,
        paddingVertical: 6,
        backgroundColor: colors.primary,
        borderRadius: 6,
        alignItems: 'center',
    },
    cardContactBtnText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '500',
    },

    // ── Menu ──
    menuOverlay: {
        flex: 1,
        backgroundColor: colors.overlay,
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        paddingTop: 60,
        paddingRight: 12,
    },
    menuBox: {
        backgroundColor: '#fff',
        borderRadius: 8,
        paddingVertical: 6,
        paddingHorizontal: 4,
        minWidth: 120,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 5,
    },
});

export const CallLogsStyles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },

    // Header
    header: {
        backgroundColor: colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    headerTitle: { fontSize: font.h1, fontWeight: '800', color: colors.text },
    headerIcon: { padding: 4 },

    // Body
    body: { flex: 1, backgroundColor: colors.surface },

    // Section label
    sectionLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textMuted,
        letterSpacing: 0.8,
        paddingHorizontal: 20,
        paddingTop: 6,
        paddingBottom: 6,
    },

    // Row
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 11,
        backgroundColor: colors.surface,
    },
    avatarWrap: { marginRight: 14 },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceAlt },
    avatarFallback: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarInitials: { fontSize: 16, fontWeight: '700', color: colors.primaryDark },
    info: { flex: 1 },
    name: { fontSize: 16, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
    subRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 4 },
    statusText: { fontSize: 13, color: colors.textSecondary },
    statusMissed: { color: colors.danger, fontWeight: '600' },
    dot: { fontSize: 13, color: colors.textMuted },
    timeText: { fontSize: 13, color: colors.textMuted },
    callTypeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
    },

    separator: { height: 1, backgroundColor: colors.divider, marginLeft: 78 },

    // Empty state
    empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 90, paddingHorizontal: 40 },
    emptyIcon: {
        width: 72,
        height: 72,
        borderRadius: 24,
        backgroundColor: colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    emptyTitle: { fontSize: font.h2, fontWeight: '700', color: colors.text, marginBottom: 6 },
    emptySub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
});

export const ProfileStyles = StyleSheet.create({
    // Username availability line (register + edit username)
    status: { fontSize: 12, marginTop: 8, fontWeight: '600' },
    statusOk: { color: colors.success },
    statusBad: { color: colors.danger },
    usernameAt: { fontSize: 17, fontWeight: '700', color: colors.primary, marginRight: 4 },
    btnDisabled: { opacity: 0.45 },

    // Profile screen
    avatarWrap: { alignItems: 'center', marginTop: 28, marginBottom: 8 },
    avatar: {
        width: 128,
        height: 128,
        borderRadius: 64,
        backgroundColor: colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderWidth: 4,
        borderColor: colors.surface,
        ...shadow(2),
    },
    avatarImage: { width: 128, height: 128 },
    avatarBadge: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        backgroundColor: colors.primary,
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: colors.background,
    },
    removePhoto: { color: colors.danger, fontSize: 13, fontWeight: '700', marginTop: 12 },
    field: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14 },
    fieldText: { flex: 1 },
    fieldLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
    fieldValue: { fontSize: 16, color: colors.text, marginTop: 2, fontWeight: '500' },
    fieldPlaceholder: { fontSize: 16, color: colors.textMuted, marginTop: 2 },
    note: { fontSize: 12, color: colors.textMuted, marginHorizontal: 22, marginTop: 8, lineHeight: 17 },

    // Edit sheet
    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        padding: 22,
        paddingBottom: Platform.OS === 'ios' ? 36 : 22,
    },
    sheetTitle: { fontSize: font.h2 + 1, fontWeight: '800', color: colors.text, marginBottom: 4 },
    sheetInput: {
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.md,
        fontSize: 16,
        color: colors.text,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginTop: 14,
    },
    sheetCount: { fontSize: 11, color: colors.textMuted, textAlign: 'right', marginTop: 6 },
    sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 22, marginTop: 20 },
    sheetCancel: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
    sheetSave: { fontSize: 15, fontWeight: '800', color: colors.primary },
});

// "Chats | Calls" switch under the chat list header
export const SectionTabStyles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        backgroundColor: colors.surfaceAlt,
        marginHorizontal: 16,
        marginBottom: 10,
        borderRadius: radius.md,
        padding: 4,
    },
    tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: radius.sm },
    tabActive: { backgroundColor: colors.surface, ...shadow(1) },
    text: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
    textActive: { color: colors.text, fontWeight: '700' },
});

export const ReelStyles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000000' },
    pager: { flex: 1, backgroundColor: '#000000' },
    item: { width: '100%', backgroundColor: '#000000' },
    video: { width: '100%', height: '100%' },
    center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    pausedIcon: { opacity: 0.85 },

    // Overlays
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        zIndex: 5,
    },
    topTitle: { flex: 1, fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginLeft: 4 },
    topBtn: { padding: 6, marginLeft: 6 },
    bottomInfo: { position: 'absolute', left: 14, right: 70, bottom: 18 },
    authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    authorAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#333333', marginRight: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    authorName: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
    authorHandle: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
    caption: { fontSize: 14, color: '#FFFFFF', lineHeight: 19 },
    time: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 6 },
    sideActions: { position: 'absolute', right: 10, bottom: 24, alignItems: 'center', gap: 18 },
    sideBtn: { alignItems: 'center' },
    sideText: { fontSize: 11, color: '#FFFFFF', marginTop: 2 },
    shadow: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },

    // Empty / error states (dark)
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginTop: 16, textAlign: 'center' },
    emptySub: { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginTop: 8, textAlign: 'center', lineHeight: 20 },
    emptyBtn: { marginTop: 22, backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 26, borderRadius: 24 },
    emptyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

    // Upload screen
    uploadPreview: { width: '100%', aspectRatio: 9 / 16, maxHeight: 460, backgroundColor: '#111111', borderRadius: 16, overflow: 'hidden', alignSelf: 'center' },
    pickBox: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed', borderColor: '#3A3A3A' },
    pickText: { color: '#CCCCCC', fontSize: 15, fontWeight: '600', marginTop: 10 },
    pickHint: { color: colors.textSecondary, fontSize: 12, marginTop: 6 },
    captionInput: {
        backgroundColor: '#1A1A1A',
        color: '#FFFFFF',
        borderRadius: 12,
        padding: 12,
        fontSize: 15,
        minHeight: 80,
        textAlignVertical: 'top',
        marginTop: 16,
    },
    captionCount: { color: '#777777', fontSize: 11, textAlign: 'right', marginTop: 4 },
    progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#2A2A2A', marginTop: 18, overflow: 'hidden' },
    progressFill: { height: 6, backgroundColor: colors.primary },
    progressText: { color: '#CCCCCC', fontSize: 12, marginTop: 6, textAlign: 'center' },
    shareBtn: { marginTop: 18, backgroundColor: colors.primary, paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
    shareText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    disabled: { opacity: 0.45 },

    // Profile screen
    profileHeader: { alignItems: 'center', paddingTop: 20, paddingBottom: 16, backgroundColor: '#FFFFFF' },
    profileAvatar: { width: 92, height: 92, borderRadius: 46, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    profileName: { fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 10 },
    profileHandle: { fontSize: 14, color: colors.primary, marginTop: 2, fontWeight: '600' },
    statsRow: { flexDirection: 'row', marginTop: 16, gap: 34 },
    stat: { alignItems: 'center' },
    statValue: { fontSize: 18, fontWeight: '800', color: colors.text },
    statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    followBtn: { marginTop: 16, backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 40, borderRadius: 22 },
    followingBtn: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#CCCCCC' },
    followText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
    followingText: { color: '#333333' },
    gridTile: { flex: 1 / 3, aspectRatio: 9 / 16, margin: 1, backgroundColor: '#1B1B1B', justifyContent: 'flex-end', padding: 6 },
    gridCaption: { color: '#FFFFFF', fontSize: 11 },
    gridPlay: { position: 'absolute', top: 6, left: 6 },
    locked: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 30 },
    lockedText: { fontSize: 15, color: colors.textSecondary, marginTop: 10, textAlign: 'center' },

    // Find people
    searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', margin: 12, borderRadius: 24, paddingHorizontal: 14 },
    searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 10 },
    personRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 12 },
    personAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, marginRight: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    personName: { fontSize: 15, fontWeight: '600', color: colors.text },
    personSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
    sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.8, marginTop: 14, marginBottom: 6, marginLeft: 16 },
    hintText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 10, paddingHorizontal: 30 },
});

// Chat room header
export const RoomHeaderStyles = StyleSheet.create({
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        paddingLeft: 4,
        paddingRight: 16,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
        minHeight: 64,
    },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    identity: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 2, marginRight: 6 },
    avatarWrap: { position: 'relative', marginRight: 10 },
    avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceAlt },
    onlineDot: {
        position: 'absolute',
        right: 0,
        bottom: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: colors.online,
        borderWidth: 2,
        borderColor: colors.surface,
    },
    titleWrap: { flex: 1 },
    title: { fontSize: 17, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    subRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1, gap: 4 },
    sub: { fontSize: 13, color: colors.textSecondary, flexShrink: 1 },
    subOnline: { color: colors.success, fontWeight: '600' },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    // Tinted round buttons for call / video
    actionBtn: {
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        backgroundColor: colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectionTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text, marginLeft: 4 },

    // Narrow phones (< 380dp): ~40dp more room for the name
    barCompact: { paddingRight: 12, minHeight: 58 },
    iconBtnCompact: { width: 34, height: 34 },
    identityCompact: { marginLeft: 0, marginRight: 4 },
    avatarWrapCompact: { marginRight: 8 },
    avatarCompact: { width: 36, height: 36, borderRadius: 18 },
    titleCompact: { fontSize: 16 },
    subCompact: { fontSize: 12 },
    actionsCompact: { gap: 4 },
    actionBtnCompact: { width: 34, height: 34 },
    selectionTitleCompact: { fontSize: 16 },
});

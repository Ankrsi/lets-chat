import React, { useState, useMemo } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    FlatList, StyleSheet, Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');
const COL = 8;
const CELL = Math.floor((width - 16) / COL);

const CATEGORIES = [
    { key: 'recent',   icon: '🕐', label: 'Recently used' },
    { key: 'smileys',  icon: '😀', label: 'Smileys & emotion' },
    { key: 'people',   icon: '🧑', label: 'People & body' },
    { key: 'nature',   icon: '🐶', label: 'Animals & nature' },
    { key: 'food',     icon: '🍎', label: 'Food & drink' },
    { key: 'activity', icon: '⚽', label: 'Activity' },
    { key: 'travel',   icon: '✈️', label: 'Travel & places' },
    { key: 'objects',  icon: '💡', label: 'Objects' },
    { key: 'symbols',  icon: '❤️', label: 'Symbols' },
];

const EMOJIS: Record<string, string[]> = {
    recent: [],
    smileys: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👾','🤖'],
    people: ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦵','🦶','👂','👃','👀','👁','👅','👄','💋','🧑','👦','👧','🧒','👨','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷'],
    nature: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🐢','🐍','🦎','🐙','🦑','🐟','🐬','🐳','🦈','🐊','🐅','🐆','🐘','🦒','🐃','🌵','🎄','🌲','🌳','🌴','🌱','🌿','☘️','🍀','🍃','🍂','🍁','🍄','🌾','💐','🌷','🌹','🌺','🌸','🌼','🌻','🌞','🌝','🌛','🌙','⭐','🌟','🌈','🔥','💧','🌊'],
    food: ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🥙','🌮','🌯','🥗','🥘','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍘','🍥','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','☕','🍵','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🍾'],
    activity: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🥅','⛳','🎣','🤿','🎽','🎿','🛷','🥌','🎯','🎮','🎲','♟','🎭','🎨','🎪','🎤','🎧','🎼','🎵','🎶','🎷','🎸','🎹','🎺','🎻','🥁','🎬','🏆','🥇','🥈','🥉','🏅','🎖','🎗','🎫','🎟'],
    travel: ['🚗','🚕','🚙','🚌','🚎','🏎','🚓','🚑','🚒','🚐','🚚','🚛','🚜','🏍','🛵','🚲','🛴','✈️','🛩','🚁','🚀','🛸','🚢','⛵','🚤','🏠','🏡','🏢','🏥','🏦','🏨','🏪','🏫','🏭','🏗','🌍','🌎','🌏','🗺','🏔','⛰','🌋','🏕','🏖','🏜','🏝','🏞','🏛','🕌','⛪','🕋','🗼','🗽'],
    objects: ['💡','🔦','🕯','💰','💵','💳','🪙','📈','📉','📊','📌','📍','📎','📏','📐','✂️','🔒','🔓','🔑','🗝','🔨','⚒','🛠','⚔️','🛡','🔧','🔩','⚙️','⚖️','🔗','🧲','🧰','💊','💉','🩹','🩺','🚪','🛏','🛋','🚽','🚿','🛁','🧴','🧷','🧹','🧺','🧻','🧼','🪥','🧽','🛒','📦','📫','📬','📄','📑','📅','📆','📷','📸','📹','🎥','📞','☎️','📟','📠','📺','📻','🧭','⏰','⌛','⏳','🔋','🔌','💻','🖥','🖨','⌨️','🖱','📱'],
    symbols: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','✅','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🔔','🔕','🎵','🎶','💠','🔶','🔷','🔸','🔹','🔺','🔻','✔️','➕','➖','➗','✖️','♾','💲','💱','🔃','🔄','🔙','🔚','🔛','🔜','🔝','⚜️','🔰','♻️','✅','🈳','🈹','🆔','🆚','🆕','🆓','🆒','🆙','🆗','🆖','🆙','🅰️','🅱️','🅾️','🆘'],
};

interface Props {
    onEmojiSelect: (emoji: string) => void;
    recentEmojis: string[];
    onAddRecent: (emoji: string) => void;
}

export default function EmojiPicker({ onEmojiSelect, recentEmojis, onAddRecent }: Props) {
    const [activeCat, setActiveCat] = useState('recent');
    const [search, setSearch] = useState('');

    EMOJIS.recent = recentEmojis;

    const displayEmojis = useMemo(() => {
        if (search.trim()) {
            const all = Object.values(EMOJIS).flat();
            return all.filter(e => e.includes(search)).slice(0, 64);
        }
        return EMOJIS[activeCat] || [];
    }, [activeCat, search, recentEmojis]);

    const handlePick = (emoji: string) => {
        onEmojiSelect(emoji);
        onAddRecent(emoji);
    };

    const renderEmoji = ({ item }: { item: string }) => (
        <TouchableOpacity
            style={styles.emojiBtn}
            onPress={() => handlePick(item)}
            activeOpacity={0.6}
        >
            <Text style={styles.emoji}>{item}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>

            <View style={styles.searchWrap}>
                <View style={styles.searchBox}>
                    <Text style={{ fontSize: 14, color: '#8696A0' }}>🔍</Text>
                    <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search emoji"
                        placeholderTextColor="#8696A0"
                        style={styles.searchInput}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <Text style={{ color: '#8696A0', fontSize: 16 }}>✕</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {!search && (
                <Text style={styles.sectionLabel}>
                    {CATEGORIES.find(c => c.key === activeCat)?.label}
                </Text>
            )}
            {search && (
                <Text style={styles.sectionLabel}>
                    {displayEmojis.length} results
                </Text>
            )}

            <FlatList
                data={displayEmojis}
                keyExtractor={(item, i) => item + i}
                renderItem={renderEmoji}
                numColumns={COL}
                key={activeCat + search}
                contentContainerStyle={styles.grid}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyText}>No results</Text>
                    </View>
                }
                getItemLayout={(_, index) => ({
                    length: CELL,
                    offset: CELL * Math.floor(index / COL),
                    index,
                })}
            />

            <View style={styles.tabs}>
                {CATEGORIES.map(cat => (
                    <TouchableOpacity
                        key={cat.key}
                        style={[
                            styles.tab,
                            activeCat === cat.key && styles.tabActive,
                        ]}
                        onPress={() => { setActiveCat(cat.key); setSearch(''); }}
                    >
                        <Text style={styles.tabIcon}>{cat.icon}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        height: 300,
        backgroundColor: '#fff',
        borderTopWidth: 0.5,
        borderTopColor: '#e0e0e0',
    },

    // Search
    searchWrap: {
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 4,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F0F2F5',
        borderRadius: 20,
        paddingHorizontal: 12,
        height: 34,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 13,
        color: '#111',
        paddingVertical: 0,
    },

    // Section label
    sectionLabel: {
        fontSize: 11,
        color: '#8696A0',
        fontWeight: '500',
        letterSpacing: 0.04,
        paddingHorizontal: 12,
        paddingBottom: 2,
        textTransform: 'uppercase',
    },

    // Grid
    grid: {
        paddingHorizontal: 8,
        paddingBottom: 4,
    },
    emojiBtn: {
        width: CELL,
        height: CELL,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
    },
    emoji: {
        fontSize: 24,
    },
    empty: {
        padding: 20,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 13,
        color: '#8696A0',
    },

    // Tabs
    tabs: {
        flexDirection: 'row',
        borderTopWidth: 0.5,
        borderTopColor: '#F0F0F0',
        backgroundColor: '#fff',
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: '#075E54',
    },
    tabIcon: {
        fontSize: 18,
    },
});
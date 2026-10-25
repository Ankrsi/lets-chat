import { View, Text, StyleSheet, Modal } from 'react-native';

export default function UploadMediaLoader({ progress }: { progress: number }) {
  return (
    <Modal transparent visible={progress > 0 && progress < 100}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.percent}>{progress}%</Text>
          <Text style={styles.label}>Uploading...</Text>

          {/* Progress bar */}
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${progress}%` }]} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  box:      { backgroundColor: '#4e4e4e', borderRadius: 16, padding: 32, width: '80%', alignItems: 'center', gap: 12 },
  percent:  { fontSize: 40, fontWeight: '800', color: '#fff' },
  label:    { fontSize: 15, color: '#aaa' },
  track:    { width: '100%', height: 6, backgroundColor: '#333', borderRadius: 4, overflow: 'hidden' },
  fill:     { height: 6, backgroundColor: '#4ade80', borderRadius: 4 },
});
// Shared primary CTA button — violet gradient glass, used across all auth screens
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function GradientButton({ label, onPress, loading = false, disabled = false }: Props) {
  return (
    <TouchableOpacity
      style={[styles.outer, (loading || disabled) && styles.dimmed]}
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.88}
    >
      <View style={styles.glass} />
      <LinearGradient
        colors={['#A78BFA', '#7C6CD4']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.edge} />
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.6,
  },
  glass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1F1E29',
  },
  edge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});

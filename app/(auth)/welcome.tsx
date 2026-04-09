// Welcome screen — app icon hero, centered layout, glass gradient CTA
import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { springBouncy, springSnappy } from '@/src/lib/reanimated-presets';

export default function WelcomeScreen() {
  const router = useRouter();

  // Logo drops in first
  const logoY = useSharedValue(24);
  const logoOpacity = useSharedValue(0);

  // Text fades in slightly after
  const textOpacity = useSharedValue(0);
  const textY = useSharedValue(12);

  // Button slides up last
  const btnY = useSharedValue(20);
  const btnOpacity = useSharedValue(0);

  useEffect(() => {
    logoY.value = withSpring(0, springBouncy);
    logoOpacity.value = withSpring(1, springSnappy);

    textOpacity.value = withDelay(120, withSpring(1, springSnappy));
    textY.value = withDelay(120, withSpring(0, springSnappy));

    btnOpacity.value = withDelay(280, withSpring(1, springSnappy));
    btnY.value = withDelay(280, withSpring(0, springSnappy));
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: logoY.value }],
    opacity: logoOpacity.value,
  }));

  const textStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: textY.value }],
    opacity: textOpacity.value,
  }));

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: btnY.value }],
    opacity: btnOpacity.value,
  }));

  return (
    <SafeAreaView style={styles.root}>
      {/* Hero — vertically centered */}
      <View style={styles.hero}>
        <Animated.View style={[styles.logoWrap, logoStyle]}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View style={[styles.titles, textStyle]}>
          <Text style={styles.appName}>Hourglass.xo</Text>
          <Text style={styles.tagline}>Crossover Time Tracker</Text>
        </Animated.View>
      </View>

      {/* CTA pinned to bottom */}
      <Animated.View style={[styles.ctaWrap, btnStyle]}>
        <TouchableOpacity
          style={styles.ctaOuter}
          onPress={() => router.push('/(auth)/credentials')}
          activeOpacity={0.88}
        >
          {/* Glass base layer */}
          <View style={styles.ctaGlass} />
          {/* Gradient overlay */}
          <LinearGradient
            colors={['#A78BFA', '#7C6CD4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Specular edge */}
          <View style={styles.ctaEdge} />
          <Text style={styles.ctaText}>Get Started</Text>
        </TouchableOpacity>

        <Text style={styles.subText}>Your credentials stay on your device</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0C14',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  logoWrap: {
    width: 96,
    height: 96,
    borderRadius: 22,
    overflow: 'hidden',
    // Glass shadow
    shadowColor: '#A78BFA',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
  },
  logo: {
    width: 96,
    height: 96,
  },
  titles: {
    alignItems: 'center',
    gap: 6,
  },
  appName: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6B7280',
    letterSpacing: 0.2,
  },
  ctaWrap: {
    gap: 12,
    alignItems: 'center',
  },
  ctaOuter: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle border handled by edge layer
  },
  ctaGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1F1E29',
  },
  ctaEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  subText: {
    fontSize: 12,
    color: '#484F58',
  },
});

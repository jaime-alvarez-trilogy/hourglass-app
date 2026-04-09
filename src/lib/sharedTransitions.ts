// 07-shared-transitions: Shared Element Transition utility
//
// setTag(tag) reads the ENABLE_SHARED_ELEMENT_TRANSITIONS feature flag from
// Constants.expoConfig.extra and returns { sharedTransitionTag: tag } when enabled,
// or {} when disabled or missing.
//
// Usage:
//   <Animated.View {...setTag('home-earnings-card')}>
//     {/* card content */}
//   </Animated.View>

import Constants from 'expo-constants';

/**
 * Returns the sharedTransitionTag prop object for Animated.View when
 * ENABLE_SHARED_ELEMENT_TRANSITIONS is enabled in app.json extra config.
 *
 * When the flag is false or missing, returns an empty object so the spread
 * has no effect on the component.
 */
export function setTag(tag: string): { sharedTransitionTag?: string } {
  const enabled = Constants.expoConfig?.extra?.ENABLE_SHARED_ELEMENT_TRANSITIONS ?? false;
  return enabled ? { sharedTransitionTag: tag } : {};
}

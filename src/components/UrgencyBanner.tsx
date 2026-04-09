// FR7 (05-hours-dashboard): UrgencyBanner — design token migration
// Updated from StyleSheet + hardcoded hex to NativeWind className only.
//
// Design tokens used:
//   bg-warning  (#F59E0B) — low + high urgency
//   bg-critical (#F43F5E) — critical + expired urgency
//   text-background (#0A0A0F) — dark text on coloured banner

import React from 'react';
import { View, Text } from 'react-native';
import { getUrgencyLevel, formatTimeRemaining } from '../lib/hours';
import type { UrgencyLevel } from '../lib/hours';

const URGENCY_CLASSES: Record<Exclude<UrgencyLevel, 'none'>, string> = {
  low: 'bg-warning',
  high: 'bg-warning',
  critical: 'bg-critical',
  expired: 'bg-critical',
};

interface UrgencyBannerProps {
  timeRemaining: number; // ms
}

export function UrgencyBanner({ timeRemaining }: UrgencyBannerProps) {
  const level = getUrgencyLevel(timeRemaining);

  if (level === 'none') {
    return null;
  }

  const label = formatTimeRemaining(timeRemaining);
  const bgClass = URGENCY_CLASSES[level];

  return (
    <View
      className={`${bgClass} py-2.5 px-4 rounded-xl items-center`}
      testID="urgency-banner"
    >
      <Text className="text-background font-sans-semibold text-sm">
        {level === 'expired' ? 'Expired' : `Deadline in ${label}`}
      </Text>
    </View>
  );
}

// FR9 (04-ai-brainlift): AIProgressBar — horizontal progress bar with optional target marker

import React from 'react';
import { View, StyleSheet } from 'react-native';

interface AIProgressBarProps {
  /** 0–100 fill percentage */
  value: number;
  /** Optional percentage for a vertical target line (e.g. 75 for 75% target) */
  targetLine?: number;
  /** Bar fill color (default: electric green) */
  color?: string;
  /** Bar height in points (default: 8) */
  height?: number;
}

export function AIProgressBar({
  value,
  targetLine,
  color = '#00FF88',
  height = 8,
}: AIProgressBarProps) {
  const fillPct = Math.min(100, Math.max(0, value));

  return (
    <View style={[styles.track, { height }]}>
      <View
        style={[
          styles.fill,
          { width: `${fillPct}%` as `${number}%`, backgroundColor: color, height },
        ]}
      />
      {targetLine !== undefined && (
        <View
          style={[
            styles.targetLine,
            { left: `${Math.min(100, Math.max(0, targetLine))}%` as `${number}%`, height },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: '#2C2C2E',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: 4,
  },
  targetLine: {
    position: 'absolute',
    top: 0,
    width: 2,
    backgroundColor: '#FFCC00',
    borderRadius: 1,
  },
});

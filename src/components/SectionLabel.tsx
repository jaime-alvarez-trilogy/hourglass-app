// SectionLabel.tsx
// FR3: Uppercase section header, design system typography (03-base-components)
//
// Design system rule: Section labels use Inter SemiBold, xs, uppercase, wide tracking.
// Text color: textSecondary — supporting labels, metadata.
// No StyleSheet.create — NativeWind className only.

import React from 'react';
import { Text } from 'react-native';

interface SectionLabelProps {
  children: string;
  /** Additional NativeWind classes appended to base classes */
  className?: string;
}

export default function SectionLabel({ children, className }: SectionLabelProps): JSX.Element {
  const base = 'text-textSecondary font-sans-semibold text-xs uppercase tracking-widest';
  const combined = className ? `${base} ${className}` : base;

  return (
    <Text className={combined}>
      {children}
    </Text>
  );
}

// Mock for expo-linear-gradient in Jest/node environment.
// LinearGradient renders as a plain View so the component tree is testable
// without native gradient rendering. All props are passed through.

import React from 'react';
import { View } from 'react-native';

export const LinearGradient = ({ children, style, testID }: any) =>
  React.createElement(View, { style, testID }, children);

export default LinearGradient;

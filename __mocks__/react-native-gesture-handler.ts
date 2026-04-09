/**
 * Mock for react-native-gesture-handler in Jest test environment.
 * GestureDetector renders its children transparently.
 * Gesture.Pan() returns a no-op gesture object.
 */
import React from 'react';

export const GestureDetector = ({ children }: { children: React.ReactNode; gesture?: any }) =>
  React.createElement(React.Fragment, null, children);

export const Gesture = {
  Pan: () => ({
    minDistance: () => ({
      enabled: () => ({
        onBegin: () => ({
          onUpdate: () => ({
            onFinalize: () => ({}),
          }),
        }),
      }),
    }),
    enabled: jest.fn().mockReturnThis(),
    minDistance: jest.fn().mockReturnThis(),
    activeOffsetX: jest.fn().mockReturnThis(),
    failOffsetY: jest.fn().mockReturnThis(),
    onBegin: jest.fn().mockReturnThis(),
    onStart: jest.fn().mockReturnThis(),
    onUpdate: jest.fn().mockReturnThis(),
    onEnd: jest.fn().mockReturnThis(),
    onFinalize: jest.fn().mockReturnThis(),
  }),
  Tap: () => ({
    onBegin: jest.fn().mockReturnThis(),
    onEnd: jest.fn().mockReturnThis(),
    onFinalize: jest.fn().mockReturnThis(),
  }),
};

export const GestureHandlerRootView = ({ children }: { children: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

export const State = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
};

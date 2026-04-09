import React from 'react';

const chartBounds = { left: 0, right: 300, top: 0, bottom: 120, width: 300, height: 120 };

const CartesianChart = ({ children, data, xKey, yKeys }: any) => {
  const points: any = {};
  if (yKeys) yKeys.forEach((k: string) => { points[k] = []; });
  return React.createElement(
    'CartesianChart',
    { data, xKey, yKeys },
    typeof children === 'function' ? children({ points, chartBounds }) : children,
  );
};

const Bar = ({ children, roundedCorners }: any) =>
  React.createElement(
    'Bar',
    { roundedCorners },
    typeof children === 'function' ? children() : children,
  );

const Line = ({ children }: any) =>
  React.createElement('Line', null, typeof children === 'function' ? children() : children);

const Area = ({ children }: any) =>
  React.createElement('Area', null, typeof children === 'function' ? children() : children);

const useChartPressState = (_initial: any) => ({
  state: {
    x: { value: { value: 0, position: 0 }, position: 0 },
    y: {},
    // TrendSparkline.tsx accesses state.isActive.value in a useAnimatedReaction worklet
    isActive: { value: false },
  },
  isActive: { value: false },
});

export { CartesianChart, Bar, Line, Area, useChartPressState };

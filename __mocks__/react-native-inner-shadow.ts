// Mock for react-native-inner-shadow — Jest/node environment
// Renders ShadowView as a host element so render tree assertions work.

const React = require('react');

const ShadowView = ({ children, ...props }: any) =>
  React.createElement('ShadowView', props, children);

module.exports = {
  __esModule: true,
  ShadowView,
  InnerShadow: ShadowView, // alias for any legacy test references
  LinearShadowView: ({ children, ...props }: any) =>
    React.createElement('LinearShadowView', props, children),
};

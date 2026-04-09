// Mock for @react-native-masked-view/masked-view — Jest/node environment
// Renders MaskedView as a host element so render tree assertions work.

const React = require('react');

module.exports = {
  __esModule: true,
  default: ({ children, maskElement: _maskElement, ...rest }: any) =>
    // maskElement is a React element — drop it from props to avoid circular JSON serialisation
    React.createElement('MaskedView', rest, children),
};

import { Platform } from 'react-native';

// Headless JS task for react-native-android-widget. Must run at bundle start
// (imported by index.ts) so the OS can render the widget without the app UI.
if (Platform.OS === 'android') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  registerWidgetTaskHandler(require('./widgetTaskHandler').default);
}

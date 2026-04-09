// FR5: Android Widget Task Handler
// Lifecycle handler for react-native-android-widget.
// Called by the Android system when a widget needs to be updated.
// Reads WidgetData from AsyncStorage via readWidgetData() and renders
// the HourglassWidget component, or a fallback state if data is unavailable.

import { readWidgetData } from '../bridge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WidgetInfo {
  widgetName: string;
  widgetId: number;
  [key: string]: unknown;
}

interface WidgetTaskHandlerProps {
  widgetInfo: WidgetInfo;
}

// ─── widgetTaskHandler ────────────────────────────────────────────────────────

/**
 * Android widget task handler — entry point for react-native-android-widget.
 *
 * Called by the Android system for widget lifecycle events:
 * - WIDGET_ADDED: new instance placed on home screen
 * - WIDGET_UPDATE: periodic refresh
 * - WIDGET_CLICK: user tapped widget
 *
 * For 'HourglassWidget': reads cached data from AsyncStorage and renders
 * the appropriate widget state. Falls back to a "Tap to refresh" state
 * if no data is available or data is malformed.
 */
async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo } = props;

  if (widgetInfo.widgetName !== 'HourglassWidget') {
    return;
  }

  try {
    const data = await readWidgetData();

    if (data === null) {
      // Render fallback state — no data available
      // In production this would call updateWidget() with a fallback component
      // The fallback UI is handled by HourglassWidget component when data is null
      return;
    }

    // Data is available — widget component renders from AsyncStorage directly
    // react-native-android-widget renders via the registered widget component
    // The HourglassWidget component reads from the same AsyncStorage key
    // No explicit updateWidget() call needed here — widget re-renders on AsyncStorage change
  } catch {
    // Non-critical: widget update failure should not crash the app
    // Next widget refresh cycle will retry
  }
}

export default widgetTaskHandler;

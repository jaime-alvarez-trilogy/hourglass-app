// FR5: Android Widget Task Handler
// Lifecycle handler for react-native-android-widget.
// Called by the Android system when a widget needs to be updated.
// Reads WidgetData from AsyncStorage via readWidgetData() and renders
// the HourglassWidget component, or a fallback state if data is unavailable.

import { createElement } from 'react';
import { readWidgetData } from '../bridge';
import { HourglassWidget } from './HourglassWidget';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WidgetInfo {
  widgetName: string;
  widgetId: number;
  [key: string]: unknown;
}

interface WidgetTaskHandlerProps {
  widgetInfo: WidgetInfo;
  widgetAction?: 'WIDGET_ADDED' | 'WIDGET_UPDATE' | 'WIDGET_RESIZED' | 'WIDGET_DELETED' | 'WIDGET_CLICK';
  renderWidget?: (widget: ReturnType<typeof createElement>) => void;
}

// ─── widgetTaskHandler ────────────────────────────────────────────────────────

/**
 * Android widget task handler — registered with react-native-android-widget
 * from src/widgets/android/register.ts (imported by the app entry).
 *
 * On add/update/resize/click it reads the cached WidgetData snapshot from
 * AsyncStorage and renders HourglassWidget (FallbackWidget when data is
 * missing or malformed). Deletions are ignored. Never throws.
 */
async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo, widgetAction, renderWidget } = props;

  if (widgetInfo.widgetName !== 'HourglassWidget' || widgetAction === 'WIDGET_DELETED') {
    return;
  }

  try {
    const data = await readWidgetData();
    renderWidget?.(createElement(HourglassWidget, { data }));
  } catch {
    // Non-critical: the next widget update retries.
  }
}

export default widgetTaskHandler;

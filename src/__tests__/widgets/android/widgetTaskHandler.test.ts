/**
 * FR5: Android Widget Task Handler tests
 * Tests for src/widgets/android/widgetTaskHandler.ts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock react-native-android-widget — Android-only native module
jest.mock('react-native-android-widget', () => ({
  registerWidgetTaskHandler: jest.fn(),
  updateWidget: jest.fn().mockResolvedValue(undefined),
  FlexWidget: () => null,
  TextWidget: () => null,
  SvgWidget: () => null,
}));

// babel-preset-expo rewrites `import { Platform } from 'react-native'` to a deep
// react-native-web import under jest-expo/node, so mocking 'react-native' alone
// leaves Platform.OS === 'web'. Mock the resolved module to exercise Android.
jest.mock('react-native-web/dist/exports/Platform', () => ({
  __esModule: true,
  default: { OS: 'android', select: (o: Record<string, unknown>) => o.android ?? o.default },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

// Static import for the handler under test
import widgetTaskHandler from '../../../widgets/android/widgetTaskHandler';
import { HourglassWidget } from '../../../widgets/android/HourglassWidget';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeWidgetData() {
  return {
    hours: '32.5',
    hoursDisplay: '32.5h',
    earnings: '$1,300',
    earningsRaw: 1300,
    today: '6.2h',
    hoursRemaining: '7.5h left',
    aiPct: '71%\u201375%',
    brainlift: '3.2h',
    deadline: Date.now() + 6 * 60 * 60 * 1000,
    urgency: 'none',
    pendingCount: 0,
    isManager: false,
    cachedAt: Date.now(),
    useQA: false,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('widgetTaskHandler (FR5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads widget_data from AsyncStorage for HourglassWidget', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(makeWidgetData()));

    await widgetTaskHandler({ widgetInfo: { widgetName: 'HourglassWidget', widgetId: 1 } });

    expect(AsyncStorage.getItem).toHaveBeenCalledWith('widget_data');
  });

  it('does not read AsyncStorage for unknown widget names', async () => {
    await widgetTaskHandler({ widgetInfo: { widgetName: 'UnknownWidget', widgetId: 1 } });

    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });

  it('resolves without throwing when data is null (fallback state)', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      widgetTaskHandler({ widgetInfo: { widgetName: 'HourglassWidget', widgetId: 1 } })
    ).resolves.toBeUndefined();
  });

  it('resolves without throwing when JSON is malformed (fallback state)', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('{ bad json }}}');

    await expect(
      widgetTaskHandler({ widgetInfo: { widgetName: 'HourglassWidget', widgetId: 1 } })
    ).resolves.toBeUndefined();
  });

  it('resolves without throwing when valid data present', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(makeWidgetData()));

    await expect(
      widgetTaskHandler({ widgetInfo: { widgetName: 'HourglassWidget', widgetId: 1 } })
    ).resolves.toBeUndefined();
  });

  it('resolves without throwing when AsyncStorage rejects', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('storage error'));

    await expect(
      widgetTaskHandler({ widgetInfo: { widgetName: 'HourglassWidget', widgetId: 1 } })
    ).resolves.toBeUndefined();
  });
});

describe('widgetTaskHandler rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const info = { widgetName: 'HourglassWidget', widgetId: 1 };

  it('renders HourglassWidget with the stored snapshot', async () => {
    const data = makeWidgetData();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(data));
    const renderWidget = jest.fn();
    await widgetTaskHandler({ widgetInfo: info, widgetAction: 'WIDGET_UPDATE', renderWidget });
    expect(renderWidget).toHaveBeenCalledTimes(1);
    const el = renderWidget.mock.calls[0][0];
    expect(el.type).toBe(HourglassWidget);
    expect(el.props.data).toEqual(data);
  });

  it('renders the fallback (data null) when nothing is stored', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    const renderWidget = jest.fn();
    await widgetTaskHandler({ widgetInfo: info, widgetAction: 'WIDGET_ADDED', renderWidget });
    expect(renderWidget.mock.calls[0][0].props.data).toBeNull();
  });

  it('does nothing on WIDGET_DELETED', async () => {
    const renderWidget = jest.fn();
    await widgetTaskHandler({ widgetInfo: info, widgetAction: 'WIDGET_DELETED', renderWidget });
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(renderWidget).not.toHaveBeenCalled();
  });

  it('swallows renderWidget errors', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    const renderWidget = jest.fn(() => { throw new Error('bad'); });
    await expect(
      widgetTaskHandler({ widgetInfo: info, widgetAction: 'WIDGET_UPDATE', renderWidget })
    ).resolves.toBeUndefined();
  });
});

describe('Android widget registration', () => {
  it('registers the task handler on Android at import', () => {
    let registered: jest.Mock | undefined;
    let handler: unknown;
    jest.isolateModules(() => {
      require('../../../widgets/android/register');
      registered = require('react-native-android-widget').registerWidgetTaskHandler;
      handler = require('../../../widgets/android/widgetTaskHandler').default;
    });
    expect(registered).toHaveBeenCalledWith(handler);
  });

  it('is imported by the app entry', () => {
    const fs = require('fs');
    const path = require('path');
    const entry = fs.readFileSync(path.resolve(__dirname, '../../../../index.ts'), 'utf8');
    expect(entry).toContain("./src/widgets/android/register");
  });
});

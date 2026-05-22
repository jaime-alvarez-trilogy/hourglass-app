# src/widgets/

App ↔ home-screen widget bridge. Cross-platform: iOS uses `expo-widgets` (JSX → SwiftUI), Android uses `react-native-android-widget`.

**Full map:** `docs/ARCHITECTURE.md` §7 (Widget Data Contract).

## What lives here

- `bridge.ts` — `updateWidgetData()` (the canonical write path), `readWidgetData()`, `buildTimelineEntries()` (iOS), the iOS layout function (`:459-833`, ~900-line ES5 string evaluated inside the widget extension).
- `types.ts` — `WidgetData`, `WidgetUrgency`, `WidgetDailyEntry`, `WidgetApprovalItem`. The canonical contract between app and widget.
- `ios/HourglassWidget.tsx` — iOS widget UI (declarative tree, compiled to SwiftUI).
- `android/HourglassWidget.tsx` — Android widget UI (excluded from TS by `tsconfig.json`).
- `android/widgetTaskHandler.ts` — Android background task that reads widget data and re-renders.

## Invariants — do not break these

1. **`WidgetData` is a flat, display-ready shape.** All formatting (currency, units, "+/-" prefixes) happens in the app before write. The widget does no formatting. If you add a field, decide formatting on the app side.
2. **`daily` is always exactly 7 entries, Monday[0] through Sunday[6].** Padding, ordering, and length are not optional. Tests in `src/widgets/__tests__/` enforce this.
3. **`approvalItems` is capped at 3.** Same for `myRequests`. Widget space is fixed.
4. **iOS reads via timeline, not via AsyncStorage.** `updateWidgetData` writes to App Group UserDefaults via `expo-widgets`. The 96-entry timeline (`buildTimelineEntries`) lets the widget transition through urgency states without waking the extension.
5. **Android reads via AsyncStorage.** Same JSON key (`widget_data`) the app writes. The task handler at `src/widgets/android/widgetTaskHandler.ts` reads it.
6. **The iOS layout function is an ES5 JS string.** It's compiled into the widget extension's JSContext. No ES2015+ syntax (no `const`/`let`, no arrow functions, no template literals). Stick to `var`, `function`, string concatenation. Tests catch most violations; runtime errors in the layout are silent.
7. **The bridge is also called from the background push handler**, not just from `useWidgetSync`. Both paths must produce the same widget state. See `docs/ARCHITECTURE.md` §4.3.

## Before changing anything here

1. Read `docs/ARCHITECTURE.md` §7.
2. If changing `WidgetData` shape: update `types.ts` AND every writer in the app (search for `updateWidgetData`).
3. If changing the iOS layout: remember it's ES5. Test on a real device — TypeScript will not catch JSContext-level errors.
4. Run `npm test -- src/widgets/__tests__/` before and after.

## Common pitfalls

- Adding an unformatted field (e.g. raw `Date` object) and expecting the widget to format it. Widget cannot.
- Reading `widget_data` directly from a React component to derive UI state. Use the underlying hook (`useHoursData`, `useApprovalItems`, etc.) — widget data is for the widget.
- Forgetting that timeline entries pre-compute urgency for future timestamps. Changing the urgency formula requires updating `buildTimelineEntries` too.

// Native widget background for the expo-widgets 58 update window (spec 10 FR6, Decision 5 (b), I7).
//
// expo-widgets 56.0.0 removed the hard-coded container background "in favor of @expo/ui modifier".
// The JS layout (src/widgets/bridge.ts WIDGET_LAYOUT_JS) now sets containerBackground on every
// system root, but WidgetKit renders the layout string stored in the App Group, and after the
// 1.1.0 -> 1.2.0 update that is still build 18's layout, with no containerBackground, until the
// user opens 1.2.0 once. iOS 17+ replaces a widget without a container background with its
// "Please adopt containerBackground API" placeholder. This plugin puts the build-18 background
// (#0D0D1A) back on the generated entry view, so any stored layout gets it. Same color as the JS
// modifier, so applying both is harmless.
//
// Order: list it in app.json immediately BEFORE the "expo-widgets" tuple. A plugin listed earlier
// registers its mod earlier, and @expo/config-plugins runs the most recently registered mod first
// (withMod: action, then nextMod), so this edit runs after expo-widgets has written the file.
//
// Editing this file changes the native fingerprint (a local config plugin is hashed), so ship
// changes with a native build, not an OTA update.

const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const TARGET_DIR = 'ExpoWidgetsTarget';
const FILE = 'HourglassWidget.swift';
const ANCHOR = 'WidgetsEntryView(entry: entry)';
const MODIFIER = '.modifier(HourglassContainerBackground())';
const STRUCT_DECLARATION = 'struct HourglassContainerBackground: ViewModifier';
const UNMODIFIED_ANCHOR = /WidgetsEntryView\(entry: entry\)(?!\.modifier\(HourglassContainerBackground\(\)\))/g;

const STRUCT = `

// Added by plugins/withHourglassWidgetBackground.js (spec 10 FR6): the build-18 widget
// background, for layouts stored by builds that predate the JS containerBackground modifier.
${STRUCT_DECLARATION} {
  @ViewBuilder
  func body(content: Content) -> some View {
    if #available(iOS 17.0, *) {
      content.containerBackground(Color(red: 0.051, green: 0.051, blue: 0.102), for: .widget)
    } else {
      content
    }
  }
}
`;

/**
 * Pure. Adds `.modifier(HourglassContainerBackground())` to the generated entry view and appends
 * the modifier struct. Idempotent. Throws if expo-widgets' template no longer has the anchor, so
 * a template change fails the prebuild instead of silently shipping a widget without a background.
 */
function addContainerBackground(source) {
  if (!source.includes(ANCHOR)) {
    throw new Error(`${FILE}: anchor '${ANCHOR}' not found`);
  }
  let out = source.replace(UNMODIFIED_ANCHOR, ANCHOR + MODIFIER);
  if (!out.includes(STRUCT_DECLARATION)) {
    out = out.replace(/\s*$/, '') + STRUCT;
  }
  return out;
}

const withHourglassWidgetBackground = (config) =>
  withDangerousMod(config, [
    'ios',
    async (config) => {
      const file = path.join(config.modRequest.platformProjectRoot, TARGET_DIR, FILE);
      if (!fs.existsSync(file)) {
        throw new Error(
          `${FILE}: not found at ${file}. expo-widgets generates it; list this plugin before "expo-widgets" in app.json.`,
        );
      }
      const source = fs.readFileSync(file, 'utf8');
      const updated = addContainerBackground(source);
      if (updated !== source) {
        fs.writeFileSync(file, updated);
      }
      return config;
    },
  ]);

module.exports = withHourglassWidgetBackground;
module.exports.default = withHourglassWidgetBackground;
module.exports.addContainerBackground = addContainerBackground;

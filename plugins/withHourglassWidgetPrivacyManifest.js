// Privacy manifest for the widget extension (spec 10 FR6, Decision 5, spec-research F2.10, I10).
//
// React Native's privacy aggregation writes PrivacyInfo.xcprivacy only for `:application` targets
// (react-native@0.88.0 scripts/cocoapods/privacy_manifest_utils.rb:52-54), and expo's
// ios.privacyManifests goes to the app target only. ExpoWidgetsTarget is an app extension that
// links React Native, expo, expo-widgets and @expo/ui, and reads app-group UserDefaults
// (expo-widgets ios/WidgetsStorage.swift), so without this plugin the appex ships no manifest and
// App Store Connect can flag it (ITMS-91053). The reasons are RN core's (UserDefaults CA92.1,
// FileTimestamp C617.1, SystemBootTime 35F9.1) plus the app-group reason 1C8F.1. Data collection
// stays declared on the app; the extension declares none.
//
// Order: list it in app.json immediately BEFORE "./plugins/withHourglassWidgetBackground", so both
// precede the "expo-widgets" tuple. The most recently registered mod runs first, so these mods run
// after expo-widgets has generated ExpoWidgetsTarget/ and added the target to the Xcode project.
//
// Editing this file changes the native fingerprint (a local config plugin is hashed), so ship
// changes with a native build, not an OTA update.

const fs = require('fs');
const path = require('path');
const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const TARGET = 'ExpoWidgetsTarget';
const FILE = 'PrivacyInfo.xcprivacy';
const BUILD_FILE_COMMENT = `${FILE} in Resources`;

/** Pure. A fresh copy of the extension's manifest on every call. */
function buildWidgetPrivacyManifest() {
  return {
    NSPrivacyTracking: false,
    NSPrivacyTrackingDomains: [],
    NSPrivacyCollectedDataTypes: [],
    NSPrivacyAccessedAPITypes: [
      {
        NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
        NSPrivacyAccessedAPITypeReasons: ['CA92.1', '1C8F.1'],
      },
      {
        NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
        NSPrivacyAccessedAPITypeReasons: ['C617.1'],
      },
      {
        NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
        NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
      },
    ],
  };
}

function escapeXml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Minimal XML plist writer for the value types a privacy manifest uses (dict, array, string, bool). */
function plistValue(value, depth) {
  const pad = '\t'.repeat(depth);
  if (typeof value === 'boolean') return `${pad}<${value}/>`;
  if (typeof value === 'string') return `${pad}<string>${escapeXml(value)}</string>`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}<array/>`;
    return [`${pad}<array>`, ...value.map((v) => plistValue(v, depth + 1)), `${pad}</array>`].join('\n');
  }
  if (value && typeof value === 'object') {
    const lines = [`${pad}<dict>`];
    for (const [key, v] of Object.entries(value)) {
      lines.push(`${pad}\t<key>${escapeXml(key)}</key>`, plistValue(v, depth + 1));
    }
    lines.push(`${pad}</dict>`);
    return lines.join('\n');
  }
  throw new TypeError(`Unsupported plist value: ${JSON.stringify(value)}`);
}

function toPlistXml(value) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    plistValue(value, 0),
    '</plist>',
    '',
  ].join('\n');
}

function unquote(value) {
  return typeof value === 'string' ? value.replace(/^"(.*)"$/, '$1') : value;
}

/** The group expo-widgets creates for the target: a child of the main group with path = target. */
function findTargetGroup(project, targetName) {
  const { firstProject } = project.getFirstProject();
  const mainGroup = project.getPBXGroupByKey(firstProject.mainGroup);
  for (const child of (mainGroup && mainGroup.children) || []) {
    const group = project.getPBXGroupByKey(child.value);
    if (group && unquote(group.path) === targetName) return group;
  }
  return null;
}

/** The target's own PBXResourcesBuildPhase, or null. (xcode's pbxResourcesBuildPhaseObj falls back
 *  to the first Resources phase in the project, the app's, when the target has none.) */
function findTargetResourcesPhase(project, targetUuid) {
  const target = project.pbxNativeTargetSection()[targetUuid];
  const phases = project.hash.project.objects.PBXResourcesBuildPhase || {};
  for (const ref of target.buildPhases || []) {
    if (typeof phases[ref.value] === 'object') return phases[ref.value];
  }
  return null;
}

/**
 * Pure apart from mutating `project` (an `xcode` package project, as withXcodeProject provides).
 * Adds ExpoWidgetsTarget/PrivacyInfo.xcprivacy to the target's group and to the target's Resources
 * build phase, creating the phase if the target has none. Idempotent. Never touches other targets.
 */
function addPrivacyManifestToTarget(project, targetName = TARGET) {
  const targetUuid = project.findTargetKey(targetName);
  if (!targetUuid) {
    throw new Error(`${targetName}: target not found`);
  }
  const group = findTargetGroup(project, targetName);
  if (!group) {
    throw new Error(`${targetName}: group not found`);
  }

  let phase = findTargetResourcesPhase(project, targetUuid);
  if (!phase) {
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', targetUuid);
    phase = findTargetResourcesPhase(project, targetUuid);
  }

  const fileRefs = project.pbxFileReferenceSection();
  let fileRef = (group.children || []).find(
    (child) => child.comment === FILE && fileRefs[child.value] && unquote(fileRefs[child.value].path) === FILE,
  );
  let fileRefUuid = fileRef && fileRef.value;
  if (!fileRefUuid) {
    fileRefUuid = project.generateUuid();
    fileRefs[fileRefUuid] = { isa: 'PBXFileReference', lastKnownFileType: 'text.xml', path: FILE, sourceTree: '"<group>"' };
    fileRefs[`${fileRefUuid}_comment`] = FILE;
    group.children.push({ value: fileRefUuid, comment: FILE });
  }

  const buildFiles = project.pbxBuildFileSection();
  const alreadyInPhase = phase.files.some((f) => buildFiles[f.value] && buildFiles[f.value].fileRef === fileRefUuid);
  if (!alreadyInPhase) {
    const buildFileUuid = project.generateUuid();
    buildFiles[buildFileUuid] = { isa: 'PBXBuildFile', fileRef: fileRefUuid, fileRef_comment: FILE };
    buildFiles[`${buildFileUuid}_comment`] = BUILD_FILE_COMMENT;
    phase.files.push({ value: buildFileUuid, comment: BUILD_FILE_COMMENT });
  }
  return project;
}

const withHourglassWidgetPrivacyManifest = (config) => {
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, TARGET);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, FILE), toPlistXml(buildWidgetPrivacyManifest()));
      return config;
    },
  ]);
  return withXcodeProject(config, (config) => {
    addPrivacyManifestToTarget(config.modResults, TARGET);
    return config;
  });
};

module.exports = withHourglassWidgetPrivacyManifest;
module.exports.default = withHourglassWidgetPrivacyManifest;
module.exports.buildWidgetPrivacyManifest = buildWidgetPrivacyManifest;
module.exports.addPrivacyManifestToTarget = addPrivacyManifestToTarget;

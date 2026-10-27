#!/usr/bin/env bash
# Local App Store build for Hourglass (iOS only). Runbook: docs/RELEASING.md, "Native release".
#
#   scripts/build-ios-local.sh [--dry-run]
#
# Builds the committed, pushed tree on this Mac with `eas build --local` (profile "production"),
# checks the IPA, and tags the commit with an annotated build-<N> tag that records the runtime.
# A local build leaves no EAS build record, so that tag is what scripts/ota-publish.sh's audience
# guard reads instead, once origin has it. This script never pushes it: push it only after App
# Store Connect lists the build as VALID (the report prints the commands).
# Steps, in order; every refusal prints to stderr and exits 1 before the next step runs:
#   1. arguments  2. clean, pushed tree  3. app.json version and build number  4. build number
#   unused (no build-<N> tag here or on origin)  5. Xcode major matches the eas.json image pin
#   6. 40-hex fingerprint runtime  7. output path  8. --dry-run stops here  9. build
#   10. IPA check  11. sha256  12. tag  13. report
# Exit codes: 0 built and tagged, or dry run OK; 1 refusal, or an IPA that fails step 10 (the IPA
# is kept and no tag is created); N when `eas build` itself exits N.
#
# Must run on macOS's stock bash 3.2: no associative arrays, mapfile or case-modifying
# expansions, and no arrays at all (an empty array trips `set -u` on 3.2). JSON goes through node.

set -euo pipefail

USAGE='Usage: scripts/build-ios-local.sh [--dry-run]'
PROFILE=production

# die <line>...: print each argument as a line on stderr and exit 1.
die() {
  printf '%s\n' "$@" >&2
  exit 1
}

usage_error() {
  die "build-ios-local: $1" "$USAGE"
}

# quote <value>: single-quote a value so a printed command can be pasted as is.
quote() {
  local q="'"
  printf '%s' "'${1//$q/$q\\$q$q}'"
}

# Work from the repo root whatever the caller's cwd is (CDPATH could make `cd` print the path).
ROOT=$(CDPATH='' cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

# --- 1. Arguments ---------------------------------------------------------------------------
dry_run=0
if [ "$#" -gt 0 ] && [ "$1" = "--dry-run" ]; then
  dry_run=1
  shift
fi
[ "$#" -eq 0 ] || usage_error "unexpected argument \"$1\" (the only option is a leading --dry-run)"

# --- 2. Clean, pushed tree ------------------------------------------------------------------
# The build must be reproducible from a commit that origin has: an unpushed commit is how build
# 15's recorded commit went missing (docs/RELEASING.md, section B).
porcelain=$(git status --porcelain) || die "Refusing to build: git status failed in $ROOT"
if [ -n "$porcelain" ]; then
  die "Refusing to build: uncommitted changes" "$porcelain" \
    "Commit or stash them (untracked files too), then retry."
fi
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null) ||
  die "Refusing to build: HEAD is not on a branch with an upstream" \
    "  Push the branch first: git push -u origin <branch>"
ahead=$(git rev-list --count '@{u}..HEAD') ||
  die "Refusing to build: \`git rev-list --count @{u}..HEAD\` failed"
if [ "$ahead" != 0 ]; then
  die "Refusing to build: HEAD has $ahead commit(s) that $upstream doesn't have" \
    "  Push them first (git push), then retry."
fi
HEAD_SHA=$(git rev-parse HEAD) || die "Refusing to build: git rev-parse HEAD failed"
COMMIT=$(git rev-parse --short HEAD)

# --- 3. Version and build number ------------------------------------------------------------
# eas.json pins cli.appVersionSource to "local", so these app.json values are what EAS builds.
app_fields=$(node -e '
  const { expo = {} } = JSON.parse(require("fs").readFileSync("app.json", "utf8"));
  const version = expo.version;
  const build = (expo.ios || {}).buildNumber;
  if (typeof version !== "string" || !/^[0-9]+(\.[0-9]+){0,2}$/.test(version)) {
    console.error(`expo.version must be a string like "1.2.0", got ${JSON.stringify(version)}`);
    process.exit(1);
  }
  if (typeof build !== "string" || !/^[1-9][0-9]*$/.test(build)) {
    console.error(`expo.ios.buildNumber must be a positive integer string, got ${JSON.stringify(build)}`);
    process.exit(1);
  }
  console.log(`${version}|${build}`);
') || die "Refusing to build: app.json has no usable expo.version and expo.ios.buildNumber (see above)"
IFS='|' read -r VERSION BUILD <<EOF
$app_fields
EOF
TAG="build-$BUILD"

# --- 4. Build number unused -----------------------------------------------------------------
# A build-<N> tag means build N was already made. App Store Connect is the final word (a number
# that reached it is burned even untagged: docs/RELEASING.md, Pre-flight step 2). Fails closed:
# if origin can't be asked, nothing is built.
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  die "Refusing to build: tag $TAG already exists here, so build $BUILD is taken" \
    "  Set app.json expo.ios.buildNumber to the next unused number (docs/RELEASING.md, Pre-flight step 2)."
fi
remote_tag=$(GIT_TERMINAL_PROMPT=0 git ls-remote --tags origin "refs/tags/$TAG") ||
  die "Refusing to build: \`git ls-remote --tags origin\` failed (output above), so build $BUILD can't be checked as unused"
if [ -n "$remote_tag" ]; then
  die "Refusing to build: tag $TAG already exists on origin, so build $BUILD is taken" \
    "  Set app.json expo.ios.buildNumber to the next unused number (docs/RELEASING.md, Pre-flight step 2)."
fi

# --- 5. Xcode -------------------------------------------------------------------------------
# eas.json's image pin names the Xcode that store builds use (docs/RELEASING.md, SDK upgrade
# step 4). A local build ignores the image and uses whatever `xcodebuild` resolves to, which
# honours DEVELOPER_DIR. The major decides the iOS SDK, which App Store Connect checks, so it must
# match; a different minor or patch only warns.
pin=$(node -e '
  const eas = JSON.parse(require("fs").readFileSync("eas.json", "utf8"));
  const image = (((eas.build || {}).production || {}).ios || {}).image;
  process.stdout.write(typeof image === "string" ? image.replace(/[\r\n]/g, " ") : "");
') || die "Refusing to build: could not read build.production.ios.image from eas.json"
PIN_XCODE=${pin##*-xcode-}
if [ "$PIN_XCODE" = "$pin" ] || ! [[ "$PIN_XCODE" =~ ^[0123456789]+\.[0123456789]+$ ]]; then
  die "Refusing to build: eas.json build.production.ios.image is \"$pin\", which pins no Xcode" \
    "  It must end in -xcode-<major>.<minor> (e.g. macos-tahoe-26.6-xcode-27.1): that names the" \
    "  Xcode a local build must use (docs/RELEASING.md, SDK upgrade step 4)."
fi
PIN_MAJOR=${PIN_XCODE%%.*}

xcode_out=$(xcodebuild -version) ||
  die "Refusing to build: \`xcodebuild -version\` failed (output above)" \
    "  Install Xcode $PIN_MAJOR, or point DEVELOPER_DIR at it."
XCODE_VERSION=''
XCODE_BUILD=''
while IFS= read -r line; do
  case "$line" in
    'Xcode '*) XCODE_VERSION=${line#Xcode } ;;
    'Build version '*) XCODE_BUILD=${line#Build version } ;;
  esac
done <<EOF
$xcode_out
EOF
if ! [[ "$XCODE_VERSION" =~ ^[0123456789]+(\.[0123456789]+){0,2}$ ]] || [ -z "$XCODE_BUILD" ]; then
  die "Refusing to build: could not read the Xcode version and build from \`xcodebuild -version\`:" "$xcode_out"
fi
XCODE_MAJOR=${XCODE_VERSION%%.*}
if [ "$XCODE_MAJOR" != "$PIN_MAJOR" ]; then
  die "Refusing to build: this Mac builds with Xcode $XCODE_VERSION ($XCODE_BUILD), but eas.json pins Xcode $PIN_XCODE ($pin)" \
    "  The Xcode major decides the iOS SDK. Install Xcode $PIN_MAJOR and select it, for one run with" \
    "  DEVELOPER_DIR=/Applications/<Xcode $PIN_MAJOR>.app/Contents/Developer, then retry."
fi
if [ "$XCODE_VERSION" != "$PIN_XCODE" ]; then
  printf '%s\n' \
    "WARNING: this Mac builds with Xcode $XCODE_VERSION ($XCODE_BUILD); eas.json pins Xcode $PIN_XCODE ($pin)" \
    "  Same major, so the IPA still gets the iOS $PIN_MAJOR SDK that App Store Connect requires. Continuing." >&2
fi
# DTXcode, as Xcode writes it into Info.plist: 27.0 -> 2700, 26.2 -> 2620, 15.0.1 -> 1501.
# 10# forces base 10: printf and $(( )) read a leading 0 as octal, so "08" would abort the script
# with a bare bash error and "010" would silently become 8.
xcode_rest=${XCODE_VERSION#"$XCODE_MAJOR"}
xcode_rest=${xcode_rest#.}
XCODE_MINOR=${xcode_rest%%.*}
XCODE_PATCH=${xcode_rest#"$XCODE_MINOR"}
XCODE_PATCH=${XCODE_PATCH#.}
DT_XCODE=$(printf '%02d%d%d' "$((10#$XCODE_MAJOR))" "$((10#${XCODE_MINOR:-0}))" "$((10#${XCODE_PATCH:-0}))")

# --- 6. Runtime -----------------------------------------------------------------------------
# Same resolver as scripts/ota-publish.sh step 3. Step 10 checks that the IPA embeds this value.
rtv_json=$(npx expo-updates runtimeversion:resolve --platform ios) ||
  die "Refusing to build: \`npx expo-updates runtimeversion:resolve --platform ios\` failed (output above)"
RTV=$(printf '%s' "$rtv_json" | node -e '
  const out = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (!out || typeof out.runtimeVersion !== "string") {
    console.error("no string runtimeVersion field in the resolver output");
    process.exit(1);
  }
  process.stdout.write(out.runtimeVersion);
') || die "Refusing to build: could not read runtimeVersion from \`npx expo-updates runtimeversion:resolve --platform ios\`"
# Explicit hex digits instead of a range, so no locale can let uppercase through.
if ! [[ "$RTV" =~ ^[0123456789abcdef]{40}$ ]]; then
  die "Refusing to build: runtime version \"$RTV\" is not a fingerprint hash" \
    "  app.json must keep runtimeVersion { \"policy\": \"fingerprint\" }; a literal runtime belongs only on a" \
    "  runbook emergency branch (docs/RELEASING.md, section B), never on main."
fi

# --- 7. Output path -------------------------------------------------------------------------
# Outside the repo by default, so the IPA can never dirty the tree. An existing file means this
# build number was already built here.
BUILD_DIR=${HOURGLASS_BUILD_DIR:-$HOME/hourglass-builds}
case "$BUILD_DIR" in
  /*) ;;
  *) die "Refusing to build: HOURGLASS_BUILD_DIR must be an absolute path, got \"$BUILD_DIR\"" ;;
esac
IPA="${BUILD_DIR%/}/hourglass-$VERSION-$BUILD.ipa"
if [ -e "$IPA" ]; then
  die "Refusing to build: $IPA already exists" \
    "  Build $BUILD was already built on this Mac. If that IPA never reached App Store Connect (eas or" \
    "  its IPA check failed), delete it and rerun; otherwise take the next unused build number."
fi

# --- 8. Dry run -----------------------------------------------------------------------------
# Keep in sync with the eas build call in step 9.
build_command="EXPO_NO_DOTENV=1 eas build --local --platform ios --profile $PROFILE --non-interactive --output $(quote "$IPA")"
xcode_line="$XCODE_VERSION ($XCODE_BUILD), eas.json pins $PIN_XCODE"
if [ -n "${DEVELOPER_DIR:-}" ]; then
  xcode_line="$xcode_line, DEVELOPER_DIR=$DEVELOPER_DIR"
fi
if [ "$dry_run" = 1 ]; then
  printf '%s\n' \
    "Dry run OK: nothing was built or tagged" \
    "  commit:   $COMMIT ($upstream)" \
    "  version:  $VERSION" \
    "  build:    $BUILD (tag $TAG is free here and on origin)" \
    "  runtime:  $RTV" \
    "  xcode:    $xcode_line" \
    "  output:   $IPA" \
    "  command:  $build_command"
  exit 0
fi

# --- 9. Build -------------------------------------------------------------------------------
# EXPO_NO_DOTENV=1 keeps .env.local (gitignored, never seen by cloud builds) out of the config
# and bundle, as in scripts/ota-publish.sh.
mkdir -p "$BUILD_DIR" || die "Refusing to build: could not create $BUILD_DIR"
build_status=0
EXPO_NO_DOTENV=1 eas build --local --platform ios --profile "$PROFILE" --non-interactive \
  --output "$IPA" || build_status=$?
if [ "$build_status" -ne 0 ]; then
  printf '%s\n' "ERROR: eas build --local failed with exit code $build_status (output above); nothing was tagged" >&2
  exit "$build_status"
fi
[ -f "$IPA" ] || die "ERROR: eas build --local exited 0 but wrote no $IPA; nothing was tagged"
# eas built the commit that was HEAD when it started. If HEAD has moved since step 2, which
# commit that was is unknown, so the tag can't be placed.
head_now=$(git rev-parse HEAD) || die "ERROR: git rev-parse HEAD failed after the build; nothing was tagged"
if [ "$head_now" != "$HEAD_SHA" ]; then
  die "ERROR: HEAD moved during the build (was $COMMIT); nothing was tagged" \
    "  Don't upload $IPA. Delete it, then rerun on the commit you mean to ship."
fi

# --- 10. IPA check --------------------------------------------------------------------------
# Plists come out with `unzip -p` and are read with plutil, which handles the binary plists Xcode
# writes. Value mismatches are collected so one run reports them all.
WORK=$(mktemp -d "${TMPDIR:-/tmp}/build-ios-local.XXXXXX") ||
  die "ERROR: mktemp failed; $IPA is kept and nothing was tagged"
trap 'rm -rf "$WORK"' EXIT
nl='
'
problems=''

# problem <line>: record an IPA check failure.
problem() {
  problems="$problems  - $1$nl"
}

# ipa_fail <line>...: stop on an IPA check failure that later checks can't get past.
ipa_fail() {
  die "IPA check failed: $IPA" "$@" "  The IPA is kept for inspection and no tag was created. Don't upload it."
}

entries=$(unzip -Z1 "$IPA") || ipa_fail "  unzip can't list it, so it isn't a readable IPA"

# has_entry <name>: the IPA has an entry with exactly this name.
has_entry() {
  case "$nl$entries$nl" in
    *"$nl$1$nl"*) return 0 ;;
  esac
  return 1
}

# extract <entry> <file>: copy one IPA entry to a file. unzip reads the name as a wildcard
# pattern, so names with wildcard characters are refused instead of guessed at.
extract() {
  case "$1" in
    *'*'* | *'?'* | *'['* | *'\'*) ipa_fail "  entry name \"$1\" has a wildcard character" ;;
  esac
  has_entry "$1" || return 1
  unzip -p "$IPA" "$1" >"$2"
}

# plist_get <plist> <keypath>: print one value in plutil's raw format (strings as is, booleans as
# true/false, arrays as their count). Fails when the key is missing.
plist_get() {
  plutil -extract "$2" raw -o - "$1" 2>/dev/null
}

# check_profile <bundle dir> <label>: its embedded.mobileprovision must be an App Store profile.
check_profile() {
  local profile="$WORK/profile.plist"
  if ! extract "$1/embedded.mobileprovision" "$WORK/embedded.mobileprovision"; then
    problem "$2: no embedded.mobileprovision"
    return 0
  fi
  if ! security cms -D -i "$WORK/embedded.mobileprovision" >"$profile" 2>/dev/null; then
    problem "$2: \`security cms -D\` can't decode embedded.mobileprovision"
    return 0
  fi
  if plist_get "$profile" ProvisionedDevices >/dev/null; then
    problem "$2: the profile lists ProvisionedDevices (a development or ad hoc profile, not App Store)"
  fi
  if plist_get "$profile" ProvisionsAllDevices >/dev/null; then
    problem "$2: the profile has ProvisionsAllDevices (an enterprise profile, not App Store)"
  fi
  local get_task_allow
  get_task_allow=$(plist_get "$profile" Entitlements.get-task-allow) || get_task_allow='(missing)'
  if [ "$get_task_allow" != false ]; then
    problem "$2: the profile's get-task-allow is $get_task_allow, not false (a debuggable build)"
  fi
}

# check_versions <Info.plist file> <label>: CFBundleShortVersionString and CFBundleVersion.
check_versions() {
  local short build
  short=$(plist_get "$1" CFBundleShortVersionString) || short='(missing)'
  build=$(plist_get "$1" CFBundleVersion) || build='(missing)'
  [ "$short" = "$VERSION" ] || problem "$2: CFBundleShortVersionString is $short, not $VERSION"
  [ "$build" = "$BUILD" ] || problem "$2: CFBundleVersion is $build, not $BUILD"
}

app_plist=''
while IFS= read -r entry; do
  case "$entry" in
    Payload/*.app/Info.plist)
      rest=${entry#Payload/}
      case "${rest%/Info.plist}" in
        */*) ;;
        *)
          [ -z "$app_plist" ] || ipa_fail "  more than one app under Payload/"
          app_plist=$entry
          ;;
      esac
      ;;
  esac
done <<EOF
$entries
EOF
[ -n "$app_plist" ] || ipa_fail "  no Payload/<App>.app/Info.plist"
APP=${app_plist%/Info.plist}

extract "$app_plist" "$WORK/Info.plist" || ipa_fail "  can't extract $app_plist"
check_versions "$WORK/Info.plist" "${APP#Payload/}"
dt_xcode=$(plist_get "$WORK/Info.plist" DTXcode) || dt_xcode='(missing)'
dt_xcode_build=$(plist_get "$WORK/Info.plist" DTXcodeBuild) || dt_xcode_build='(missing)'
SDK_NAME=$(plist_get "$WORK/Info.plist" DTSDKName) || SDK_NAME='(missing)'
# The SDK build for the tag: DTPlatformBuild, or DTSDKBuild when that is missing or empty.
SDK_BUILD=$(plist_get "$WORK/Info.plist" DTPlatformBuild) || SDK_BUILD=''
if [ -z "$SDK_BUILD" ]; then
  SDK_BUILD=$(plist_get "$WORK/Info.plist" DTSDKBuild) || SDK_BUILD=''
fi
[ "$dt_xcode" = "$DT_XCODE" ] ||
  problem "${APP#Payload/}: DTXcode is $dt_xcode, but xcodebuild -version says $XCODE_VERSION ($DT_XCODE)"
[ "$dt_xcode_build" = "$XCODE_BUILD" ] ||
  problem "${APP#Payload/}: DTXcodeBuild is $dt_xcode_build, but xcodebuild -version says $XCODE_BUILD"
case "$SDK_NAME" in
  "iphoneos$PIN_MAJOR".*) ;;
  *) problem "${APP#Payload/}: DTSDKName is $SDK_NAME, not iphoneos$PIN_MAJOR.x (the SDK of the pinned Xcode $PIN_MAJOR)" ;;
esac
[ -n "$SDK_BUILD" ] || problem "${APP#Payload/}: Info.plist has neither DTPlatformBuild nor DTSDKBuild"

# Every app extension (the widget, ExpoWidgetsTarget.appex) must carry the same version and build.
appex_count=0
while IFS= read -r entry; do
  case "$entry" in
    "$APP"/PlugIns/*.appex/Info.plist)
      appex=${entry%/Info.plist}
      case "${appex#"$APP"/PlugIns/}" in */*) continue ;; esac
      appex_count=$((appex_count + 1))
      if extract "$entry" "$WORK/appex-Info.plist"; then
        check_versions "$WORK/appex-Info.plist" "${appex#Payload/}"
      else
        problem "${appex#Payload/}: can't extract Info.plist"
      fi
      check_profile "$appex" "${appex#Payload/}"
      ;;
  esac
done <<EOF
$entries
EOF

# expo-updates (SDK 58, runtimeVersion policy "fingerprint") writes the literal "file:fingerprint"
# to Expo.plist's EXUpdatesRuntimeVersion, and its "Generate updates resources" build phase writes
# the hash to EXUpdates.bundle/fingerprint, which UpdatesConfig.swift reads at launch. A literal
# runtime would sit in Expo.plist itself.
embedded_rtv=''
if extract "$APP/Expo.plist" "$WORK/Expo.plist"; then
  plist_rtv=$(plist_get "$WORK/Expo.plist" EXUpdatesRuntimeVersion) || plist_rtv=''
  if [ "$plist_rtv" = "file:fingerprint" ]; then
    if extract "$APP/EXUpdates.bundle/fingerprint" "$WORK/fingerprint"; then
      embedded_rtv=$(cat "$WORK/fingerprint")
    else
      problem "${APP#Payload/}: Expo.plist says file:fingerprint, but there's no EXUpdates.bundle/fingerprint"
    fi
  elif [ -n "$plist_rtv" ]; then
    embedded_rtv=$plist_rtv
  else
    problem "${APP#Payload/}: Expo.plist has no EXUpdatesRuntimeVersion"
  fi
else
  problem "${APP#Payload/}: no Expo.plist, so the embedded runtime can't be found"
fi
if [ -n "$embedded_rtv" ] && [ "$embedded_rtv" != "$RTV" ]; then
  problem "${APP#Payload/}: the embedded runtime is $embedded_rtv, but this tree resolves $RTV (run \`npm ci\` and resolve again: docs/RELEASING.md, If something fails)"
fi

check_profile "$APP" "${APP#Payload/}"

if [ -n "$problems" ]; then
  printf '%s\n' "IPA check failed: $IPA" >&2
  printf '%s' "$problems" >&2
  die "  The IPA is kept for inspection and no tag was created. Don't upload it."
fi

# --- 11. sha256 -----------------------------------------------------------------------------
sha_out=$(shasum -a 256 "$IPA") || die "ERROR: shasum failed on $IPA; nothing was tagged"
IPA_SHA=${sha_out%% *}
if ! [[ "$IPA_SHA" =~ ^[0123456789abcdef]{64}$ ]]; then
  die "ERROR: shasum printed \"$sha_out\", not a sha256; nothing was tagged"
fi

# --- 12. Tag --------------------------------------------------------------------------------
# Annotated, at the commit eas built, and local only. scripts/ota-publish.sh reads its Runtime:,
# Version: and Build: lines once origin has this exact tag object (step 13 says when to push).
tag_message="Hourglass $VERSION ($BUILD), local build

Version: $VERSION
Build: $BUILD
Runtime: $RTV
Xcode: $XCODE_VERSION ($XCODE_BUILD)
SDK: $SDK_NAME ($SDK_BUILD)
IPA-SHA256: $IPA_SHA"
git tag -a "$TAG" -m "$tag_message" "$HEAD_SHA" ||
  die "ERROR: git tag failed (output above); $IPA passed its checks but is untagged"

# --- 13. Report -----------------------------------------------------------------------------
printf '%s\n' \
  "Built and tagged; the tag is not pushed" \
  "  commit:   $COMMIT" \
  "  runtime:  $RTV" \
  "  xcode:    $XCODE_VERSION ($XCODE_BUILD), SDK $SDK_NAME ($SDK_BUILD)" \
  "  widgets:  $appex_count extension(s) checked" \
  "  ipa:      $IPA" \
  "  sha256:   $IPA_SHA" \
  "  tag:      $TAG (annotated, local only)" \
  "Next (docs/RELEASING.md, Upload):" \
  "  1. From the main checkout: eas submit -p ios --profile $PROFILE --path $(quote "$IPA")" \
  "  2. From the main checkout: node .appstore/asc.js builds, until it lists $BUILD as VALID" \
  "  3. Only then, from here: git push origin $TAG" \
  "     That push is what makes runtime $RTV OTA-eligible (scripts/ota-publish.sh)."

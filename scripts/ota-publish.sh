#!/usr/bin/env bash
# Guarded OTA publisher for Hourglass (iOS only). Runbook: docs/RELEASING.md, "OTA updates".
#
#   scripts/ota-publish.sh [--dry-run] "<message>"
#
# Publishes the committed tree as an EAS Update on channel "production", but only if a finished
# iOS production build already has this tree's fingerprint runtime, so the update has an audience.
# Steps, in order; every refusal prints to stderr and exits 1 before the next step runs:
#   1. arguments  2. clean tree  3. 40-hex fingerprint runtime  4. audience guard: a build-<N>
#   tag on origin whose Runtime: line matches (local builds, scripts/build-ios-local.sh), else
#   eas build:list (EAS cloud builds 18-20)  5. version check (warning only)  6. --dry-run stops
#   here  7. publish  8. report
# Exit codes: 0 published or dry run OK; 1 refusal, or a runtime mismatch after publishing;
# N when `eas update` itself exits N.
#
# Must run on macOS's stock bash 3.2: no associative arrays, mapfile or case-modifying
# expansions, and no arrays at all (an empty array trips `set -u` on 3.2). JSON goes through node.

set -euo pipefail

USAGE='Usage: scripts/ota-publish.sh [--dry-run] "<message>"'
CHANNEL=production

# die <line>...: print each argument as a line on stderr and exit 1.
die() {
  printf '%s\n' "$@" >&2
  exit 1
}

usage_error() {
  die "ota-publish: $1" "$USAGE"
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
for arg in "$@"; do
  case "$arg" in
    --dry-run) usage_error "--dry-run must come before the message" ;;
    # Any other option is refused rather than published as the message (e.g. a typo'd flag).
    -*) usage_error "unknown option \"$arg\" (a message may not start with \"-\")" ;;
  esac
done
[ "$#" -eq 1 ] || usage_error "expected exactly one quoted message, got $# arguments"
MESSAGE=$1
[ -n "${MESSAGE//[[:space:]]/}" ] || usage_error "the message is empty"

# --- 2. Clean tree --------------------------------------------------------------------------
# An update must be reproducible from a commit, and untracked files can end up in the bundle.
porcelain=$(git status --porcelain) || die "Refusing to publish: git status failed in $ROOT"
if [ -n "$porcelain" ]; then
  die "Refusing to publish: uncommitted changes" "$porcelain" \
    "Commit or stash them (untracked files too), then retry."
fi
COMMIT=$(git rev-parse --short HEAD) || die "Refusing to publish: git rev-parse HEAD failed"

# --- 3. Runtime -----------------------------------------------------------------------------
rtv_json=$(npx expo-updates runtimeversion:resolve --platform ios) ||
  die "Refusing to publish: \`npx expo-updates runtimeversion:resolve --platform ios\` failed (output above)"
RTV=$(printf '%s' "$rtv_json" | node -e '
  const out = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (!out || typeof out.runtimeVersion !== "string") {
    console.error("no string runtimeVersion field in the resolver output");
    process.exit(1);
  }
  process.stdout.write(out.runtimeVersion);
') || die "Refusing to publish: could not read runtimeVersion from \`npx expo-updates runtimeversion:resolve --platform ios\`"
# Explicit hex digits instead of a range, so no locale can let uppercase through.
if ! [[ "$RTV" =~ ^[0123456789abcdef]{40}$ ]]; then
  die "Refusing to publish: runtime version \"$RTV\" is not a fingerprint hash" \
    "  app.json must keep runtimeVersion { \"policy\": \"fingerprint\" }; a literal runtime belongs only on a" \
    "  runbook emergency branch (docs/RELEASING.md, section B), never on main."
fi

# --- 4. Audience guard ----------------------------------------------------------------------
# 4a. A build tag. A local build (scripts/build-ios-local.sh) has no EAS build record, so it tags
# its commit build-<N> with an annotated tag whose message records the runtime. The tag counts
# only once origin has the same tag object, and the runbook pushes it only after App Store
# Connect lists the build as VALID (docs/RELEASING.md, Upload). Of several, the highest N wins.
# This path can only accept: if origin can't be asked, it yields nothing and 4b decides.
nl='
'
tab=$(printf '\t')
tag_name=''
tag_n=-1
tag_version=''
tag_build=''
pending_tag=''
pending_n=-1
remote_state=unchecked
remote_tags=''
local_tags=$(git for-each-ref --format='%(objecttype) %(refname:strip=2) %(objectname)' 'refs/tags/build-*') ||
  local_tags=''
while read -r object_type name tag_object; do
  n=${name#build-}
  [[ "$n" =~ ^[0123456789]+$ ]] || continue
  # A lightweight tag has no message, so it never qualifies.
  [ "$object_type" = tag ] || continue
  message=$(git for-each-ref --format='%(contents)' "refs/tags/$name") || continue
  runtime_lines=0
  runtime_line=''
  version=''
  build=''
  while IFS= read -r line; do
    case "$line" in
      Runtime:*)
        runtime_lines=$((runtime_lines + 1))
        runtime_line=$line
        ;;
      'Version: '*) [ -n "$version" ] || version=${line#Version: } ;;
      'Build: '*) [ -n "$build" ] || build=${line#Build: } ;;
    esac
  done <<EOF
$message
EOF
  { [ "$runtime_lines" = 1 ] && [ "$runtime_line" = "Runtime: $RTV" ]; } || continue
  # One ls-remote for all tags, and only once a local tag has this runtime.
  if [ "$remote_state" = unchecked ]; then
    if remote_tags=$(GIT_TERMINAL_PROMPT=0 git ls-remote --tags origin 'refs/tags/build-*' 2>/dev/null); then
      remote_state=ok
    else
      remote_state=failed
    fi
  fi
  on_origin=0
  if [ "$remote_state" = ok ]; then
    case "$nl$remote_tags$nl" in
      *"$nl$tag_object${tab}refs/tags/$name$nl"*) on_origin=1 ;;
    esac
  fi
  if [ "$on_origin" = 1 ]; then
    if [ "$n" -gt "$tag_n" ]; then
      tag_n=$n
      tag_name=$name
      tag_version=$version
      tag_build=$build
    fi
  elif [ "$n" -gt "$pending_n" ]; then
    pending_n=$n
    pending_tag=$name
  fi
done <<EOF
$local_tags
EOF

if [ -n "$tag_name" ]; then
  build_label="tag $tag_name"
  build_version=$tag_version
  build_number=$tag_build
else
  # 4b. An EAS build record: EAS cloud builds 18-20, and the release/1.1 lane.
  # Fails closed: if EAS can't be asked (offline, logged out), nothing is published.
  builds_json=$(eas build:list --platform ios --status finished --channel "$CHANNEL" \
    --runtime-version "$RTV" --limit 1 --json --non-interactive) ||
    die "Refusing to publish: \`eas build:list\` failed (output above), so the audience guard cannot run"
  # One line, "|"-separated, so a single `read` takes it even when trailing fields are empty.
  build_fields=$(printf '%s' "$builds_json" | node -e '
    const builds = JSON.parse(require("fs").readFileSync(0, "utf8"));
    if (!Array.isArray(builds)) {
      console.error("expected a JSON array");
      process.exit(1);
    }
    const b = builds[0] || {};
    // eas-cli >= 22 nests the runtime as runtime.version; eas-cli <= 21 has a top-level runtimeVersion.
    const rtv = (b.runtime && b.runtime.version) ?? b.runtimeVersion;
    const field = (v) => (v == null ? "" : String(v).replace(/[|\r\n]/g, " "));
    console.log([builds.length, b.id, rtv, b.appVersion, b.appBuildVersion].map(field).join("|"));
  ') || die "Refusing to publish: \`eas build:list\` did not print a JSON array, so the audience guard cannot run"
  IFS='|' read -r build_count build_id build_rtv build_version build_number <<EOF
$build_fields
EOF
  if [ "$build_count" = 0 ]; then
    printf '%s\n' "Refusing to publish: no finished iOS build on channel \"$CHANNEL\" has runtime $RTV" \
      "  Nobody would receive this update. Either:" \
      "  - your node_modules differ from package-lock.json: run \`npm ci\` and retry, or" \
      "  - the change is native: ship a new build instead (docs/RELEASING.md, section C)." \
      "  To see which fingerprint source differs from the latest build:" \
      "    eas fingerprint:compare --build-id <id> --environment production" \
      "  (find <id> with: eas build:list --platform ios --channel $CHANNEL --limit 1)" >&2
    # Say why a local build tag with this runtime didn't count in 4a.
    if [ -n "$pending_tag" ] && [ "$remote_state" = failed ]; then
      printf '%s\n' "  Local tag $pending_tag has this runtime, but \`git ls-remote --tags origin\` failed, so it couldn't count." >&2
    elif [ -n "$pending_tag" ]; then
      printf '%s\n' "  Local tag $pending_tag has this runtime, but origin doesn't have that tag object. Push it only" \
        "  once App Store Connect lists build ${pending_tag#build-} as VALID (docs/RELEASING.md, Upload)." >&2
    fi
    exit 1
  fi
  if [ "$build_rtv" != "$RTV" ]; then
    die "Refusing to publish: eas build:list returned build $build_id with runtime \"$build_rtv\", not $RTV"
  fi
  build_label=$build_id
fi

# --- 5. Version check (warning only) --------------------------------------------------------
# The Settings version row reads the binary (nativeApplicationVersion / platform.ios.buildNumber),
# so an OTA never changes it. The update manifest (Constants.expoConfig) does carry this tree's
# app.json values, and a mismatch means this tree is not the build's commit (runbook section A).
app_fields=$(node -e '
  const { expo = {} } = JSON.parse(require("fs").readFileSync("app.json", "utf8"));
  const field = (v) => (v == null ? "" : String(v).replace(/[|\r\n]/g, " "));
  console.log([expo.version, (expo.ios || {}).buildNumber].map(field).join("|"));
') || die "Refusing to publish: could not read expo.version and expo.ios.buildNumber from app.json"
IFS='|' read -r app_version app_build <<EOF
$app_fields
EOF
if [ "$app_version" != "$build_version" ] || [ "$app_build" != "$build_number" ]; then
  printf '%s\n' \
    "WARNING: app.json is $app_version ($app_build) but the target build is $build_version ($build_number)" \
    "  The update still reaches that build, and Settings still shows the binary's $build_version ($build_number)," \
    "  but this tree is not the build's commit. For a baseline, publish from it (docs/RELEASING.md, section A)." >&2
fi

# --- 6. Dry run -----------------------------------------------------------------------------
# Single-quote the message for display so the printed command can be pasted as is.
q="'"
quoted_message="'${MESSAGE//$q/$q\\$q$q}'"
# Keep in sync with the eas update call in step 7.
publish_command="EXPO_NO_DOTENV=1 eas update --channel $CHANNEL --environment production --platform ios --message $quoted_message --json --non-interactive"
if [ "$dry_run" = 1 ]; then
  printf '%s\n' \
    "Dry run OK: nothing was published" \
    "  commit:   $COMMIT" \
    "  runtime:  $RTV" \
    "  build:    $build_label, $build_version ($build_number)" \
    "  command:  $publish_command"
  exit 0
fi

# --- 7. Publish -----------------------------------------------------------------------------
# EXPO_NO_DOTENV=1 keeps .env.local (gitignored, never seen by EAS builds) out of the bundle.
# EAS-side variables still apply through --environment production, which also makes eas-cli
# bundle with a cleared Metro cache. That matters: Metro's cache isn't keyed on EXPO_PUBLIC_
# values, so a warm cache from an earlier local export could still carry .env.local values.
publish_status=0
update_json=$(EXPO_NO_DOTENV=1 eas update --channel "$CHANNEL" --environment production \
  --platform ios --message "$MESSAGE" --json --non-interactive) || publish_status=$?
if [ "$publish_status" -ne 0 ]; then
  printf '%s\n' "ERROR: eas update failed with exit code $publish_status (output above)" >&2
  exit "$publish_status"
fi

# --- 8. Report ------------------------------------------------------------------------------
update_fields=$(printf '%s' "$update_json" | node -e '
  const updates = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const ios = Array.isArray(updates) ? updates.find((u) => u && u.platform === "ios") : undefined;
  if (!ios) {
    console.error("no element with platform \"ios\"");
    process.exit(1);
  }
  const field = (v) => (v == null ? "" : String(v).replace(/[|\r\n]/g, " "));
  console.log([ios.id, ios.group, ios.runtimeVersion].map(field).join("|"));
') || die "ERROR: eas update exited 0 but its --json output has no iOS update" \
  "  Check what was published: eas update:list --branch production --json --non-interactive"
IFS='|' read -r update_id update_group update_rtv <<EOF
$update_fields
EOF
if [ "$update_rtv" != "$RTV" ]; then
  die "ERROR: eas published to runtime $update_rtv but the guard checked $RTV" \
    "  Group $update_group may reach a different build than intended, or none." \
    "  Roll it back now (docs/RELEASING.md, section D), for example:" \
    "    eas update:roll-back-to-embedded --channel $CHANNEL --runtime-version $update_rtv --platform ios --message \"roll back $update_group\""
fi

printf '%s\n' \
  "OTA published" \
  "  commit:   $COMMIT" \
  "  runtime:  $RTV" \
  "  group:    $update_group" \
  "  update:   $update_id" \
  "  settings: Update: ${update_id:0:8}" \
  "Force-quit and relaunch the app twice; Settings should then show the line above."

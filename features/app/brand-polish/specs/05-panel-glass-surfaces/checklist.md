# Checklist: 05-panel-glass-surfaces

## Phase 5.0 — Tests (Red Phase)

### FR1: Radial Panel Gradient Tests
- [x] Write test: `<PanelGradient state="onTrack" />` renders SVG with `RadialGradient` element (not `LinearGradient`)
- [x] Write test: RadialGradient has `cx="50%"` and `cy="30%"` attributes
- [x] Write test: all 5 states render without error (`onTrack`, `behind`, `critical`, `crushedIt`, `idle`)
- [x] Write test: `idle` state renders no visible gradient
- [x] Write test: opacity animation container (Animated.View) is present
- [x] Mock `react-native-svg` components (`Svg`, `Defs`, `RadialGradient`, `Stop`, `Rect`)
- [x] Confirm tests fail (red) before implementation

### FR2: Coloured Glows Tests
- [x] Write test: `getGlowStyle('onTrack')` returns `shadowColor: '#10B981'` on iOS
- [x] Write test: `getGlowStyle('critical')` returns `shadowOpacity: 0.18` on iOS
- [x] Write test: `getGlowStyle('crushedIt')` returns `shadowColor: '#E8C97A'` on iOS
- [x] Write test: `getGlowStyle('idle')` returns no shadow (shadowOpacity: 0 or `{}`)
- [x] Write test: on Android, non-idle states return `{ elevation: 4 }` (via source analysis)
- [x] Write test: on Android, idle state returns `{ elevation: 0 }` (via source analysis)
- [x] Mock `Platform.OS` as `'ios'` and `'android'` in respective test cases
- [x] Confirm tests fail (red) before implementation

### FR3: BlurView Modal Tests
- [x] Write test: modal renders `BlurView` with `intensity={30}` and `tint="dark"`
- [x] Write test: modal has inner `View` with semi-transparent `surfaceElevated` background
- [x] Write test: existing modal content renders correctly (title, close button, children)
- [x] Mock `expo-blur` `BlurView` as plain `View`
- [x] Confirm tests fail (red) before implementation

### FR4: NoiseOverlay Tests
- [x] Write test: `<NoiseOverlay />` renders without error
- [x] Write test: component root has `pointerEvents="none"` (source analysis)
- [x] Write test: Image has `opacity: 0.04` style
- [x] Write test: Image is absolutely positioned (`position: 'absolute'`, `top: 0`, `left: 0`, `right: 0`, `bottom: 0`)
- [x] Write test: Image has `resizeMode="repeat"`
- [x] Mock image asset `require('../../assets/images/noise.png')` as `1`
- [x] Confirm tests fail (red) before implementation

---

## Phase 5.1 — Implementation (Green Phase)

### Setup
- [x] Run `npx expo install expo-blur` and commit updated `package.json`
- [x] Run `npx expo install react-native-svg` and commit (was not pre-installed)

### FR1: Radial Panel Gradient Implementation
- [x] Update `src/components/PanelGradient.tsx`: remove `expo-linear-gradient` import
- [x] Add `Svg, { Defs, RadialGradient, Stop, Rect }` imports from `react-native-svg`
- [x] Implement SVG radial gradient with `cx="50%"` `cy="30%"` `r="70%"`
- [x] Add per-state inner colour mapping (PANEL_GRADIENT_COLORS export)
- [x] Preserve `Animated.View` wrapper with springPremium opacity
- [x] Verify `idle` state renders nothing (null check, SVG skipped)
- [x] Run FR1 tests — all pass

### FR2: Coloured Glows Implementation
- [x] Export `getGlowStyle(state: PanelState): ViewStyle` from `PanelGradient.tsx`
- [x] Implement iOS shadow props per-state lookup table
- [x] Implement Android `elevation` fallback with `Platform.OS === 'android'` guard
- [x] Run FR2 tests — all pass

### FR3: BlurView Modal Implementation
- [x] Update `app/modal.tsx`: import `BlurView` from `expo-blur`
- [x] Wrap modal content in `<BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill}>`
- [x] Add inner `<View>` with `backgroundColor: colors.surfaceElevated + 'D9'` (85% opacity)
- [x] Preserve existing modal content structure
- [x] Run FR3 tests — all pass

### FR4: NoiseOverlay Implementation
- [x] Create `src/components/NoiseOverlay.tsx`
- [x] Implement absolutely positioned Image with `opacity: 0.04` and `resizeMode="repeat"`
- [x] Set `pointerEvents="none"` on component root
- [x] Add `assets/images/noise.png` (256×256 tileable noise PNG, generated programmatically)
- [x] Run FR4 tests — all pass

### Integration
- [x] Run full test suite — 61/61 new tests passing
- [x] No regressions in spec-05 related tests (165 passing in targeted run)
- [x] Pre-existing failures confirmed unchanged (baseline comparison)

---

## Phase 5.2 — Review

- [x] Spec-implementation alignment — all 4 FRs verified
- [x] No review feedback requiring changes
- [x] Tests optimised — source analysis used where react-native-web strips props
- [x] All tests passing

---

## Session Notes

**2026-03-15**: Spec execution complete.
- Phase 5.0: 3 test file commits (FR1-FR4 tests)
- Phase 5.1: 1 implementation commit (feat(FR1-FR4)), 1 setup commit (expo-blur), 1 setup commit (react-native-svg)
- Phase 5.2: Alignment verified, no fixes needed
- 61/61 tests passing. react-native-svg required installation (not pre-installed).
- Note: `react-native-svg` was not installed despite spec-research stating it was (research confused Skia with SVG). Install added to Phase 5.1 tracking.

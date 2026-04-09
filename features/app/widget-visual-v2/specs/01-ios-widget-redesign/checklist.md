# Checklist: 01-ios-widget-redesign

## Phase 1.0 — Tests (Red Phase)

### FR1: Circle mock
- [x] Add `Circle: makeComp('Circle')` to `@expo/ui/swift-ui` jest mock in `widgetVisualIos.test.ts`
- [x] Verify all three widget sizes render without `TypeError: Circle is not a function`

### FR2: WidgetBackground tests (new assertions)
- [x] Add test: SmallWidget renders at least 1 Rectangle (base layer)
- [x] Add test: MediumWidget renders at least 1 Rectangle (base layer)
- [x] Add test: LargeWidget renders at least 1 Rectangle (base layer)
- [x] Add test: Rectangle fill === '#0B0D13' (updated base color)
- [x] Add test: SmallWidget renders at least 2 Circle elements
- [x] Add test: MediumWidget renders at least 2 Circle elements
- [x] Add test: LargeWidget renders at least 2 Circle elements
- [x] Add test: different urgency states produce different Circle accent fills
- [x] Add test: bottom-left Circle fill === '#3B82F6'

### FR3: IosGlassCard tests (updated assertions)
- [x] Add test: glass card RoundedRectangle fill === '#1C1E26CC'
- [x] Add test: glass card RoundedRectangle cornerRadius === 16
- [x] Add test: glass card RoundedRectangle strokeWidth === 0.5

### FR4: MAX_BAR_HEIGHT=60 (updated assertions)
- [x] Update FR4.5: max bar height `>= 55` and `<= 65` (was `>= 95, <= 105`)
- [x] Update FR4.9: single non-zero bar height `toContain(60)` (was `toContain(100)`)

### FR5: Hero font bold/rounded (updated assertions)
- [x] Update FR2.1 (hud layout): `font.weight === 'bold'` (was `'heavy'`)
- [x] Update FR2.2 (hud layout): `font.design === 'rounded'` (was `'monospaced'`)
- [x] Update FR4.new.7: LargeWidget P3 hero `weight === 'bold'`, `design === 'rounded'`
- [x] Update FR4.new.7b: LargeWidget P2 hero `weight === 'bold'`, `design === 'rounded'`

### FR6: StatusPill opacity (updated assertion)
- [x] Add test: StatusPill background fill ends with '15' (was '25')
- [x] Add test: StatusPill stroke value ends with '80' (unchanged)

### FR7: widgetPolish.test.ts SC2.2 fix
- [x] Update SC2.2 in `src/widgets/__tests__/widgetPolish.test.ts`: replace `not.toContain('padding={14}')` with `toContain("padding={{ top: 16")`

### Red-phase verification
- [x] Ran test suite — 16 new/updated assertions FAIL (red) confirming they test the right things
- [x] Existing unaffected tests PASS

---

## Phase 1.1 — Implementation

### FR1: Circle import
- [x] Add `Circle` to the `require('@expo/ui/swift-ui')` destructure at top of `HourglassWidget.tsx`

### FR2: WidgetBackground component
- [x] Update `COLORS.bgDark` to `'#0B0D13'` (was `'#0D0C14'`)
- [x] Add `WidgetBackground` component function to `HourglassWidget.tsx`
- [x] Replace 2-Rectangle pattern in `SmallWidget` with `<WidgetBackground accent={accent} />`; removed `tint` variable
- [x] Replace 2-Rectangle pattern in `MediumWidget` with `<WidgetBackground accent={accent} />`; removed `tint`/`bgTint`
- [x] Replace 2-Rectangle pattern in `LargeWidget` with `<WidgetBackground accent={accent} />`; removed `tint`/`bgTint`
- [x] WidgetBackground tests pass (green)

### FR3: IosGlassCard
- [x] Update `COLORS.surface` to `'#1C1E26CC'` (was `'#16151FCC'`)
- [x] Rename `GlassCard` → `IosGlassCard` throughout `HourglassWidget.tsx`
- [x] Update cornerRadius from 14 to 16
- [x] Update strokeWidth from 1 to 0.5
- [x] Update inner VStack padding from 12 to 14
- [x] IosGlassCard tests pass (green)

### FR4: MAX_BAR_HEIGHT
- [x] Update `MAX_BAR_HEIGHT` from 100 to 60
- [x] FR4.5 and FR4.9 tests pass (green)

### FR5: Hero font
- [x] Update `MetricView` Text font: `weight: 'heavy'` → `weight: 'bold'`, `design: 'monospaced'` → `design: 'rounded'`
- [x] Update SmallWidget direct 32pt hero Text: same font change
- [x] Update LargeWidget P2 direct 48pt hero Text: same font change
- [x] Update MediumWidget P2 direct 36pt hero Text: same font change
- [x] FR2.1, FR2.2, FR4.new.7, FR4.new.7b tests pass (green)

### FR6: StatusPill opacity
- [x] Update `StatusPill` background fill from `color + '25'` to `color + '15'`
- [x] StatusPill tests pass (green)

### FR7: widgetPolish SC2.2
- [x] SC2.2 passes with implementation (padding={{ top: 16 present in LargeWidget source)

### Integration verification
- [x] All 111 widget visual + polish tests passing
- [x] FR4.new.1 regression identified and fixed (VStack search by padding.bottom value, not index)
- [x] widgetLayoutJs failures confirmed pre-existing (bridge.ts unstaged changes unrelated to this spec)

---

## Phase 1.2 — Review

### Alignment check
- [x] All FR success criteria met:
  - SC2.2: Rectangle fill #0B0D13 ✓
  - SC2.3-2.6: Circle elements present with correct fills ✓
  - SC3.1-3.3: IosGlassCard fill #1C1E26CC, radius 16, strokeWidth 0.5 ✓
  - SC4.2: bar height 55-65 range ✓
  - SC5.1-5.4: bold/rounded font ✓
  - SC6.1: StatusPill fill ends '15' ✓
  - SC7.2-7.3: widgetPolish SC2.2 updated, SC2.1 passing ✓

### Final sign-off
- [x] All 111 tests passing
- [x] Implementation complete

## Session Notes

**2026-04-02**: Spec execution complete.
- Phase 1.0: 2 test commits (Circle mock + assertion updates, including FR4.new.1 fix)
- Phase 1.1: 1 implementation commit (all 7 FRs)
- No Phase 1.2 fix commits required
- All 111 widget visual/polish tests passing
- Pre-existing widgetLayoutJs failures confirmed unrelated (bridge.ts working tree changes)

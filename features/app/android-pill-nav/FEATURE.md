# Feature: Android Floating Pill Nav

## Goal

Split tab bar navigation by platform: iOS keeps `NativeTabs` (UITabBarController, automatic iOS 26 glass pill), while Android gets a custom floating pill tab bar — a semi-opaque dark surface pill that floats above content with a violet active-tab highlight.

## Design Decisions

- **Background**: `colors.surface` (#16151F) semi-opaque + `colors.border` (#2F2E41) border. No BlurView (avoids Android GPU framebuffer allocation issues on older devices).
- **Active indicator**: Filled rounded rect behind active icon+label using violet at 15% opacity + violet stroke.
- **Labels**: Icon + label on all tabs (matches NativeTabs behavior).
- **Press feedback**: Reanimated `springSnappy` scale (0.92) on press.
- **Positioning**: `position: 'absolute'`, bottom = 24 + insets.bottom, left/right = 20.
- **Screen padding**: All tab screens get `paddingBottom` equal to pill height + offset + safe area so content is never hidden.

## Specs

| # | Spec | Depends On |
|---|------|------------|
| 01 | floating-pill-tab | — |
| 02 | platform-split-nav | 01 |

## Files Touched

| File | Action |
|------|--------|
| `src/components/FloatingPillTabBar.tsx` | Created |
| `src/components/__tests__/FloatingPillTabBar.test.ts` | Created |
| `app/(tabs)/_layout.tsx` | Modified — platform split, FloatingPillTabBar wiring |
| `app/(tabs)/__tests__/native-tabs.test.tsx` | Modified — platform-split tests added |

## Changelog

- 2026-04-07: Feature created — platform-split nav (NativeTabs iOS, floating pill Android)
- 2026-04-06: [01-floating-pill-tab](specs/01-floating-pill-tab/spec.md) — FloatingPillTabBar complete. Status: Complete. Commits: test(FR1-FR5), feat(FR1-FR5), fix(01-floating-pill-tab)
- 2026-04-06: [02-platform-split-nav](specs/02-platform-split-nav/spec.md) — Platform split complete. Status: Complete. Commits: test(FR1-FR5), feat(FR1-FR4), fix(02-platform-split-nav)

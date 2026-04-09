/**
 * colors.ts — Design token color constants for Skia canvas components.
 *
 * ⚠️  SYNC WARNING: This file MUST stay in sync with tailwind.config.js.
 * When you change a color in tailwind.config.js, update the matching value here.
 * These two files are the single source of truth for the Hourglass color system:
 *   - tailwind.config.js → NativeWind className tokens (className="bg-gold")
 *   - colors.ts          → Raw hex values for Skia canvas rendering
 *
 * Why this file exists: Skia renders on a canvas and cannot consume NativeWind
 * className strings. Chart components (WeeklyBarChart, TrendSparkline, AIRingChart)
 * import hex values from here instead of hardcoding them.
 */

export const colors = {
  // Base surfaces — v1.1 eggplant palette
  background:      '#0D0C14', // App background / screen fill (was #0A0A0F)
  surface:         '#16151F', // Default card background (was #13131A)
  surfaceElevated: '#1F1E29', // Modals, bottom sheets, popovers, active card (was #1C1C28)
  border:          '#2F2E41', // Card borders, dividers, input outlines (was #2A2A3D)

  // Accent — each colour carries a single semantic meaning
  gold:        '#E8C97A', // Earnings, salary, money values. Primary brand accent.
  goldBright:  '#FFDF89', // Gradient endpoint for Crushed It hero state (v1.1 new)
  cyan:        '#00C2FF', // AI usage percentage and AI-related metrics (was #00D4FF)
  violet:      '#A78BFA', // BrainLift hours and deep-work metrics
  success:     '#10B981', // On-track status, positive deltas, completed items
  warning:     '#F59E0B', // Behind-pace status, caution states, soft alerts
  critical:    '#F43F5E', // Critical behind-pace, overdue approvals, urgent alerts
  destructive: '#F85149', // Destructive actions (delete, reject), irreversible ops

  // Text hierarchy — desaturated per brand-revamp/01-design-tokens
  // Pure white (#FFFFFF) causes halation on dark backgrounds.
  textPrimary:   '#E0E0E0', // Hero numbers, headings, primary labels (was #FFFFFF)
  textSecondary: '#A0A0A0', // Supporting labels, metadata, secondary values (was #8B949E)
  textMuted:     '#757575', // Placeholder text, disabled states, fine print (was #484F58)

  // Special states
  overtimeWhiteGold: '#FFF8E7', // Overtime achievement — warm white-gold, near-white (01-overtime-display)

  // Mesh color tokens — desaturated dark-mode-safe palette (10-mesh-color-overhaul)
  // These replace saturated semantic tokens in PANEL_STATE_COLORS and AI tier classification.
  dustyBlue:     '#556B8E', // Idle mesh ambient — calm week-start state (was null/invisible)
  desatCoral:    '#F87171', // Critical state — desaturated vs #F43F5E, no vibration on dark bg
  warnAmber:     '#FCD34D', // Behind-pace state — softer than #F59E0B warning
  successGreen:  '#4ADE80', // On-track state — softer than #10B981 success
  champagneGold: '#C89F5D', // Crushed-it state — muted vs #E8C97A gold
  luxuryGold:    '#CEA435', // Overtime state — rich gold vs #FFF8E7 white-gold
  infoBlue:      '#60A5FA', // AI Leader tier — replaces cyan #00C2FF for tier-aware arc
} as const;

export type ColorKey = keyof typeof colors;

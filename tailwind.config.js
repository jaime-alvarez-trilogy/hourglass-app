/** @type {import('tailwindcss').Config} */
// NativeWind v4-compatible Tailwind config for Hourglass
// See BRAND_GUIDELINES.md for full design system documentation.

module.exports = {
  presets: [require('nativewind/preset')],
  // ---------------------------------------------------------------------------
  // Content paths — NativeWind scans these for class names
  // ---------------------------------------------------------------------------
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],

  theme: {
    extend: {
      // -----------------------------------------------------------------------
      // Colours
      // All semantic tokens from the Hourglass design system.
      // Reference: BRAND_GUIDELINES.md → Colour System
      // -----------------------------------------------------------------------
      colors: {
        // Base surfaces — v1.1 eggplant palette
        background:      "#0D0C14", // App background / screen fill (was #0A0A0F)
        surface:         "#16151F", // Default card background (was #13131A)
        surfaceElevated: "#1F1E29", // Modals, bottom sheets, popovers, active card (was #1C1C28)
        border:          "#2F2E41", // Card borders, dividers, input outlines (was #2A2A3D)

        // Accent — each colour carries a single semantic meaning (see guidelines)
        gold:        "#E8C97A", // Earnings, salary, money values. Primary brand accent.
        goldBright:  "#FFDF89", // Gradient endpoint for Crushed It hero state (v1.1 new)
        cyan:        "#00C2FF", // AI usage percentage and AI-related metrics (was #00D4FF)
        violet:      "#A78BFA", // BrainLift hours and deep-work metrics
        success:     "#10B981", // On-track status, positive deltas, completed items
        warning:     "#F59E0B", // Behind-pace status, caution states, soft alerts
        critical:    "#F43F5E", // Critical behind-pace, overdue approvals, urgent alerts
        destructive: "#F85149", // Destructive actions (delete, reject), irreversible ops

        // Text hierarchy — desaturated per brand-revamp/01-design-tokens
        // Pure white (#FFFFFF) causes halation on dark backgrounds.
        textPrimary:   "#E0E0E0", // Hero numbers, headings, primary labels (was #FFFFFF)
        textSecondary: "#A0A0A0", // Supporting labels, metadata, secondary values (was #8B949E)
        textMuted:     "#757575", // Placeholder text, disabled states, fine print (was #484F58)

        // Special states
        overtimeWhiteGold: "#FFF8E7", // Overtime achievement — warm white-gold, near-white (01-overtime-display)
      },

      // -----------------------------------------------------------------------
      // Font families — v1.1 Inter-only
      // Three-tier typographic system — hierarchy via weight + spacing only.
      // Reference: BRAND_GUIDELINES.md → Typography System v1.1
      //
      // To use in className: font-display, font-sans, font-body
      // Fonts must be loaded via expo-font / @expo-google-fonts before use.
      // -----------------------------------------------------------------------
      fontFamily: {
        // ── v2.0 three-font type system (brand-revamp/01-design-tokens) ──────
        // SpaceGrotesk: hero metrics, headings, section titles
        // SpaceMono:    data tables, timestamps, numeric columns
        // Inter:        body copy, labels, metadata (unchanged)
        // Reference: BRAND_GUIDELINES.md → Typography System v2.0

        // Tier 1 — Hero numbers, metric values, large headings (SpaceGrotesk)
        // display-extrabold uses 700Bold per optical weight rule: light-emitting
        // screens render text optically heavier than print — 800 becomes 700.
        'display':           ['SpaceGrotesk_700Bold'],
        'display-medium':    ['SpaceGrotesk_500Medium'],
        'display-semibold':  ['SpaceGrotesk_600SemiBold'],
        'display-bold':      ['SpaceGrotesk_700Bold'],
        'display-extrabold': ['SpaceGrotesk_700Bold'], // optical weight reduction: was Inter_800ExtraBold

        // Monospace — data tables, timestamps, numeric columns (SpaceMono)
        // Note: SpaceMono has no 500Medium weight; mono-medium aliases to 400Regular.
        'mono':        ['SpaceMono_400Regular'],
        'mono-medium': ['SpaceMono_400Regular'],
        'mono-bold':   ['SpaceMono_700Bold'],

        // Tier 2 — UI labels, navigation, buttons, form inputs (Inter, unchanged)
        'sans':         ['Inter_400Regular'],
        'sans-medium':  ['Inter_500Medium'],
        'sans-semibold':['Inter_600SemiBold'],
        'sans-bold':    ['Inter_700Bold'],

        // Tier 3 — Descriptive text, AI insights, onboarding copy (Inter, unchanged)
        'body':        ['Inter_400Regular'],
        'body-light':  ['Inter_300Light'],  // fallback: Inter_400Regular if 300 unavailable
        'body-medium': ['Inter_500Medium'],
      },

      // -----------------------------------------------------------------------
      // Border radius
      // Tailwind defaults are preserved; these tokens are called out explicitly
      // because the design system mandates minimum rounded-lg (8px) everywhere.
      //
      // rounded-2xl (16px) → cards, panels, large containers
      // rounded-xl  (12px) → buttons, inputs, small modals
      // rounded-full       → pills, status badges, small chips
      // rounded-lg  (8px)  → inner elements within cards (minimum intentional radius)
      //
      // Do NOT use rounded-md (6px) or smaller — looks like a browser default.
      // Tailwind's built-in scale already includes all of these correctly.
      // -----------------------------------------------------------------------

      // -----------------------------------------------------------------------
      // Spacing
      // Using Tailwind's default 4px-base scale unchanged.
      // Key habits (documented here for discoverability):
      //   p-5 / p-6     → card internal padding
      //   gap-4 / gap-6 → between cards and sections
      //   px-4          → screen horizontal edge padding
      //   gap-3         → list item spacing
      // No custom spacing tokens needed — default scale is sufficient.
      // -----------------------------------------------------------------------
    },
  },

  plugins: [],
};

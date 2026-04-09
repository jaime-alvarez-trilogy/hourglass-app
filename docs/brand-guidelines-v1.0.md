BRAND_GUIDELINES.md:
# Hourglass — Brand & Design System Guidelines
Version 1.0 | Last updated 2026-03-14

MISSION: Answer "where does my week stand, and where is it heading?" in under 3 seconds.

APP IDENTITY:
- Name: Hourglass | Work dashboard / productivity for Crossover contractors
- Tone: Confident, precise, premium. Reference: Oura Ring, Revolut, Wise, Linear.
- Brief: Dark glass dashboard where numbers are the hero, panels shift colour for week status, every interaction feels satisfying and immediate.

COLOUR SYSTEM:
Base: background #0A0A0F, surface #13131A, surfaceElevated #1C1C28, border #2A2A3D
Accents: gold #E8C97A (earnings ONLY), cyan #00D4FF (AI%), violet #A78BFA (BrainLift), success #10B981, warning #F59E0B, critical #F43F5E, destructive #F85149
Text: textPrimary #FFFFFF, textSecondary #8B949E, textMuted #484F58

COLOUR RULES:
- Gold = money ONLY. Cyan = AI ONLY. Violet = BrainLift ONLY.
- Status colours carry meaning — don't use decoratively.
- Borders should whisper (#2A2A3D is intentionally subtle).

PANEL GRADIENT STATES:
- On Track: success #10B981 at 35% opacity → transparent (top to bottom)
- Behind: warning #F59E0B at 35%
- Critical: critical #F43F5E at 35%
- Crushed It: gold #E8C97A at 35%
- Idle: flat surface, no gradient
- Gradient transitions use springPremium

TYPOGRAPHY:
- Display: Space Grotesk — hero numbers, metric values, large headings
- Sans: Inter — UI labels, navigation, buttons, tabs
- Body: Plus Jakarta Sans — descriptive text, AI insights, onboarding copy
- Scale: 3xl(36/40/700), 2xl(28/34/700), xl(22/28/600), lg(18/26/600), md(16/24/400-500), sm(14/20/400), xs(12/16/400)
- ALWAYS tabular-nums on metric displays. ALWAYS Space Grotesk for numbers.

SPACING:
- Card padding: p-5 or p-6 (min p-4). Between cards: gap-4 to gap-6. Screen edges: px-4.
- "Airy principle" — premium apps breathe. Add space before removing content.

BORDER RADIUS:
- Cards/panels: rounded-2xl (16px). Buttons/inputs: rounded-xl (12px). Pills/badges: rounded-full. Inner elements: rounded-lg (8px minimum — never rounded-md or smaller).

ANIMATION PHILOSOPHY:
- Springs → transitions, interactions, structure (cards appearing, panels, modals, navigation)
- Timing curves → data, charts, fills (progress bars, chart bars, percentage counters)
- Presets:
  - springSnappy: damping 20, stiffness 300, mass 0.8 — navigation, fast responses
  - springBouncy: damping 14, stiffness 200, mass 1 — cards entering, panel expand
  - springPremium: damping 18, stiffness 120, mass 1.2 — hero panels, gradient state changes ("Revolut card flip")
  - timingChartFill: 1800ms expo ease-out — bar/line chart fills
  - timingChartFast: 350ms — compact data elements
  - timingSmooth: 400ms ease-in-out — opacity fades, skeleton loaders
  - timingInstant: 150ms — button press feedback (scale 0.96)

ANIMATION RULES:
1. Never animate colour alone — pair with scale or opacity shift.
2. Panel gradient changes = springPremium always.
3. List stagger = springBouncy + 50ms×index delay, capped 300ms.
4. Button press = timingInstant scale 0.96.
5. Skeleton pulse = timingSmooth opacity.
6. NO springs on chart fills or progress bars.

COMPONENT PERSONALITY:
- Card-First Layout: surface bg, border 1px, rounded-2xl, p-5/p-6
- Airy Density: generous, not compact — a dashboard opened at start/end of session
- Number Hierarchy: 1) Hero value (large, Display, textPrimary) 2) Supporting metric 3) Label/caption

DO: Lead with number, tabular-nums on all metrics, Space Grotesk for every value, animate with purpose, keep dark.
DON'T: Gold for non-earnings, gradients decoratively, rounded-md or smaller, spring on chart fills, >3 typefaces per view.

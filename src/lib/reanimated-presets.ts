/**
 * reanimated-presets.ts
 *
 * Named animation presets for Hourglass — Reanimated v4.
 *
 * Design system rule (from BRAND_GUIDELINES.md):
 *   - Springs   → cards, panels, modals, navigation, interactions
 *   - Timing    → charts, progress bars, data fills, opacity fades
 *
 * Reanimated v4 has two animation modes — use the right one:
 *
 *   1. CSS Animations syntax (v4 only) — for simple entrance animations:
 *      <Animated.View style={{ animation: "fadeIn 300ms ease-out" }} />
 *      Use for: fade-in, slide-in, scale-in on mount. Clean and declarative.
 *
 *   2. Programmatic (useSharedValue + useAnimatedStyle) — for everything else:
 *      cardScale.value = withSpring(1, springBouncy);
 *      barWidth.value  = withTiming(targetWidth, timingChartFill);
 *      Use for: gesture-driven, data-reactive, staggered, looping animations.
 *
 * These presets are for the programmatic API only.
 *
 * Usage:
 *   import { springBouncy, timingChartFill } from "@/src/lib/reanimated-presets";
 */

import { Easing, type WithSpringConfig, type WithTimingConfig } from "react-native-reanimated";

// =============================================================================
// SPRING PRESETS — for cards, panels, modals, transitions
// =============================================================================

/**
 * springSnappy
 *
 * Fast settle, minimal overshoot.
 * Use for: navigation transitions, small UI elements, tab switches,
 *           icon scale feedback, anything that should respond immediately
 *           without drawing attention to itself.
 *
 * Feel: decisive, instant, professional.
 */
export const springSnappy: WithSpringConfig = {
  damping: 20,
  stiffness: 300,
  mass: 0.8,
  overshootClamping: false,
  energyThreshold: 0.01,
};

/**
 * springBouncy
 *
 * Moderate overshoot — alive and confident.
 * Use for: cards appearing on screen, panel expand/collapse,
 *           list items entering staggered, bottom sheet snap points,
 *           any element that should feel like it "arrived" with personality.
 *
 * Feel: energetic, premium, a touch of delight.
 *
 * Stagger pattern for lists:
 *   delay: Math.min(index * 50, 300)
 */
export const springBouncy: WithSpringConfig = {
  damping: 14,
  stiffness: 200,
  mass: 1,
  overshootClamping: false,
  energyThreshold: 0.01,
};

/**
 * springPremium
 *
 * Slow, smooth, with a slight elegant overshoot.
 * Use for: hero panels, modal sheets entering, week-status panel gradient
 *           transitions, earnings card, any full-panel or high-prominence motion.
 *
 * This is the "Revolut card flip" feeling — unhurried and authoritative.
 * The panel gradient state change (on-track → behind → critical) should
 * always use this preset.
 *
 * Feel: cinematic, premium, weighty.
 */
export const springPremium: WithSpringConfig = {
  damping: 18,
  stiffness: 120,
  mass: 1.2,
  overshootClamping: false,
  energyThreshold: 0.005,
};

// =============================================================================
// TIMING PRESETS — for charts, bars, progress fills
// =============================================================================

/**
 * timingChartFill
 *
 * Ease-out cubic, ~600ms.
 * Use for: bar charts filling in, line chart drawing, weekly hours progress bar,
 *           any data visualisation that represents a measurement landing on truth.
 *
 * Springs must NOT be used for chart fills — the overshoot implies the value
 * exceeded its target, which is misleading on a progress indicator.
 *
 * Feel: precise, satisfying, like a gauge settling.
 */
export const timingChartFill: WithTimingConfig = {
  duration: 1800,
  easing: Easing.bezier(0.16, 1, 0.3, 1), // Expo ease-out — fast start, smooth settle
};

/**
 * timingChartFast
 *
 * Ease-out cubic, ~350ms.
 * Use for: small progress indicators, status badges updating, AI % indicator,
 *           BrainLift hours pill, any compact data element that shouldn't
 *           hold the user's eye for long.
 *
 * Feel: quick, informational, unobtrusive.
 */
export const timingChartFast: WithTimingConfig = {
  duration: 350,
  easing: Easing.bezier(0.16, 1, 0.3, 1),
};

/**
 * timingSmooth
 *
 * Ease-in-out, ~400ms.
 * Use for: opacity fades (skeleton loaders, screen transitions, tab content),
 *           colour transitions, background shifts, anything that should
 *           cross-fade rather than snap.
 *
 * Loading skeletons should pulse with this at 50% opacity → 100% opacity
 * in a loop — slow enough to feel calm, not anxious.
 *
 * Feel: gentle, calm, invisible.
 */
export const timingSmooth: WithTimingConfig = {
  duration: 400,
  easing: Easing.inOut(Easing.ease),
};

/**
 * timingInstant
 *
 * Ease-out, ~150ms.
 * Use for: button press scale feedback (scale to 0.96 → back to 1),
 *           immediate touch responses, haptic-adjacent visual acknowledgements,
 *           any feedback that should feel tactile rather than animated.
 *
 * Feel: immediate, tactile, responsive.
 */
export const timingInstant: WithTimingConfig = {
  duration: 150,
  easing: Easing.out(Easing.ease),
};

// =============================================================================
// PANEL TRANSITION HELPER
// =============================================================================

/**
 * Panel state types matching the design system's seven states.
 * Reference: BRAND_GUIDELINES.md → Panel Gradient States
 */
export type PanelState = "onTrack" | "behind" | "critical" | "crushedIt" | "idle" | "overtime" | "aheadOfPace";

/**
 * Transition type — describes what kind of change is happening.
 *
 * "stateChange"  — The week status changed (on-track → behind, etc.)
 *                  This is the most emotionally significant transition.
 *                  Uses springPremium.
 *
 * "dataUpdate"   — Numbers refreshed but status stayed the same.
 *                  Uses timingChartFill — data, not drama.
 *
 * "panelOpen"    — Panel expanded from collapsed or entered screen.
 *                  Uses springBouncy — it arrived.
 *
 * "panelClose"   — Panel collapsed or exited screen.
 *                  Uses springSnappy — clean, no lingering.
 */
export type PanelTransitionType = "stateChange" | "dataUpdate" | "panelOpen" | "panelClose";

/**
 * panelTransition
 *
 * Returns the correct animation preset for a panel transition.
 *
 * Usage:
 *   const preset = panelTransition("stateChange");
 *   // Returns WithSpringConfig or WithTimingConfig
 *   // Caller must use withSpring() for spring presets, withTiming() for timing presets.
 *
 *   // Discriminate by checking the `type` field on the returned object:
 *   const { config, type } = panelTransition("stateChange");
 *   if (type === "spring") {
 *     opacity.value = withSpring(1, config as WithSpringConfig);
 *   } else {
 *     opacity.value = withTiming(1, config as WithTimingConfig);
 *   }
 *
 * @param transitionType - The kind of change occurring on the panel
 * @param _fromState     - Optional: the previous panel state (reserved for future per-transition tuning)
 * @param _toState       - Optional: the next panel state (reserved for future per-transition tuning)
 */
export function panelTransition(
  transitionType: PanelTransitionType,
  _fromState?: PanelState,
  _toState?: PanelState,
): { config: WithSpringConfig | WithTimingConfig; type: "spring" | "timing" } {
  switch (transitionType) {
    case "stateChange":
      // Highest emotional significance — status colour shift, gradient change.
      // Slow, premium, authoritative. The user should notice this changed.
      return { config: springPremium, type: "spring" };

    case "dataUpdate":
      // Numbers refreshed, no status change. Data landing on its value.
      // Precise timing curve, not spring — the measurement is settling.
      return { config: timingChartFill, type: "timing" };

    case "panelOpen":
      // Panel arriving on screen or expanding. Should feel alive.
      return { config: springBouncy, type: "spring" };

    case "panelClose":
      // Panel leaving or collapsing. Clean exit, no drama.
      return { config: springSnappy, type: "spring" };

    default: {
      // TypeScript exhaustiveness guard
      const _exhaustive: never = transitionType;
      return { config: springSnappy, type: "spring" };
    }
  }
}

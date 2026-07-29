# Spec 02 — Global React error boundary

**Status:** Research complete
**Complexity:** S
**Blocks:** — (independent)

## Problem context

Repo-wide search confirms no `ErrorBoundary`/`componentDidCatch` exists anywhere in the codebase. A thrown exception during render anywhere in the component tree today has no catch-all — in production this typically means a blank white/black screen with no explanation and no recovery path other than a full app kill-and-relaunch (or worse, a bootloop if the exception happens on every mount, e.g. from a corrupted persisted value).

This app persists user config in AsyncStorage and credentials in SecureStore across sessions — a malformed persisted value (e.g. from an interrupted write, or a shape change across an app update) is a plausible real trigger for exactly this failure mode, not a hypothetical one.

## Exploration findings

- Expo Router root layout is `app/_layout.tsx` — the natural place to wrap the app tree in a boundary, catching render exceptions in any tab/screen below it.
- React error boundaries only catch **render-phase** exceptions in the tree below them — they do NOT catch errors in event handlers, async code, or effects (those need their own try/catch, which is spec 03's territory: the silent-catch audit). This spec's scope is specifically the render-crash case.
- No existing "Something went wrong" fallback UI pattern exists to reuse — this is new UI, though it can be minimal (a message + a reset button), consistent with the app's existing dark-themed screens (see `welcome.tsx`'s color palette as a style reference).
- A reset action needs to actually recover: simplest safe option is `router.replace('/')` combined with resetting the boundary's own error state — but if the crash is caused by corrupted persisted state, a plain re-render will crash again. Consider whether the reset button should also offer "Clear local data and restart" as a nuclear option, or whether that's overit for a first version (leaning: keep it simple — retry re-render first; a data-clearing option can be a stretch FR, not required).

## Key decisions

**1. Class component `ErrorBoundary` (React error boundaries must be classes — no hook equivalent exists).** Wraps children in `app/_layout.tsx`, at or near the root, above the tab navigator.

**2. On catch: call `log.error('app.render_crash', error, {componentStack: <truncated/hashed if needed>})` then render a minimal fallback screen — not a full crash report screen, just "Something went wrong" + a "Try again" button that resets the boundary's `hasError` state.** Per spec 08's own redaction rules, do NOT log `error.message` or the full component stack verbatim if it could contain dynamic values — a short static category is enough; consider logging just the error's constructor name, matching the pattern `log.error` already uses elsewhere.

**3. "Try again" resets local boundary state and re-renders children.** No forced app restart, no `Updates.reloadAsync()` unless "Try again" itself throws again — if it does, the fallback UI persists (which is correct — no infinite reload loop).

**4. No third-party crash reporting** — explicitly out of scope per both this feature's FEATURE.md and the original `resilience-fixes` FEATURE.md's privacy stance.

## Interface contracts

```tsx
// src/components/ErrorBoundary.tsx (new)
import { Component, ReactNode } from 'react';
import { log } from '@/src/lib/log';

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    log.error('app.render_crash', error, {});
  }

  private handleRetry = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

// app/_layout.tsx
<ErrorBoundary>
  {/* existing tree */}
</ErrorBoundary>
```

## Test plan

- [ ] A child component that throws during render is caught; fallback UI renders instead of propagating the exception.
- [ ] `log.error('app.render_crash', ...)` fires exactly once on catch, with no message/stack text in `meta`.
- [ ] Tapping "Try again" resets `hasError` to `false` and attempts to re-render children.
- [ ] If children throw again immediately after retry, the fallback UI re-appears (no crash loop, no infinite log spam — verify log doesn't fire unboundedly if retried repeatedly in a tight loop; consider a simple debounce/count cap if this is a real risk).
- [ ] Non-crashing children render normally through the boundary (no behavior change in the happy path).

## Files to reference

| File | Why |
|---|---|
| `app/_layout.tsx` | Root layout — where the boundary wraps the tree. |
| `src/lib/log.ts` | Logger for the `app.render_crash` category. |
| `app/(auth)/welcome.tsx` | Color/style reference for the fallback screen's visual design. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ | React Testing Library — render a throwing child, assert fallback UI + log call |
| Live-QA probe | ✗ | No API involved |
| TestFlight | ✓ | Force a dev-only throw (temporary), confirm fallback UI appears instead of a blank screen/redbox in a release-mode build |
| Error log | ✓ | Confirms `app.render_crash` entries appear in the shared debug log |

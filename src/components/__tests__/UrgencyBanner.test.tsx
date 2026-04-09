// Tests: UrgencyBanner — FR7 (05-hours-dashboard)
// Verifies design-token migration: no StyleSheet, no hardcoded hex, className only.
//
// NOTE on NativeWind v4 + test-renderer:
// className values are hashed in Jest — use source-file static analysis for class checks.

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

const BANNER_FILE = path.resolve(__dirname, '../UrgencyBanner.tsx');

// ─── Runtime render checks ────────────────────────────────────────────────────

describe('UrgencyBanner — runtime render', () => {
  let UrgencyBanner: any;

  beforeAll(() => {
    UrgencyBanner = require('../UrgencyBanner').UrgencyBanner;
  });

  it('SC7.1 — renders without crash for low urgency (12h remaining)', () => {
    const ms = 11 * 60 * 60 * 1000; // 11 hours — low urgency
    expect(() => {
      act(() => {
        create(React.createElement(UrgencyBanner, { timeRemaining: ms }));
      });
    }).not.toThrow();
  });

  it('SC7.2 — renders without crash for high urgency (2h remaining)', () => {
    const ms = 2 * 60 * 60 * 1000;
    expect(() => {
      act(() => {
        create(React.createElement(UrgencyBanner, { timeRemaining: ms }));
      });
    }).not.toThrow();
  });

  it('SC7.3 — renders without crash for critical urgency (30min remaining)', () => {
    const ms = 30 * 60 * 1000;
    expect(() => {
      act(() => {
        create(React.createElement(UrgencyBanner, { timeRemaining: ms }));
      });
    }).not.toThrow();
  });

  it('SC7.4 — renders without crash for expired (negative ms)', () => {
    expect(() => {
      act(() => {
        create(React.createElement(UrgencyBanner, { timeRemaining: -1000 }));
      });
    }).not.toThrow();
  });

  it('SC7.5 — returns null when urgency is none (>12h remaining)', () => {
    const ms = 24 * 60 * 60 * 1000; // 24 hours — no urgency
    let tree: any;
    act(() => {
      tree = create(React.createElement(UrgencyBanner, { timeRemaining: ms }));
    });
    expect(tree.toJSON()).toBeNull();
  });

  it('SC7.6 — testID="urgency-banner" present somewhere in rendered tree', () => {
    const ms = 2 * 60 * 60 * 1000; // 2h — high urgency
    let tree: any;
    act(() => {
      tree = create(React.createElement(UrgencyBanner, { timeRemaining: ms }));
    });
    const json = tree.toJSON();
    expect(json).not.toBeNull();
    // testID may be on root or a child (NativeWind may wrap the View).
    // Verify via JSON serialization.
    const serialised = JSON.stringify(json);
    expect(serialised).toContain('"urgency-banner"');
  });

  it('SC7.7 — shows "Expired" text when timeRemaining is negative', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(UrgencyBanner, { timeRemaining: -100 }));
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('Expired');
  });

  it('SC7.8 — shows "Deadline in" text for non-expired urgency', () => {
    const ms = 2 * 60 * 60 * 1000;
    let tree: any;
    act(() => {
      tree = create(React.createElement(UrgencyBanner, { timeRemaining: ms }));
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('Deadline in');
  });
});

// ─── Source file static checks (design token migration) ───────────────────────

describe('UrgencyBanner — source design token checks', () => {
  let source: string;
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(BANNER_FILE, 'utf8');
    // Strip comments for strict checks
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('SC7.9 — source does not import StyleSheet', () => {
    expect(code).not.toMatch(/\bStyleSheet\b/);
  });

  it('SC7.10 — source does not call StyleSheet.create', () => {
    expect(code).not.toContain('StyleSheet.create');
  });

  it('SC7.11 — source does not contain hardcoded hex color strings', () => {
    expect(code).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });

  it('SC7.12 — source contains bg-warning class for low/high urgency', () => {
    expect(source).toContain('bg-warning');
  });

  it('SC7.13 — source contains bg-critical class for critical/expired urgency', () => {
    expect(source).toContain('bg-critical');
  });

  it('SC7.14 — source uses className for banner styling (not inline style object map)', () => {
    expect(source).toMatch(/className/);
  });

  it('SC7.15 — testID="urgency-banner" is present in source', () => {
    expect(source).toContain('testID="urgency-banner"');
  });
});

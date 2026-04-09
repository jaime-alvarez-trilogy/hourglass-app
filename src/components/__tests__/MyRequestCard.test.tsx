// Tests: MyRequestCard component — FR2 (02-approvals-tab-redesign)
//
// Strategy:
//   - Runtime render checks for each status badge + rejection reason logic
//   - Duration formatting: hours vs minutes
//   - Source-file static analysis for NativeWind token compliance
//
// NOTE on NativeWind v4 + test-renderer:
// NativeWind v4 transforms className to hashed IDs in Jest/node.
// className assertions are done via source-file static analysis (fs.readFileSync).

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';
import type { ManualRequestEntry } from '@/src/types/requests';

const CARD_FILE = path.resolve(__dirname, '../MyRequestCard.tsx');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PENDING_ENTRY: ManualRequestEntry = {
  id: '2026-03-17|Fix deploy script',
  date: '2026-03-17',
  durationMinutes: 30,
  memo: 'Fix deploy script',
  status: 'PENDING',
  rejectionReason: null,
};

const APPROVED_ENTRY: ManualRequestEntry = {
  id: '2026-03-16|Review PR',
  date: '2026-03-16',
  durationMinutes: 150,
  memo: 'Review PR',
  status: 'APPROVED',
  rejectionReason: null,
};

const REJECTED_ENTRY_WITH_REASON: ManualRequestEntry = {
  id: '2026-03-15|Wrote docs',
  date: '2026-03-15',
  durationMinutes: 60,
  memo: 'Wrote docs',
  status: 'REJECTED',
  rejectionReason: 'Not enough detail in description',
};

const REJECTED_ENTRY_NO_REASON: ManualRequestEntry = {
  id: '2026-03-14|Debug session',
  date: '2026-03-14',
  durationMinutes: 90,
  memo: 'Debug session',
  status: 'REJECTED',
  rejectionReason: null,
};

const ZERO_DURATION_ENTRY: ManualRequestEntry = {
  id: '2026-03-13|Edge case',
  date: '2026-03-13',
  durationMinutes: 0,
  memo: 'Edge case',
  status: 'PENDING',
  rejectionReason: null,
};

const LONG_MEMO_ENTRY: ManualRequestEntry = {
  id: '2026-03-12|very long memo',
  date: '2026-03-12',
  durationMinutes: 20,
  memo: 'A very long memo that exceeds the normal length and should be truncated gracefully because it contains many words that go well beyond two lines of text on a mobile screen',
  status: 'APPROVED',
  rejectionReason: null,
};

// ─── Runtime render checks ────────────────────────────────────────────────────

describe('MyRequestCard — FR2: runtime render', () => {
  let MyRequestCard: any;

  beforeAll(() => {
    MyRequestCard = require('../MyRequestCard').default;
  });

  // SC2.1 — PENDING entry: gold badge, no rejection reason row
  it('SC2.1 — PENDING entry renders without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(MyRequestCard, { entry: PENDING_ENTRY }));
      });
    }).not.toThrow();
  });

  it('SC2.1 — PENDING entry: rendered text contains "PENDING" or "Pending"', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(MyRequestCard, { entry: PENDING_ENTRY }));
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toMatch(/pending/i);
  });

  it('SC2.1 — PENDING entry: rejection reason text NOT in output', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(MyRequestCard, { entry: PENDING_ENTRY }));
    });
    const text = JSON.stringify(tree.toJSON());
    // Neither the reason nor the "No reason provided" fallback should appear
    expect(text).not.toContain('No reason provided');
    expect(text).not.toContain('Not enough detail');
  });

  // SC2.2 — APPROVED entry: success green badge
  it('SC2.2 — APPROVED entry renders without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(MyRequestCard, { entry: APPROVED_ENTRY }));
      });
    }).not.toThrow();
  });

  it('SC2.2 — APPROVED entry: rendered text contains "APPROVED" or "Approved"', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(MyRequestCard, { entry: APPROVED_ENTRY }));
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toMatch(/approved/i);
  });

  // SC2.3 — REJECTED with reason: red badge + reason text
  it('SC2.3 — REJECTED entry (with reason) renders without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(MyRequestCard, { entry: REJECTED_ENTRY_WITH_REASON }));
      });
    }).not.toThrow();
  });

  it('SC2.3 — REJECTED entry: rendered text contains "REJECTED" or "Rejected"', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(MyRequestCard, { entry: REJECTED_ENTRY_WITH_REASON }));
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toMatch(/rejected/i);
  });

  it('SC2.3 — REJECTED entry: rejection reason text is visible in output', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(MyRequestCard, { entry: REJECTED_ENTRY_WITH_REASON }));
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('Not enough detail in description');
  });

  // SC2.4 — REJECTED with null reason: "No reason provided" fallback
  it('SC2.4 — REJECTED with rejectionReason null: shows "No reason provided"', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(MyRequestCard, { entry: REJECTED_ENTRY_NO_REASON }));
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('No reason provided');
  });

  // SC2.5 — Duration ≥ 60 min formatted as hours
  it('SC2.5 — 150 min duration shows "2.5h" in output', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(MyRequestCard, { entry: APPROVED_ENTRY })); // 150 min
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('2.5h');
  });

  it('SC2.5 — 60 min duration shows "1h" in output', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(MyRequestCard, { entry: REJECTED_ENTRY_WITH_REASON })); // 60 min
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('1h');
  });

  // SC2.6 — Duration < 60 min formatted as "N min"
  it('SC2.6 — 30 min duration shows "30 min" in output', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(MyRequestCard, { entry: PENDING_ENTRY })); // 30 min
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('30 min');
  });

  it('SC2.6 — 30 min duration does NOT show "0.5h" format', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(MyRequestCard, { entry: PENDING_ENTRY }));
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).not.toContain('0.5h');
  });

  // SC2.7 — Zero duration shows "0 min" without crash
  it('SC2.7 — 0 min duration renders without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(MyRequestCard, { entry: ZERO_DURATION_ENTRY }));
      });
    }).not.toThrow();
  });

  it('SC2.7 — 0 min duration shows "0 min" in output', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(MyRequestCard, { entry: ZERO_DURATION_ENTRY }));
    });
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('0 min');
  });

  // SC2.8 — Long memo renders without crash
  it('SC2.8 — long memo entry renders without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(MyRequestCard, { entry: LONG_MEMO_ENTRY }));
      });
    }).not.toThrow();
  });

  it('SC2.8 — long memo: component returns a non-null rendered tree', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(MyRequestCard, { entry: LONG_MEMO_ENTRY }));
    });
    expect(tree.toJSON()).not.toBeNull();
  });
});

// ─── Source file static checks (FR2 — SC2.9) ─────────────────────────────────

describe('MyRequestCard — FR2: source file design token checks', () => {
  let source: string;
  let code: string;

  beforeAll(() => {
    source = fs.readFileSync(CARD_FILE, 'utf8');
    code = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('SC2.9 — source does not import StyleSheet', () => {
    expect(code).not.toMatch(/\bStyleSheet\b/);
  });

  it('SC2.9 — source does not call StyleSheet.create', () => {
    expect(code).not.toContain('StyleSheet.create');
  });

  it('SC2.9 — source does not contain hardcoded hex color strings', () => {
    expect(code).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });

  it('SC2.9 — source contains bg-gold token (PENDING badge)', () => {
    expect(source).toContain('bg-gold');
  });

  it('SC2.9 — source contains bg-success token (APPROVED badge)', () => {
    expect(source).toContain('bg-success');
  });

  it('SC2.9 — source contains bg-critical token (REJECTED badge)', () => {
    expect(source).toContain('bg-critical');
  });

  it('SC2.9 — source uses className (not style prop) for badge styling', () => {
    expect(source).toMatch(/className/);
  });
});

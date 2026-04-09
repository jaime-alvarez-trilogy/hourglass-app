// Tests: SectionLabel component (03-base-components)
// FR3: Uppercase section header, design system typography
//
// NOTE on NativeWind v4 + test-renderer:
// NativeWind v4 transforms className to hashed IDs in Jest/node.
// className assertions are done via source-file static analysis (fs.readFileSync).

import React from 'react';
import { create, act } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';

const SECTION_LABEL_FILE = path.resolve(__dirname, '../SectionLabel.tsx');

// ─── Runtime render checks ────────────────────────────────────────────────────

describe('SectionLabel — FR3: runtime render', () => {
  let SectionLabel: any;

  beforeAll(() => {
    SectionLabel = require('../SectionLabel').default;
  });

  it('SC3.1 — renders string children without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(SectionLabel, null, 'WEEKLY HOURS'));
      });
    }).not.toThrow();
  });

  it('SC3.1 — renders with className prop without crash', () => {
    expect(() => {
      act(() => {
        create(React.createElement(SectionLabel, { className: 'mb-2' }, 'SECTION'));
      });
    }).not.toThrow();
  });

  it('SC3.1 — renders text content in output', () => {
    let tree: any;
    act(() => {
      tree = create(React.createElement(SectionLabel, null, 'MY LABEL'));
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('MY LABEL');
  });
});

// ─── Source file static checks ────────────────────────────────────────────────

describe('SectionLabel — FR3: source file class strings', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SECTION_LABEL_FILE, 'utf8');
  });

  it('SC3.2 — source contains text-textSecondary class string', () => {
    expect(source).toContain('text-textSecondary');
  });

  it('SC3.3 — source contains uppercase class string', () => {
    expect(source).toContain('uppercase');
  });

  it('SC3.3 — source contains tracking-widest class string', () => {
    expect(source).toContain('tracking-widest');
  });

  it('SC3.4 — source contains font-sans-semibold class string', () => {
    expect(source).toContain('font-sans-semibold');
  });

  it('SC3.5 — source accepts className prop (className appears in code)', () => {
    expect(source).toMatch(/className/);
  });

  it('SC3.6 — source does not use StyleSheet.create (outside comments)', () => {
    const codeWithoutComments = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codeWithoutComments).not.toContain('StyleSheet.create');
  });

  it('SC3.6 — source does not import StyleSheet (outside comments)', () => {
    const codeWithoutComments = source
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codeWithoutComments).not.toMatch(/\bStyleSheet\b/);
  });
});

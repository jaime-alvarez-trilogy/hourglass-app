// 10-sdk-58-ios-27 — source-migration guards. FR2 creates this file; FR3 and FR4 extend it.
//
// Walks the app's own source (app/, src/, components/, hooks/, constants/), skipping
// __tests__, __mocks__, node_modules and *.test.* files, and parses every file with the
// TypeScript compiler. Matching on the AST means comments and string contents can't cause a
// false hit, and a call split across lines can't slip past. Each ban also has a positive
// control (known sites the walk must see) and detector fixtures, so no case passes vacuously.
//
// FR2 (SDK 55, forward-compatible with SDK 58):
//   - useIsFocused comes from expo-router (exported since 55.0.7; SDK 58 drops @react-navigation).
//   - No Skia.Path.Make() and no copy()+trim(): Skia 2.14 removes the mutable SkPath API (#4092).
//     MakeFromSVGString and <Path start end> work on both 2.4.18 and 2.14.0 (spec-research F2.4).
//   - components/haptic-tab.tsx is gone (its PlatformPressable survives only in a deprecated fork).
//
// FR3 (SDK 55, forward-compatible with SDK 58):
//   - No code reads whatwg-fetch internals (_bodyInit/_bodyText/_bodyBlob). From SDK 56,
//     globalThis.fetch is expo/fetch, whose Response has none of them (spec-research F2.7).
//
// FR4 (SDK 58):
//   - No module reference to @react-navigation/* at all: expo-router 58 has no
//     @react-navigation dependency or peer, and re-exports the themes and tab types.
//   - NativeTabs from expo-router/native-tabs (unstable-native-tabs is deprecated), Tabs from
//     expo-router/js-tabs (the root Tabs export is deprecated).
//   - No initialRouteName= JSX prop (Omit-ted from the Stack props); the (auth) layout uses
//     `export const unstable_settings = { anchor: 'welcome' }` instead.
//   - A second walk over test files (__tests__/, __mocks__/, *.test.*) finds no jest.mock /
//     requireActual / import of @react-navigation/*: a non-virtual mock of a module that no
//     longer resolves throws and takes the whole suite down.

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '../..');
const SOURCE_DIRS = ['app', 'src', 'components', 'hooks', 'constants'];
const SKIP_DIRS = new Set(['__tests__', '__mocks__', 'node_modules']);
const SOURCE_FILE = /\.(ts|tsx|js|jsx)$/;
const TEST_FILE = /\.test\.[jt]sx?$/;

// ─── Walk + parse ─────────────────────────────────────────────────────────────

function walk(dir: string, out: string[]): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(abs, out);
    } else if (entry.isFile() && SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.js')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parse(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind(fileName));
}

/** Syntax errors from the parser (internal field; an unparsable file would hide its contents). */
function parseErrors(sf: ts.SourceFile): readonly ts.Diagnostic[] {
  return (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
}

function visit(node: ts.Node, fn: (n: ts.Node) => void): void {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** Strip wrappers that don't change which object a call is made on: `(x)`, `x!`, `x as T`. */
function unwrap(e: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e)) {
    e = e.expression;
  }
  return e;
}

/** `Skia.Path.Make` for a plain identifier/property chain, otherwise undefined. */
function dottedName(e: ts.Expression): string | undefined {
  const x = unwrap(e);
  if (ts.isIdentifier(x)) return x.text;
  if (ts.isPropertyAccessExpression(x)) {
    const head = dottedName(x.expression);
    return head === undefined ? undefined : `${head}.${x.name.text}`;
  }
  return undefined;
}

// ─── Detectors (pure; each has fixture cases below) ───────────────────────────

type ModuleRef = { module: string; names: string[]; line: number };

/**
 * Every module reference in a file, with the binding names it pulls in.
 * `import`/`export … from`, `require('x')` and `import('x')`. A namespace, default-less
 * whole-module or untracked require shows up as `*`.
 */
function moduleRefs(sf: ts.SourceFile): ModuleRef[] {
  const refs: ModuleRef[] = [];
  visit(sf, (n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const names: string[] = [];
      const clause = n.importClause;
      if (clause?.name) names.push('default');
      const nb = clause?.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) names.push('*');
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) names.push((el.propertyName ?? el.name).text);
      }
      if (!clause) names.push('*'); // side-effect import
      refs.push({ module: n.moduleSpecifier.text, names, line: lineOf(sf, n) });
    } else if (
      ts.isExportDeclaration(n) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      const names: string[] = [];
      const ec = n.exportClause;
      if (!ec || ts.isNamespaceExport(ec)) names.push('*');
      else for (const el of ec.elements) names.push((el.propertyName ?? el.name).text);
      refs.push({ module: n.moduleSpecifier.text, names, line: lineOf(sf, n) });
    } else if (ts.isCallExpression(n) && n.arguments.length >= 1) {
      const arg = n.arguments[0];
      const isRequire = ts.isIdentifier(n.expression) && n.expression.text === 'require';
      const isDynamicImport = n.expression.kind === ts.SyntaxKind.ImportKeyword;
      if ((isRequire || isDynamicImport) && ts.isStringLiteralLike(arg)) {
        const names: string[] = [];
        const parent = n.parent;
        if (
          isRequire &&
          ts.isVariableDeclaration(parent) &&
          ts.isObjectBindingPattern(parent.name)
        ) {
          for (const el of parent.name.elements) {
            const key = el.propertyName ?? el.name;
            if (ts.isIdentifier(key)) names.push(key.text);
          }
        } else if (isRequire && ts.isPropertyAccessExpression(parent)) {
          names.push(parent.name.text);
        } else {
          names.push('*');
        }
        refs.push({ module: arg.text, names, line: lineOf(sf, n) });
      }
    }
  });
  return refs;
}

/** Lines that bring `useIsFocused` in from @react-navigation/native (named, aliased or via `*`). */
function useIsFocusedFromReactNavigation(sf: ts.SourceFile): number[] {
  const mentionsHook = sf.text.includes('useIsFocused');
  return moduleRefs(sf)
    .filter((r) => r.module === '@react-navigation/native')
    .filter((r) => r.names.includes('useIsFocused') || (r.names.includes('*') && mentionsHook))
    .map((r) => r.line);
}

/** Calls to `Skia.Path.Make(…)` (the mutable-path constructor idiom; spec-research Decision 7). */
function skiaPathMakeCalls(sf: ts.SourceFile): number[] {
  const lines: number[] = [];
  visit(sf, (n) => {
    if (ts.isCallExpression(n) && dottedName(n.expression) === 'Skia.Path.Make') {
      lines.push(lineOf(sf, n));
    }
  });
  return lines;
}

/** Calls to `Skia.Path.MakeFromSVGString(…)` (the version-neutral idiom; positive control). */
function skiaMakeFromSvgCalls(sf: ts.SourceFile): number[] {
  const lines: number[] = [];
  visit(sf, (n) => {
    if (ts.isCallExpression(n) && dottedName(n.expression) === 'Skia.Path.MakeFromSVGString') {
      lines.push(lineOf(sf, n));
    }
  });
  return lines;
}

/**
 * `.trim(` on a path copy: either the direct chain `x.copy().trim(…)` or a binding
 * initialized from `.copy()` and trimmed later (`const p = x.copy(); p.trim(…)`, the
 * pre-FR2 AIArcHero shape). String `.trim()` never matches: nothing here calls `.copy()`.
 */
function copyThenTrimCalls(sf: ts.SourceFile): number[] {
  const isCopyCall = (e: ts.Expression): boolean => {
    const x = unwrap(e);
    return (
      ts.isCallExpression(x) &&
      ts.isPropertyAccessExpression(x.expression) &&
      x.expression.name.text === 'copy'
    );
  };
  const copies = new Set<string>();
  visit(sf, (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && isCopyCall(n.initializer)) {
      copies.add(n.name.text);
    }
  });
  const lines: number[] = [];
  visit(sf, (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'trim'
    ) {
      const receiver = unwrap(n.expression.expression);
      if (isCopyCall(receiver) || (ts.isIdentifier(receiver) && copies.has(receiver.text))) {
        lines.push(lineOf(sf, n));
      }
    }
  });
  return lines;
}

const WHATWG_BODY_INTERNALS = new Set(['_bodyInit', '_bodyText', '_bodyBlob']);

/**
 * Reads of whatwg-fetch Response internals: `r._bodyInit`, `r['_bodyText']`,
 * `const { _bodyBlob } = r` and `'_bodyInit' in r`. A string that merely contains the
 * name (a log message) and comments don't count.
 */
function whatwgBodyInternalReads(sf: ts.SourceFile): number[] {
  const lines: number[] = [];
  visit(sf, (n) => {
    const hit =
      (ts.isPropertyAccessExpression(n) && WHATWG_BODY_INTERNALS.has(n.name.text)) ||
      (ts.isElementAccessExpression(n) &&
        ts.isStringLiteralLike(n.argumentExpression) &&
        WHATWG_BODY_INTERNALS.has(n.argumentExpression.text)) ||
      (ts.isBindingElement(n) &&
        ts.isObjectBindingPattern(n.parent) &&
        ts.isIdentifier(n.propertyName ?? n.name) &&
        WHATWG_BODY_INTERNALS.has(((n.propertyName ?? n.name) as ts.Identifier).text)) ||
      (ts.isBinaryExpression(n) &&
        n.operatorToken.kind === ts.SyntaxKind.InKeyword &&
        ts.isStringLiteralLike(n.left) &&
        WHATWG_BODY_INTERNALS.has(n.left.text));
    if (hit) lines.push(lineOf(sf, n));
  });
  return lines;
}

/** Calls to the global `fetch` (`fetch(…)`, `globalThis.fetch(…)`, `global.fetch(…)`). */
function fetchCalls(sf: ts.SourceFile): number[] {
  const lines: number[] = [];
  visit(sf, (n) => {
    if (!ts.isCallExpression(n)) return;
    const name = dottedName(n.expression);
    if (name === 'fetch' || name === 'globalThis.fetch' || name === 'global.fetch') {
      lines.push(lineOf(sf, n));
    }
  });
  return lines;
}

const isReactNavigation = (module: string): boolean => module.startsWith('@react-navigation/');

/** Lines with any import/export/require/import() of an @react-navigation/* module (FR4). */
function reactNavigationRefs(sf: ts.SourceFile): number[] {
  return moduleRefs(sf)
    .filter((r) => isReactNavigation(r.module))
    .map((r) => r.line);
}

/** Lines referencing the deprecated expo-router/unstable-native-tabs entry point. */
function unstableNativeTabsRefs(sf: ts.SourceFile): number[] {
  return moduleRefs(sf)
    .filter((r) => r.module === 'expo-router/unstable-native-tabs')
    .map((r) => r.line);
}

/**
 * Lines that take `Tabs` from the root 'expo-router' entry (deprecated in 58; use
 * 'expo-router/js-tabs'). A namespace import counts when the file reads `.Tabs`.
 */
function rootTabsImports(sf: ts.SourceFile): number[] {
  const readsDotTabs = /\.Tabs\b/.test(sf.text);
  return moduleRefs(sf)
    .filter((r) => r.module === 'expo-router')
    .filter((r) => r.names.includes('Tabs') || (r.names.includes('*') && readsDotTabs))
    .map((r) => r.line);
}

/** Lines with an `initialRouteName=` JSX attribute (Omit-ted from expo-router 58's Stack props). */
function initialRouteNameAttrs(sf: ts.SourceFile): number[] {
  const lines: number[] = [];
  visit(sf, (n) => {
    if (ts.isJsxAttribute(n) && ts.isIdentifier(n.name) && n.name.text === 'initialRouteName') {
      lines.push(lineOf(sf, n));
    }
  });
  return lines;
}

/**
 * The string-valued properties of `export const unstable_settings = { … }` (also through
 * `as const`), or undefined when the file doesn't export it.
 */
function exportedUnstableSettings(sf: ts.SourceFile): Record<string, string> | undefined {
  let found: Record<string, string> | undefined;
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const exported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== 'unstable_settings') continue;
      const init = decl.initializer && unwrap(decl.initializer);
      if (!init || !ts.isObjectLiteralExpression(init)) continue;
      found = {};
      for (const prop of init.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
          ts.isStringLiteralLike(unwrap(prop.initializer))
        ) {
          found[prop.name.text] = (unwrap(prop.initializer) as ts.StringLiteralLike).text;
        }
      }
    }
  }
  return found;
}

const JEST_MODULE_CALLS = new Set([
  'jest.mock',
  'jest.doMock',
  'jest.unmock',
  'jest.setMock',
  'jest.requireActual',
  'jest.requireMock',
  'requireActual',
]);

/** `jest.mock('x')`, `jest.requireActual('x')` etc. with a literal module name. */
function jestModuleCalls(sf: ts.SourceFile): { module: string; line: number }[] {
  const calls: { module: string; line: number }[] = [];
  visit(sf, (n) => {
    if (!ts.isCallExpression(n) || n.arguments.length < 1) return;
    const callee = dottedName(n.expression);
    const arg = n.arguments[0];
    if (callee && JEST_MODULE_CALLS.has(callee) && ts.isStringLiteralLike(arg)) {
      calls.push({ module: arg.text, line: lineOf(sf, n) });
    }
  });
  return calls;
}

/** Test-file hits: a jest module call or a plain module reference naming @react-navigation/*. */
function reactNavigationInTests(sf: ts.SourceFile): number[] {
  const lines = [
    ...jestModuleCalls(sf)
      .filter((c) => isReactNavigation(c.module))
      .map((c) => c.line),
    ...reactNavigationRefs(sf),
  ];
  return [...new Set(lines)].sort((a, b) => a - b);
}

// ─── The real tree ────────────────────────────────────────────────────────────

type Parsed = { rel: string; sf: ts.SourceFile };

const SOURCES: Parsed[] = SOURCE_DIRS.flatMap((d) => walk(path.join(ROOT, d), [])).map((abs) => ({
  rel: path.relative(ROOT, abs).split(path.sep).join('/'),
  sf: parse(abs, fs.readFileSync(abs, 'utf8')),
}));

// The second walk (FR4): test files only. Anything under __tests__/ or __mocks__/, plus any
// *.test.* file, across the root test dirs and the source dirs. node_modules is skipped.
const TEST_WALK_DIRS = ['__tests__', '__mocks__', ...SOURCE_DIRS];

function walkTests(dir: string, inTestDir: boolean, out: string[]): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkTests(abs, inTestDir || entry.name === '__tests__' || entry.name === '__mocks__', out);
    } else if (
      entry.isFile() &&
      SOURCE_FILE.test(entry.name) &&
      (inTestDir || TEST_FILE.test(entry.name))
    ) {
      out.push(abs);
    }
  }
  return out;
}

const TEST_SOURCES: Parsed[] = TEST_WALK_DIRS.flatMap((d) =>
  walkTests(path.join(ROOT, d), d === '__tests__' || d === '__mocks__', []),
).map((abs) => ({
  rel: path.relative(ROOT, abs).split(path.sep).join('/'),
  sf: parse(abs, fs.readFileSync(abs, 'utf8')),
}));

function source(rel: string): ts.SourceFile {
  const hit = SOURCES.find((s) => s.rel === rel);
  if (!hit) throw new Error(`source walk did not visit ${rel}`);
  return hit.sf;
}

/** `rel:line` for every hit of `detector` across the walked tree. */
function hitsAcrossTree(detector: (sf: ts.SourceFile) => number[]): string[] {
  return SOURCES.flatMap(({ rel, sf }) => detector(sf).map((line) => `${rel}:${line}`));
}

const parseFixture = (text: string, name = 'fixture.tsx') => parse(name, text);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('10 FR2/FR3/FR4 — source migrations', () => {
  describe('the walk', () => {
    it('visits a non-trivial tree (>= 50 files) including the known sites', () => {
      expect(SOURCES.length).toBeGreaterThanOrEqual(50);
      const rels = SOURCES.map((s) => s.rel);
      expect(rels).toEqual(
        expect.arrayContaining([
          'app/_layout.tsx',
          'src/components/FadeInScreen.tsx',
          'src/hooks/useFocusKey.ts',
          'src/hooks/useStaggeredEntry.ts',
          'src/components/ScrubCursor.ts',
          'src/components/AIArcHero.tsx',
          'src/api/client.ts',
          'src/lib/pushToken.ts',
        ]),
      );
    });

    it('skips __tests__, __mocks__, node_modules and *.test.* files', () => {
      const leaked = SOURCES.map((s) => s.rel).filter(
        (r) => /(^|\/)(__tests__|__mocks__|node_modules)\//.test(r) || TEST_FILE.test(r),
      );
      expect(leaked).toEqual([]);
    });

    it('parses every walked file without syntax errors (nothing is silently unscanned)', () => {
      const broken = SOURCES.filter(({ sf }) => parseErrors(sf).length > 0).map((s) => s.rel);
      expect(broken).toEqual([]);
    });
  });

  describe('detectors (fixtures)', () => {
    it('moduleRefs reads named, aliased, namespace, re-export and require forms', () => {
      const sf = parseFixture(
        [
          "import React, { useEffect } from 'react';",
          "import { useIsFocused as focused } from '@react-navigation/native';",
          "import * as Nav from '@react-navigation/bottom-tabs';",
          "export { Tabs } from 'expo-router';",
          "const { useRouter } = require('expo-router');",
          "const x = require('a').b;",
        ].join('\n'),
      );
      expect(moduleRefs(sf)).toEqual([
        { module: 'react', names: ['default', 'useEffect'], line: 1 },
        { module: '@react-navigation/native', names: ['useIsFocused'], line: 2 },
        { module: '@react-navigation/bottom-tabs', names: ['*'], line: 3 },
        { module: 'expo-router', names: ['Tabs'], line: 4 },
        { module: 'expo-router', names: ['useRouter'], line: 5 },
        { module: 'a', names: ['b'], line: 6 },
      ]);
    });

    it('useIsFocused detector flags react-navigation forms and ignores expo-router and comments', () => {
      expect(
        useIsFocusedFromReactNavigation(
          parseFixture("import { useIsFocused } from '@react-navigation/native';"),
        ),
      ).toEqual([1]);
      expect(
        useIsFocusedFromReactNavigation(
          parseFixture(
            "import * as Nav from '@react-navigation/native';\nconst f = Nav.useIsFocused();",
          ),
        ),
      ).toEqual([1]);
      expect(
        useIsFocusedFromReactNavigation(
          parseFixture(
            "// import { useIsFocused } from '@react-navigation/native';\nimport { useIsFocused } from 'expo-router';",
          ),
        ),
      ).toEqual([]);
    });

    it('Skia.Path.Make detector flags split-line calls and ignores MakeFromSVGString and comments', () => {
      expect(
        skiaPathMakeCalls(parseFixture('const a = Skia.Path.Make();\nconst b = Skia.Path\n  .Make();', 'f.ts')),
      ).toEqual([1, 2]);
      expect(
        skiaPathMakeCalls(
          parseFixture("// Skia.Path.Make()\nconst p = Skia.Path.MakeFromSVGString('M 0 0')!;", 'f.ts'),
        ),
      ).toEqual([]);
    });

    it('copy-then-trim detector flags the chain and the pre-FR2 AIArcHero shape, not String.trim', () => {
      expect(copyThenTrimCalls(parseFixture('const q = path.copy().trim(0, 0.5, false);', 'f.ts'))).toEqual([1]);
      expect(
        copyThenTrimCalls(
          parseFixture(
            'const t = useDerivedValue(() => {\n  const p = fullSkiaPath.copy();\n  p.trim(0, sweep.value, false);\n  return p;\n});',
            'f.ts',
          ),
        ),
      ).toEqual([3]);
      expect(
        copyThenTrimCalls(parseFixture("const s = ' x '.trim();\nconst n = name.trim();", 'f.ts')),
      ).toEqual([]);
    });

    it('whatwg-internals detector flags property, element, destructure and `in` reads, not strings or comments', () => {
      expect(
        whatwgBodyInternalReads(
          parseFixture(
            [
              'const a = res._bodyInit;',
              "const b = res['_bodyText'];",
              'const { _bodyBlob: blob } = res;',
              "const c = '_bodyInit' in res;",
              'const { _bodyText } = res;',
            ].join('\n'),
            'f.ts',
          ),
        ),
      ).toEqual([1, 2, 3, 4, 5]);
      expect(
        whatwgBodyInternalReads(
          parseFixture(
            "// res._bodyInit\nconsole.warn('no _bodyInit here');\nconst u = res.bodyUsed;\nconst t = await res.text();",
            'f.ts',
          ),
        ),
      ).toEqual([]);
    });

    it('fetch-call detector flags fetch, globalThis.fetch and global.fetch, not other .fetch methods', () => {
      expect(
        fetchCalls(
          parseFixture(
            "await fetch('a');\nawait globalThis.fetch('b');\nawait global.fetch('c');\nqueryClient.fetchQuery();\nclient.fetch('d');",
            'f.ts',
          ),
        ),
      ).toEqual([1, 2, 3]);
    });
  });

  describe('FR2', () => {
    it('no @react-navigation imports: useIsFocused comes from expo-router (FR4 widens this to all)', () => {
      expect(hitsAcrossTree(useIsFocusedFromReactNavigation)).toEqual([]);
      // Positive control: the three hook sites import it, and from 'expo-router'.
      for (const rel of [
        'src/components/FadeInScreen.tsx',
        'src/hooks/useFocusKey.ts',
        'src/hooks/useStaggeredEntry.ts',
      ]) {
        const from = moduleRefs(source(rel))
          .filter((r) => r.names.includes('useIsFocused'))
          .map((r) => r.module);
        expect({ rel, from }).toEqual({ rel, from: ['expo-router'] });
      }
    });

    it('no Skia.Path.Make() call', () => {
      expect(hitsAcrossTree(skiaPathMakeCalls)).toEqual([]);
      // Positive control: both former Make() sites now build through MakeFromSVGString.
      expect(skiaMakeFromSvgCalls(source('src/components/ScrubCursor.ts')).length).toBeGreaterThanOrEqual(1);
      expect(skiaMakeFromSvgCalls(source('src/components/AIArcHero.tsx')).length).toBeGreaterThanOrEqual(1);
    });

    it('no .copy().trim( chain (direct, or through a copied binding)', () => {
      expect(hitsAcrossTree(copyThenTrimCalls)).toEqual([]);
    });

    it('components/haptic-tab.tsx is absent, and nothing imports it', () => {
      expect(fs.existsSync(path.join(ROOT, 'components', 'haptic-tab.tsx'))).toBe(false);
      const importers = SOURCES.flatMap(({ rel, sf }) =>
        moduleRefs(sf)
          .filter((r) => /(^|\/)haptic-tab$/.test(r.module))
          .map((r) => `${rel}:${r.line}`),
      );
      expect(importers).toEqual([]);
    });
  });

  describe('FR3', () => {
    it('no whatwg-fetch internals (_bodyInit|_bodyText|_bodyBlob)', () => {
      expect(hitsAcrossTree(whatwgBodyInternalReads)).toEqual([]);
    });

    it('positive control: the walk sees every fetch() call site (spec-research F2.7 inventory)', () => {
      // A new fetch() site must follow the FR3 rules (one body read, FetchError → NetworkError).
      // Review it against src/api/client.ts, then add it here.
      const perFile: Record<string, number> = {};
      for (const hit of hitsAcrossTree(fetchCalls)) {
        const rel = hit.slice(0, hit.lastIndexOf(':'));
        perFile[rel] = (perFile[rel] ?? 0) + 1;
      }
      expect(perFile).toEqual({ 'src/api/client.ts': 3, 'src/lib/pushToken.ts': 2 });
    });
  });

  describe('FR4 detectors (fixtures)', () => {
    it('react-navigation detector flags every module form, any subpath, and ignores strings/comments', () => {
      expect(
        reactNavigationRefs(
          parseFixture(
            [
              "import { DarkTheme } from '@react-navigation/native';",
              "import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';",
              "export { PlatformPressable } from '@react-navigation/elements';",
              "const n = require('@react-navigation/native');",
              "// import { X } from '@react-navigation/native';",
              "const s = 'from @react-navigation/native';",
              "import { DarkTheme as D } from 'expo-router';",
            ].join('\n'),
          ),
        ),
      ).toEqual([1, 2, 3, 4]);
    });

    it('unstable-native-tabs detector flags only the deprecated entry point', () => {
      expect(
        unstableNativeTabsRefs(
          parseFixture(
            "import { NativeTabs } from 'expo-router/unstable-native-tabs';\nimport { NativeTabs as N } from 'expo-router/native-tabs';",
          ),
        ),
      ).toEqual([1]);
    });

    it('root-Tabs detector flags Tabs from the root (named, aliased, namespace), not from js-tabs', () => {
      expect(
        rootTabsImports(
          parseFixture(
            [
              "import { Stack, Tabs } from 'expo-router';",
              "import { Tabs as T } from 'expo-router';",
              "import { Tabs as J } from 'expo-router/js-tabs';",
              "import { Stack as S } from 'expo-router';",
            ].join('\n'),
          ),
        ),
      ).toEqual([1, 2]);
      expect(
        rootTabsImports(parseFixture("import * as Router from 'expo-router';\nconst X = Router.Tabs;")),
      ).toEqual([1]);
      expect(
        rootTabsImports(parseFixture("import * as Router from 'expo-router';\nconst X = Router.Stack;")),
      ).toEqual([]);
    });

    it('initialRouteName detector flags the JSX prop, not comments or strings', () => {
      expect(
        initialRouteNameAttrs(
          parseFixture(
            [
              'const a = <Stack screenOptions={{}} initialRouteName="welcome" />;',
              '// <Stack initialRouteName="x" />',
              "const s = 'initialRouteName=';",
              'const b = <Stack\n  initialRouteName={name}\n/>;',
            ].join('\n'),
          ),
        ),
      ).toEqual([1, 5]);
    });

    it('unstable_settings reader reads the exported literal (also `as const`), not a local one', () => {
      expect(
        exportedUnstableSettings(parseFixture("export const unstable_settings = { anchor: 'welcome' };")),
      ).toEqual({ anchor: 'welcome' });
      expect(
        exportedUnstableSettings(
          parseFixture("export const unstable_settings = { anchor: 'index' } as const;"),
        ),
      ).toEqual({ anchor: 'index' });
      expect(
        exportedUnstableSettings(parseFixture("const unstable_settings = { anchor: 'welcome' };")),
      ).toBeUndefined();
      expect(exportedUnstableSettings(parseFixture('export const other = 1;'))).toBeUndefined();
    });

    it('test-file detector flags jest.mock / requireActual / require / import of @react-navigation/*', () => {
      expect(
        reactNavigationInTests(
          parseFixture(
            [
              "jest.mock('@react-navigation/native', () => ({}));",
              "const a = jest.requireActual('@react-navigation/native');",
              "jest.doMock('@react-navigation/bottom-tabs');",
              "jest.mock('expo-router', () => ({ ...jest.requireActual('@react-navigation/elements') }));",
              "import { NavigationContainer } from '@react-navigation/native';",
              "jest.mock('expo-router', () => ({ useIsFocused: () => true }));",
              "expect(source).not.toContain('@react-navigation');",
            ].join('\n'),
            'f.test.tsx',
          ),
        ),
      ).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('FR4', () => {
    it('no @react-navigation/* module reference anywhere in app source', () => {
      expect(hitsAcrossTree(reactNavigationRefs)).toEqual([]);
    });

    it('positive control: the themes and the tab-bar props type come from expo-router', () => {
      const fromOf = (rel: string, name: string): string[] =>
        moduleRefs(source(rel))
          .filter((r) => r.names.includes(name))
          .map((r) => r.module);
      expect({
        DarkTheme: fromOf('app/_layout.tsx', 'DarkTheme'),
        DefaultTheme: fromOf('app/_layout.tsx', 'DefaultTheme'),
        ThemeProvider: fromOf('app/_layout.tsx', 'ThemeProvider'),
        BottomTabBarProps: fromOf('src/components/FloatingPillTabBar.tsx', 'BottomTabBarProps'),
      }).toEqual({
        DarkTheme: ['expo-router'],
        DefaultTheme: ['expo-router'],
        ThemeProvider: ['expo-router'],
        BottomTabBarProps: ['expo-router/js-tabs'],
      });
    });

    it('no expo-router/unstable-native-tabs, and no Tabs from the root expo-router entry', () => {
      expect(hitsAcrossTree(unstableNativeTabsRefs)).toEqual([]);
      expect(hitsAcrossTree(rootTabsImports)).toEqual([]);
      // Positive control: the tab layout still has both navigators, from the new entry points.
      const refs = moduleRefs(source('app/(tabs)/_layout.tsx'));
      const fromOf = (name: string) => refs.filter((r) => r.names.includes(name)).map((r) => r.module);
      expect({ NativeTabs: fromOf('NativeTabs'), Tabs: fromOf('Tabs') }).toEqual({
        NativeTabs: ['expo-router/native-tabs'],
        Tabs: ['expo-router/js-tabs'],
      });
    });

    it('no initialRouteName= JSX prop anywhere in app source', () => {
      expect(hitsAcrossTree(initialRouteNameAttrs)).toEqual([]);
    });

    it('(auth) layout exports unstable_settings.anchor === "welcome"', () => {
      expect(exportedUnstableSettings(source('app/(auth)/_layout.tsx'))).toEqual(
        expect.objectContaining({ anchor: 'welcome' }),
      );
    });

    describe('the test-file walk', () => {
      it('visits a non-trivial set of test files (>= 100) including the known ones, all parseable', () => {
        expect(TEST_SOURCES.length).toBeGreaterThanOrEqual(100);
        expect(TEST_SOURCES.map((s) => s.rel)).toEqual(
          expect.arrayContaining([
            'app/__tests__/layout-notifications.test.tsx',
            'src/components/__tests__/FloatingPillTabBar.test.ts',
            '__tests__/auth-screens.test.tsx',
            '__mocks__/@shopify/react-native-skia.ts',
          ]),
        );
        const broken = TEST_SOURCES.filter(({ sf }) => parseErrors(sf).length > 0).map((s) => s.rel);
        expect(broken).toEqual([]);
        // Every walked file is a test file or a mock; app source stays in the first walk.
        const stray = TEST_SOURCES.map((s) => s.rel).filter(
          (r) => !/(^|\/)(__tests__|__mocks__)\//.test(r) && !TEST_FILE.test(r),
        );
        expect(stray).toEqual([]);
      });

      it('positive control: the jest-call reader sees the expo-router mock in layout-notifications', () => {
        const hit = TEST_SOURCES.find((s) => s.rel === 'app/__tests__/layout-notifications.test.tsx')!;
        expect(jestModuleCalls(hit.sf).map((c) => c.module)).toContain('expo-router');
      });

      it('test files never jest.mock, requireActual or import @react-navigation/*', () => {
        const hits = TEST_SOURCES.flatMap(({ rel, sf }) =>
          reactNavigationInTests(sf).map((line) => `${rel}:${line}`),
        );
        expect(hits).toEqual([]);
      });
    });
  });
});

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

// ─── The real tree ────────────────────────────────────────────────────────────

type Parsed = { rel: string; sf: ts.SourceFile };

const SOURCES: Parsed[] = SOURCE_DIRS.flatMap((d) => walk(path.join(ROOT, d), [])).map((abs) => ({
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
});

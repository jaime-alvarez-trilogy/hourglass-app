// Tests: 07-ci-typecheck-lint — static contracts for the CI gates.
//
// FR2: the out-of-repo NativeWindSmoke test is gone, and no test or mock
//      source reaches outside the repo (home directory, ~/.claude).
// FR3: typecheck foundation (script, @types/node, tsconfig types).
// FR7: ESLint guard against the Node-only global `Buffer` in app code.
// FR8: .github/workflows/test.yml `app-tests` gates on typecheck + lint + test.
//
// Static fs reads only — the same pattern as the source-analysis tests in
// app/(tabs)/__tests__/native-tabs.test.tsx. No new dependencies.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ─── FR2: no out-of-repo test dependency ─────────────────────────────────────

describe('07-ci-typecheck-lint — FR2: no out-of-repo test dependency', () => {
  const SCAN_DIRS = ['__tests__', 'src', 'app', 'components', 'hooks', '__mocks__'];

  // Built dynamically so this file's own source never matches the guard.
  const FORBIDDEN = [
    ['process', 'env', 'HOME'].join('.'),
    ['os', 'homedir('].join('.'),
    ['', '.claude', ''].join('/'),
  ];

  function walk(dir: string, out: string[]): string[] {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  function isTestOrMockSource(file: string): boolean {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    return (
      rel.startsWith('__tests__/') ||
      rel.startsWith('__mocks__/') ||
      rel.includes('/__tests__/') ||
      rel.includes('/__mocks__/') ||
      /\.test\.tsx?$/.test(rel)
    );
  }

  it('SC2.1 — NativeWindSmoke component and its test are deleted', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/components/NativeWindSmoke.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, '__tests__/components/NativeWindSmoke.test.tsx'))).toBe(false);
  });

  it('SC2.2 — no test or mock source references the home directory or ~/.claude', () => {
    const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d), [])).filter(isTestOrMockSource);
    // Non-vacuity: the scan must actually see the suite (this file included).
    expect(files.length).toBeGreaterThan(100);
    expect(files.map((f) => path.relative(ROOT, f))).toContain(path.join('__tests__', 'ci-gates.test.ts'));

    const offenders: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (source.includes(pattern)) offenders.push(`${path.relative(ROOT, file)}: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ─── FR3: typecheck foundation ───────────────────────────────────────────────

describe('07-ci-typecheck-lint — FR3: typecheck foundation', () => {
  const pkg = JSON.parse(read('package.json')) as {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const tsconfig = JSON.parse(read('tsconfig.json')) as {
    compilerOptions?: { types?: string[] };
  };

  it('SC3.1 — package.json scripts.typecheck is "tsc --noEmit"', () => {
    expect(pkg.scripts?.typecheck).toBe('tsc --noEmit');
  });

  it('SC3.2 — package.json scripts.lint stays "expo lint"', () => {
    expect(pkg.scripts?.lint).toBe('expo lint');
  });

  it('SC3.3 — @types/node is a direct devDependency', () => {
    expect(pkg.devDependencies?.['@types/node']).toBeDefined();
  });

  it('SC3.4 — tsconfig compilerOptions.types includes both jest and node', () => {
    expect(tsconfig.compilerOptions?.types).toEqual(expect.arrayContaining(['jest', 'node']));
  });
});

// ─── FR7: Hermes Buffer lint guard ───────────────────────────────────────────

describe('07-ci-typecheck-lint — FR7: Buffer lint guard', () => {
  it('SC7.1 — eslint.config.js restricts the Buffer global via no-restricted-globals', () => {
    const source = read('eslint.config.js');
    expect(source).toContain('no-restricted-globals');
    expect(source).toMatch(
      /['"]no-restricted-globals['"]\s*:\s*\[\s*['"]error['"]\s*,[\s\S]*?name\s*:\s*['"]Buffer['"]/
    );
  });
});

// ─── FR8: CI gates in app-tests ──────────────────────────────────────────────

describe('07-ci-typecheck-lint — FR8: app-tests CI gates', () => {
  const workflow = read('.github/workflows/test.yml');

  // Returns the text of a top-level job under `jobs:` (2-space indent), up to
  // the next job key or end of file. null if the job is absent.
  function jobBlock(name: string): string | null {
    const lines = workflow.split('\n');
    const start = lines.findIndex((l) => l === `  ${name}:`);
    if (start === -1) return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i]) || /^\S/.test(lines[i])) {
        end = i;
        break;
      }
    }
    return lines.slice(start, end).join('\n');
  }

  // Splits a job block into its `steps:` list items (6-space `- ` markers).
  function steps(block: string): string[] {
    const out: string[] = [];
    let current: string[] | null = null;
    for (const line of block.split('\n')) {
      if (/^ {6}- /.test(line)) {
        if (current) out.push(current.join('\n'));
        current = [line];
      } else if (current && /^ {7,}\S/.test(line)) {
        current.push(line);
      } else if (current && /^ {0,5}\S/.test(line)) {
        out.push(current.join('\n'));
        current = null;
      }
    }
    if (current) out.push(current.join('\n'));
    return out;
  }

  const stepRunning = (block: string, cmd: string): string | undefined =>
    steps(block).find((s) => new RegExp(`run:\\s*${cmd.replace(/ /g, '\\s+')}\\s*$`, 'm').test(s));

  it('SC8.1 — the app-tests job exists (required status check name unchanged)', () => {
    expect(jobBlock('app-tests')).not.toBeNull();
  });

  it('SC8.2 — app-tests runs npm ci → npm run typecheck → npm run lint → npm test, in order', () => {
    const block = jobBlock('app-tests') ?? '';
    const ci = block.indexOf('npm ci');
    const typecheck = block.indexOf('npm run typecheck');
    const lint = block.indexOf('npm run lint');
    const test = block.indexOf('npm test');
    expect(ci).toBeGreaterThan(-1);
    expect(typecheck).toBeGreaterThan(ci);
    expect(lint).toBeGreaterThan(typecheck);
    expect(test).toBeGreaterThan(lint);
  });

  it('SC8.3 — install step has id: install; Lint and Test still run if an earlier gate failed', () => {
    const block = jobBlock('app-tests') ?? '';
    const install = stepRunning(block, 'npm ci');
    const typecheck = stepRunning(block, 'npm run typecheck');
    const lint = stepRunning(block, 'npm run lint');
    const test = stepRunning(block, 'npm test');
    expect(install).toBeDefined();
    expect(typecheck).toBeDefined();
    expect(lint).toBeDefined();
    expect(test).toBeDefined();

    expect(install).toMatch(/\bid:\s*install\s*$/m);
    expect(typecheck).toMatch(/name:\s*Typecheck\s*$/m);
    expect(lint).toMatch(/name:\s*Lint\s*$/m);
    expect(test).toMatch(/name:\s*Test\s*$/m);

    const ifRunAfterInstall =
      /if:\s*\$\{\{\s*!cancelled\(\)\s*&&\s*steps\.install\.outcome\s*==\s*'success'\s*\}\}/;
    expect(lint).toMatch(ifRunAfterInstall);
    expect(test).toMatch(ifRunAfterInstall);
  });

  it('SC8.4 — server-tests job is intact (still runs in server/)', () => {
    const block = jobBlock('server-tests');
    expect(block).not.toBeNull();
    expect(block).toContain('working-directory: server');
  });
});

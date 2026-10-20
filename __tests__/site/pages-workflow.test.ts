// 01-legal-pages FR5: .github/workflows/pages.yml deploys only site/ to GitHub Pages.
//
// Assertions run against the file text (no YAML dependency: `yaml` is only transitive).
// Action major versions are matched as @vN so the spec's starter-set fallback
// (configure-pages@v5 / upload-pages-artifact@v3 / deploy-pages@v5) still passes.

import * as fs from 'fs';
import * as path from 'path';

const WORKFLOW = path.resolve(__dirname, '../..', '.github/workflows/pages.yml');

function readWorkflow(): string {
  if (!fs.existsSync(WORKFLOW)) {
    throw new Error('.github/workflows/pages.yml does not exist');
  }
  return fs.readFileSync(WORKFLOW, 'utf8');
}

/** Lines of a top-level YAML key's block (the key line through the line before the next top-level key). */
function topLevelBlock(src: string, key: string): string {
  const lines = src.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (start < 0) throw new Error(`top-level "${key}:" not found`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^[^\s#]/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** The deploy job's steps, one string per `- ` list item. */
function steps(src: string): string[] {
  const lines = topLevelBlock(src, 'jobs').split('\n');
  const stepsAt = lines.findIndex((l) => /^\s+steps:\s*$/.test(l));
  if (stepsAt < 0) throw new Error('no steps: list');
  const body = lines.slice(stepsAt + 1);
  const itemIndent = body.find((l) => /^\s*-\s/.test(l))?.search(/\S/) ?? -1;
  const out: string[] = [];
  for (const line of body) {
    if (line.trim() === '') continue;
    const indent = line.search(/\S/);
    if (indent < itemIndent) break;
    if (indent === itemIndent && /^\s*-\s/.test(line)) out.push(line);
    else if (out.length) out[out.length - 1] += `\n${line}`;
  }
  return out;
}

describe('FR5: GitHub Pages deploy workflow (.github/workflows/pages.yml)', () => {
  it('FR5: triggers on push to main for site/** and the workflow file, plus workflow_dispatch', () => {
    const on = topLevelBlock(readWorkflow(), 'on');
    expect(on).toMatch(/^\s+push:\s*$/m);
    expect(on).toMatch(/^\s+branches:\s*\[\s*main\s*\]\s*$/m);
    expect(on).toMatch(/^\s+paths:\s*$/m);
    expect(on).toMatch(/^\s+-\s*['"]?site\/\*\*['"]?\s*$/m);
    expect(on).toMatch(/^\s+-\s*['"]?\.github\/workflows\/pages\.yml['"]?\s*$/m);
    expect(on).toMatch(/^\s+workflow_dispatch:\s*$/m);
  });

  it('FR5: has no pull_request / pull_request_target trigger (PRs and forks cannot deploy)', () => {
    expect(readWorkflow()).not.toContain('pull_request');
  });

  it('FR5: top-level permissions are contents: read, pages: write, id-token: write', () => {
    const permissions = topLevelBlock(readWorkflow(), 'permissions');
    expect(permissions).toMatch(/^\s+contents:\s*read\s*$/m);
    expect(permissions).toMatch(/^\s+pages:\s*write\s*$/m);
    expect(permissions).toMatch(/^\s+id-token:\s*write\s*$/m);
    expect(permissions).not.toMatch(/contents:\s*write/);
  });

  it('FR5: concurrency group "pages" never cancels an in-progress deploy', () => {
    const concurrency = topLevelBlock(readWorkflow(), 'concurrency');
    expect(concurrency).toMatch(/^\s+group:\s*pages\s*$/m);
    expect(concurrency).toMatch(/^\s+cancel-in-progress:\s*false\s*$/m);
  });

  it('FR5: a single deploy job on ubuntu-latest targets the github-pages environment', () => {
    const jobs = topLevelBlock(readWorkflow(), 'jobs');
    const jobNames = Array.from(jobs.matchAll(/^ {2}([\w-]+):\s*$/gm), (m) => m[1]);
    expect(jobNames).toEqual(['deploy']);
    expect(jobs).toMatch(/^\s+runs-on:\s*ubuntu-latest\s*$/m);
    expect(jobs).toMatch(/^\s+environment:\s*$/m);
    expect(jobs).toMatch(/^\s+name:\s*github-pages\s*$/m);
    expect(jobs).toContain('url: ${{ steps.deployment.outputs.page_url }}');
  });

  it('FR5: steps are checkout → configure-pages → upload-pages-artifact → deploy-pages', () => {
    const src = readWorkflow();
    const order = [
      /uses:\s*actions\/checkout@v\d+/,
      /uses:\s*actions\/configure-pages@v\d+/,
      /uses:\s*actions\/upload-pages-artifact@v\d+/,
      /uses:\s*actions\/deploy-pages@v\d+/,
    ].map((re) => src.search(re));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    const uses = steps(src).map((s) => s.match(/uses:\s*actions\/([\w-]+)@v\d+/)?.[1]);
    expect(uses).toEqual(['checkout', 'configure-pages', 'upload-pages-artifact', 'deploy-pages']);
  });

  it('FR5: uploads only site/ as the Pages artifact (never the repo root)', () => {
    const src = readWorkflow();
    expect(src).toMatch(/^\s*path:\s*['"]?site['"]?\s*$/m);
    expect(src).not.toMatch(/^\s*path:\s*['"]?\.\/?['"]?\s*$/m);
    const upload = steps(src).find((s) => s.includes('actions/upload-pages-artifact@'));
    expect(upload).toBeDefined();
    expect(upload).toMatch(/^\s*path:\s*['"]?site['"]?\s*$/m);
  });

  it('FR5: deploy-pages step has id: deployment and configure-pages does not try to enable Pages', () => {
    const src = readWorkflow();
    const deploy = steps(src).find((s) => s.includes('actions/deploy-pages@'));
    expect(deploy).toBeDefined();
    expect(deploy).toMatch(/\bid:\s*deployment\s*$/m);
    expect(src).not.toContain('enablement');
  });
});

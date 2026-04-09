#!/usr/bin/env npx tsx
/**
 * Hourglass UX Gauntlet
 *
 * 4-round multi-model UI generation pipeline:
 *   Round 1 — Parallel generation (active models from roster)
 *   Round 2 — Blind cross-critique (same models, fresh context, shuffled labels)
 *   Round 3 — Synthesis (Gemini 3.1 Pro, vision)
 *   Round 4 — Automated spec validation
 *
 * Full model roster (edit GENERATOR_MODELS to change active set):
 *   Gemini 3.1 Pro, Gemini 3 Pro, GPT-5.4, GPT-5.4 Pro,
 *   GPT-5.3 Codex, Kimi K2.5, GLM 4.7, GLM 4.6V
 *
 * Usage:
 *   npx tsx tools/ux-gauntlet.ts --screen "description" --out path/to/Component.tsx [--image path]...
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..');
const API_KEY = process.env.OPENROUTER_API_KEY;
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Round 1 + Round 2 models — all support vision
// Full roster — edit ACTIVE_MODELS to control which ones run per session
const ALL_MODELS = [
  // Google
  { id: 'google/gemini-3.1-pro-preview',        name: 'Gemini 3.1 Pro',  vision: true  },
  { id: 'google/gemini-3-pro-preview',           name: 'Gemini 3 Pro',    vision: true  },
  { id: 'google/gemini-2.5-pro-preview-03-25',   name: 'Gemini 2.5 Pro',  vision: true  },
  // OpenAI
  { id: 'openai/gpt-5.4',               name: 'GPT-5.4',         vision: true  },
  { id: 'openai/gpt-5.4-pro',           name: 'GPT-5.4 Pro',     vision: true  },
  { id: 'openai/gpt-5.3-codex',         name: 'GPT-5.3 Codex',   vision: false }, // coding-focused, no confirmed vision
  // Anthropic
  { id: 'anthropic/claude-opus-4-6',    name: 'Claude Opus 4.6', vision: true  },
  // Moonshot
  { id: 'moonshot/kimi-k2.5',           name: 'Kimi K2.5',       vision: true  },
  // Z.ai / GLM
  { id: 'z-ai/glm-4.7',                 name: 'GLM 4.7',         vision: true  },
  { id: 'z-ai/glm-4.6v',               name: 'GLM 4.6V',        vision: true  },
];

// Default active set — vision-capable models only, balanced across providers
// Change this to run a different subset without editing the full roster
const GENERATOR_MODELS = ALL_MODELS.filter(m =>
  [
    'google/gemini-3.1-pro-preview',       // best reasoning + vision
    'google/gemini-2.5-pro-preview-03-25', // better instruction-following than 3.x per community
    'openai/gpt-5.4-pro',                  // max OpenAI performance
    'openai/gpt-5.3-codex',                // better frontend taste than 5.4 per benchmarks
    'anthropic/claude-opus-4-6',           // best constraint adherence, clean TypeScript
    'moonshot/kimi-k2.5',                  // best UI-from-image
    'z-ai/glm-4.6v',                       // dedicated UI reconstruction
  ].includes(m.id)
);

// Round 3 synthesis model — must have vision + strong reasoning
const SYNTHESIS_MODEL = { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro' };

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, GENERATOR_MODELS.length);

const DESIGN_SYSTEM_FILES = [
  { label: 'BRAND_GUIDELINES.md',    path: path.join(ROOT, 'BRAND_GUIDELINES.md') },
  { label: 'tailwind.config.js',     path: path.join(ROOT, 'tailwind.config.js') },
  { label: 'reanimated-presets.ts',  path: path.join(ROOT, 'src/lib/reanimated-presets.ts') },
];

const GAUNTLET_OUTPUT_DIR = path.join(ROOT, 'gauntlet-output');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedArgs {
  screen: string;
  imagePaths: string[];
  outPath: string;
  dry: boolean;
}

interface GeneratorResult {
  model: string;
  name: string;
  code: string;
  label: string;
  durationMs: number;
  error?: string;
}

interface CritiqueResult {
  model: string;
  name: string;
  critique: string;
  scores: Record<string, { code: number | null; ux: number | null }>;
}

interface ContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let screen = '';
  const imagePaths: string[] = [];
  let outPath = '';
  let dry = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--screen' && args[i + 1]) {
      screen = args[++i];
    } else if (arg === '--image' && args[i + 1]) {
      imagePaths.push(args[++i]);
    } else if (arg === '--out' && args[i + 1]) {
      outPath = args[++i];
    } else if (arg === '--dry') {
      dry = true;
    } else if (!arg.startsWith('--') && !screen) {
      // Positional first arg as screen description
      screen = arg;
    }
  }

  if (!screen) {
    console.error('Error: --screen <description> is required');
    process.exit(1);
  }
  if (!outPath) {
    console.error('Error: --out <path> is required');
    process.exit(1);
  }

  return { screen, imagePaths, outPath, dry };
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

function imageToBase64(imagePath: string): string {
  const absPath = path.isAbsolute(imagePath) ? imagePath : path.join(ROOT, imagePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Image not found: ${absPath}`);
  }
  const buffer = fs.readFileSync(absPath);
  return buffer.toString('base64');
}

function getMimeType(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
  };
  return mimeMap[ext] ?? 'image/png';
}

function buildImageContent(imagePaths: string[]): ContentBlock[] {
  return imagePaths.map((imgPath) => {
    const base64 = imageToBase64(imgPath);
    const mime = getMimeType(imgPath);
    return {
      type: 'image_url' as const,
      image_url: { url: `data:${mime};base64,${base64}` },
    };
  });
}

// ---------------------------------------------------------------------------
// Design system
// ---------------------------------------------------------------------------

function readDesignSystem(): string {
  const parts: string[] = [];
  for (const file of DESIGN_SYSTEM_FILES) {
    if (fs.existsSync(file.path)) {
      const content = fs.readFileSync(file.path, 'utf-8');
      parts.push(`=== ${file.label} ===\n${content}`);
    } else {
      parts.push(`=== ${file.label} ===\n(file not found — skip)`);
    }
  }
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// OpenRouter API call
// ---------------------------------------------------------------------------

async function callModel(
  modelId: string,
  systemPrompt: string,
  userContent: ContentBlock[] | string,
  temperature = 0.7,
): Promise<string> {
  if (!API_KEY) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set');
  }

  const userMessage =
    typeof userContent === 'string'
      ? [{ type: 'text' as const, text: userContent }]
      : userContent;

  const body = {
    model: modelId,
    temperature,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content: userMessage },
    ],
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/hourglass-app',
      'X-Title': 'Hourglass UX Gauntlet',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message: string };
  };

  if (data.error) {
    throw new Error(`Model error: ${data.error.message}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from model');
  }

  return content;
}

// ---------------------------------------------------------------------------
// Code extraction and validation
// ---------------------------------------------------------------------------

function extractCode(response: string): string {
  // Try tsx/ts/jsx/js code block first
  const fenced = response.match(/```(?:tsx?|jsx?|typescript|javascript)?\n([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  // Try any code block
  const anyBlock = response.match(/```\n([\s\S]*?)```/);
  if (anyBlock) return anyBlock[1].trim();

  // If no code block found, return the whole response
  return response.trim();
}

interface ValidationResult {
  passed: boolean;
  warnings: string[];
  errors: string[];
}

function validate(code: string): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Required imports
  if (!code.includes('react-native') && !code.includes('from \'react\'')) {
    warnings.push('No React Native import detected');
  }

  // Check for StyleSheet usage (NativeWind should replace it but some uses are acceptable)
  if (code.includes('StyleSheet.create')) {
    warnings.push('Uses StyleSheet.create — prefer NativeWind className props');
  }

  // Check for inline styles that should be NativeWind
  const inlineStyleCount = (code.match(/style=\{\{/g) ?? []).length;
  if (inlineStyleCount > 3) {
    warnings.push(`${inlineStyleCount} inline style objects — consider converting to NativeWind classes`);
  }

  // Check for hardcoded colour hex values not from the design system
  const hexColors = code.match(/#[0-9A-Fa-f]{3,8}/g) ?? [];
  const knownColors = new Set([
    '#0A0A0F', '#13131A', '#1C1C28', '#2A2A3D',
    '#E8C97A', '#00D4FF', '#A78BFA', '#10B981',
    '#F59E0B', '#F43F5E', '#F85149',
    '#FFFFFF', '#8B949E', '#484F58',
    '#000', '#000000', '#fff', '#ffffff',
  ]);
  const unknownColors = hexColors.filter((c) => !knownColors.has(c.toUpperCase()) && !knownColors.has(c));
  if (unknownColors.length > 0) {
    warnings.push(`Unknown hex colours (not in design system): ${[...new Set(unknownColors)].join(', ')}`);
  }

  // Check for rounded-md or smaller
  if (/rounded-(?:sm|md)\b/.test(code)) {
    warnings.push('Uses rounded-sm or rounded-md — design system minimum is rounded-lg (8px)');
  }

  // Check export
  if (!code.includes('export default') && !code.includes('export const') && !code.includes('export function')) {
    errors.push('No export found — component must export a default or named export');
  }

  // Check for tabular-nums on metric displays (best-effort)
  if (/\$[\d,.]|hours|%|AI/i.test(code) && !code.includes('tabular-nums')) {
    warnings.push('Numeric display detected — consider adding fontVariant: [\'tabular-nums\'] for stable widths');
  }

  return {
    passed: errors.length === 0,
    warnings,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Score parsing
// ---------------------------------------------------------------------------

function parseScores(
  critique: string,
  labels: string[],
): Record<string, { code: number | null; ux: number | null }> {
  const scores: Record<string, { code: number | null; ux: number | null }> = {};

  for (const label of labels) {
    // Try to find "Option A" or "A:" sections
    const sectionPattern = new RegExp(
      `Option\\s+${label}[^]*?(?=Option\\s+[A-E]|$)`,
      'i',
    );
    const section = critique.match(sectionPattern)?.[0] ?? '';

    // Extract CODE score: "CODE score (1-10)" or "CODE: 8" or "Code: 8/10"
    const codeMatch =
      section.match(/CODE\s*(?:score)?[:\s]+(\d+)\s*(?:\/\s*10)?/i) ??
      critique.match(new RegExp(`Option\\s+${label}[^]*?CODE[:\\s]+(\\d+)`, 'i'));

    // Extract UX score
    const uxMatch =
      section.match(/UX\s*(?:score)?[:\s]+(\d+)\s*(?:\/\s*10)?/i) ??
      critique.match(new RegExp(`Option\\s+${label}[^]*?UX[:\\s]+(\\d+)`, 'i'));

    const codeVal = codeMatch ? parseInt(codeMatch[1], 10) : null;
    const uxVal = uxMatch ? parseInt(uxMatch[1], 10) : null;

    scores[label] = {
      code: codeVal !== null && !isNaN(codeVal) ? codeVal : null,
      ux: uxVal !== null && !isNaN(uxVal) ? uxVal : null,
    };
  }

  return scores;
}

// ---------------------------------------------------------------------------
// Shuffle helper (Fisher-Yates)
// ---------------------------------------------------------------------------

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function buildGenerationSystemPrompt(designSystem: string): string {
  return `You are a senior React Native engineer and product designer specialising in premium mobile dashboards.
You are building components for Hourglass — a work dashboard app for Crossover contractors.

DESIGN SYSTEM:
${designSystem}

TECHNICAL REQUIREMENTS:
- React Native with NativeWind v4 (Tailwind classes via className prop)
- Expo SDK 55 / Expo Router
- React Native Reanimated v4 for animations (use useSharedValue, useAnimatedStyle, withSpring, withTiming)
- TypeScript strict mode — all props must be typed with interfaces
- expo-haptics for touch feedback on interactive elements
- No StyleSheet.create — use className exclusively for styling
- Use only design system colours (see tailwind.config.js). Never hardcode arbitrary hex values.
- All numeric metric displays must include fontVariant: ['tabular-nums']
- Minimum border radius is rounded-lg (8px) — never use rounded-sm or rounded-md

ANIMATION RULES (from design system):
- Springs for structural transitions (cards appearing, panels opening)
- Timing curves for data fills (progress bars, charts)
- springSnappy: { damping: 20, stiffness: 300 } — navigation, small UI
- springBouncy: { damping: 12, stiffness: 200 } — cards appearing
- springPremium: { damping: 18, stiffness: 120 } — hero panels, modals
- Button press: scale 0.96 with withTiming(96, { duration: 80 }) on press, restore on release
- All animations must check useReducedMotion() and skip to end state if true

OUTPUT RULES:
- Output a single complete .tsx file ready to drop into the project
- Include all necessary imports at the top
- Export a default component
- Include sample/prop types with sensible defaults for visual preview
- Do NOT include placeholder comments like "// add your logic here"
- Do NOT truncate or abbreviate — output the complete file

ANTI-PATTERNS TO AVOID:
- No StyleSheet.create
- No inline style={{ }} except for dynamic values that cannot be expressed as Tailwind classes
- No hardcoded colours outside the design system palette
- No rounded-md or rounded-sm
- No spring animations on progress bar fills
- No missing useReducedMotion fallback on entrance animations
- No more than 3 typefaces in a single view (font-display, font-sans, font-body)
- Gold (#E8C97A) is for money/earnings ONLY`;
}

function buildCritiqueSystemPrompt(): string {
  return `You are a senior React Native UX engineer and product designer with 10 years of experience building premium mobile apps.

You will review 5 different implementations of the same React Native component.
Your job is to critique each one on two dimensions:

1. CODE QUALITY — architecture, correctness, NativeWind v4 usage, Reanimated v4 animations, TypeScript quality, performance
2. UX/DESIGN — visual hierarchy, spacing, typography usage, animation feel, how well it serves the actual user need, adherence to a premium dark glass aesthetic (Oura/Revolut quality)

For each option (A through E), provide:
- CODE score (1-10) with 3 specific bullet points explaining the score
- UX score (1-10) with 3 specific bullet points explaining the score
- Top 2 things this implementation does BETTER than the others
- Top 2 things this implementation does WORSE than the others
- One specific actionable improvement

Be ruthless. Be specific. Do not be diplomatic. The goal is to find the absolute best result.`;
}

function buildSynthesisSystemPrompt(designSystem: string): string {
  return `You are the lead React Native engineer on Hourglass, a premium work dashboard app.

${buildGenerationSystemPrompt(designSystem)}

You have received 5 implementations of the same component AND 5 independent expert critiques.
Your job is to synthesise ALL of this into ONE definitive final implementation.

SYNTHESIS RULES:
- Read every critique carefully — identify patterns where multiple critics agree
- Take the strongest elements from each implementation
- Fix every issue raised by 2 or more critics
- The output must strictly follow the design system above
- Output a single complete production-ready TSX file with all imports
- This is the FINAL version — it must be excellent, not a compromise
- Where critics disagree, use your own expert judgment about what best serves the user`;
}

// ---------------------------------------------------------------------------
// Round 1: Parallel generation
// ---------------------------------------------------------------------------

async function runRound1(
  args: ParsedArgs,
  designSystem: string,
  labelAssignment: Array<{ model: typeof GENERATOR_MODELS[0]; label: string }>,
): Promise<GeneratorResult[]> {
  console.log('\n⚡ Round 1: Generating with 5 models in parallel...');

  const systemPrompt = buildGenerationSystemPrompt(designSystem);

  const userContent: ContentBlock[] = [
    { type: 'text', text: `Create a React Native component for: ${args.screen}\n\nOutput a single complete production-ready TSX file.` },
    ...buildImageContent(args.imagePaths),
  ];

  const results = await Promise.all(
    labelAssignment.map(async ({ model, label }): Promise<GeneratorResult> => {
      const start = Date.now();
      try {
        const response = await callModel(model.id, systemPrompt, userContent, 0.8);
        const code = extractCode(response);
        const durationMs = Date.now() - start;
        console.log(`  ✓ ${model.name.padEnd(16)} (${(durationMs / 1000).toFixed(1)}s)`);
        return { model: model.id, name: model.name, code, label, durationMs };
      } catch (err) {
        const durationMs = Date.now() - start;
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.warn(`  ✗ ${model.name.padEnd(16)} FAILED: ${errorMsg}`);
        return { model: model.id, name: model.name, code: '', label, durationMs, error: errorMsg };
      }
    }),
  );

  const successful = results.filter((r) => !r.error && r.code.length > 0);
  if (successful.length < 3) {
    throw new Error(
      `Round 1 failed: only ${successful.length} models succeeded (minimum 3 required). ` +
      `Check OPENROUTER_API_KEY and model availability.`,
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Round 2: Cross-critique
// ---------------------------------------------------------------------------

async function runRound2(
  args: ParsedArgs,
  round1Results: GeneratorResult[],
): Promise<CritiqueResult[]> {
  console.log('\n🔍 Round 2: Cross-critique in parallel (blind, fresh context)...');

  const successfulResults = round1Results.filter((r) => !r.error && r.code.length > 0);
  const labels = successfulResults.map((r) => r.label);

  // Build the combined implementations text
  const implementationsText = successfulResults
    .map(
      (r) =>
        `[Option ${r.label}]\n\`\`\`tsx\n${r.code}\n\`\`\``,
    )
    .join('\n\n');

  const userText =
    `Here are ${successfulResults.length} implementations of: ${args.screen}\n\n` +
    implementationsText +
    '\n\nReview all options according to your instructions.';

  const systemPrompt = buildCritiqueSystemPrompt();

  const critiqueResults = await Promise.all(
    GENERATOR_MODELS.map(async (model): Promise<CritiqueResult> => {
      try {
        const critique = await callModel(model.id, systemPrompt, userText, 0.3);
        const scores = parseScores(critique, labels);
        return { model: model.id, name: model.name, critique, scores };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.warn(`  ✗ Critique from ${model.name} FAILED: ${errorMsg}`);
        return {
          model: model.id,
          name: model.name,
          critique: `(critique failed: ${errorMsg})`,
          scores: Object.fromEntries(labels.map((l) => [l, { code: null, ux: null }])),
        };
      }
    }),
  );

  console.log(`  ✓ All ${critiqueResults.length} critiques received`);
  return critiqueResults;
}

// ---------------------------------------------------------------------------
// Score aggregation
// ---------------------------------------------------------------------------

function aggregateScores(
  critiqueResults: CritiqueResult[],
  labels: string[],
): Record<string, { code: number | null; ux: number | null; total: number | null }> {
  const aggregate: Record<string, { code: number | null; ux: number | null; total: number | null }> = {};

  for (const label of labels) {
    const codeScores: number[] = [];
    const uxScores: number[] = [];

    for (const critique of critiqueResults) {
      const s = critique.scores[label];
      if (s?.code !== null && s?.code !== undefined) codeScores.push(s.code);
      if (s?.ux !== null && s?.ux !== undefined) uxScores.push(s.ux);
    }

    const avgCode = codeScores.length > 0
      ? Math.round((codeScores.reduce((a, b) => a + b, 0) / codeScores.length) * 10) / 10
      : null;
    const avgUx = uxScores.length > 0
      ? Math.round((uxScores.reduce((a, b) => a + b, 0) / uxScores.length) * 10) / 10
      : null;
    const total = avgCode !== null && avgUx !== null ? Math.round((avgCode + avgUx) * 10) / 10 : null;

    aggregate[label] = { code: avgCode, ux: avgUx, total };
  }

  return aggregate;
}

function findBestLabel(
  aggregated: Record<string, { code: number | null; ux: number | null; total: number | null }>,
): string {
  let bestLabel = '';
  let bestTotal = -1;

  for (const [label, scores] of Object.entries(aggregated)) {
    const total = scores.total ?? (scores.code ?? 0) + (scores.ux ?? 0);
    if (total > bestTotal) {
      bestTotal = total;
      bestLabel = label;
    }
  }

  return bestLabel;
}

// ---------------------------------------------------------------------------
// Round 3: Synthesis
// ---------------------------------------------------------------------------

async function runRound3(
  args: ParsedArgs,
  round1Results: GeneratorResult[],
  critiqueResults: CritiqueResult[],
  designSystem: string,
): Promise<string> {
  console.log('\n🔀 Round 3: Synthesis with Gemini 3.1 Pro...');

  const successfulResults = round1Results.filter((r) => !r.error && r.code.length > 0);

  const implementationsText = successfulResults
    .map((r) => `[Option ${r.label}]\n\`\`\`tsx\n${r.code}\n\`\`\``)
    .join('\n\n');

  const critiquesText = critiqueResults
    .map((c, i) => `[Critique from Reviewer ${i + 1}]\n${c.critique}`)
    .join('\n\n---\n\n');

  const userContent: ContentBlock[] = [
    {
      type: 'text',
      text:
        `Screen: ${args.screen}\n\n` +
        `=== IMPLEMENTATIONS ===\n\n${implementationsText}\n\n` +
        `=== CRITIQUES ===\n\n${critiquesText}\n\n` +
        `Synthesise these into the single best implementation. ` +
        `Output a single complete production-ready TSX file.`,
    },
    ...buildImageContent(args.imagePaths),
  ];

  const systemPrompt = buildSynthesisSystemPrompt(designSystem);
  const response = await callModel(SYNTHESIS_MODEL.id, systemPrompt, userContent, 0.5);
  const code = extractCode(response);
  console.log(`  ✓ Final component generated`);
  return code;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();

  const absOutPath = path.isAbsolute(args.outPath)
    ? args.outPath
    : path.join(ROOT, args.outPath);

  console.log(`\n🏆 Hourglass UX Gauntlet`);
  console.log(`   Screen : ${args.screen}`);
  console.log(`   Models : ${GENERATOR_MODELS.length} generators + 1 synthesizer`);
  console.log(`   Output : ${absOutPath}`);

  if (!API_KEY) {
    console.error('\nError: OPENROUTER_API_KEY environment variable is not set');
    process.exit(1);
  }

  // Read design system upfront
  const designSystem = readDesignSystem();

  // Assign labels randomly to decouple label from model identity
  const shuffledIndices = shuffleArray([...Array(GENERATOR_MODELS.length).keys()]);
  const labelAssignment = GENERATOR_MODELS.map((model, i) => ({
    model,
    label: LABELS[shuffledIndices[i]],
  }));

  if (args.dry) {
    console.log('\n[DRY RUN] Would call:');
    for (const { model, label } of labelAssignment) {
      console.log(`  Round 1 | Option ${label} | ${model.name} (${model.id})`);
    }
    console.log(`  Round 2 | Cross-critique | all 5 models`);
    console.log(`  Round 3 | Synthesis      | ${SYNTHESIS_MODEL.name}`);
    process.exit(0);
  }

  // Ensure output directory exists
  ensureDir(GAUNTLET_OUTPUT_DIR);

  // -------------------------------------------------------------------------
  // Round 1
  // -------------------------------------------------------------------------
  let round1Results: GeneratorResult[];
  try {
    round1Results = await runRound1(args, designSystem, labelAssignment);
  } catch (err) {
    console.error(`\nFatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Save Round 1 outputs
  for (const result of round1Results) {
    if (!result.error && result.code) {
      const safeName = result.name.replace(/\s+/g, '-').toLowerCase();
      const outFile = path.join(GAUNTLET_OUTPUT_DIR, `round1-${result.label}-${safeName}.tsx`);
      writeFile(outFile, result.code);
    }
  }

  // -------------------------------------------------------------------------
  // Round 2
  // -------------------------------------------------------------------------
  const critiqueResults = await runRound2(args, round1Results);

  // Save Round 2 critiques
  for (const critique of critiqueResults) {
    const safeName = critique.name.replace(/\s+/g, '-').toLowerCase();
    const outFile = path.join(GAUNTLET_OUTPUT_DIR, `round2-critique-${safeName}.md`);
    writeFile(outFile, critique.critique);
  }

  // Aggregate and print scores
  const successfulLabels = round1Results
    .filter((r) => !r.error && r.code.length > 0)
    .map((r) => r.label);

  const aggregatedScores = aggregateScores(critiqueResults, successfulLabels);

  console.log('\n📊 Scores (averaged across all critics):');
  for (const result of round1Results) {
    if (result.error) continue;
    const s = aggregatedScores[result.label];
    const codeStr = s.code !== null ? `${s.code}/10` : '?/10';
    const uxStr = s.ux !== null ? `${s.ux}/10` : '?/10';
    console.log(
      `  Option ${result.label} (${result.name.padEnd(14)}): CODE ${codeStr.padEnd(7)} UX ${uxStr}`,
    );
  }

  // -------------------------------------------------------------------------
  // Round 3: Synthesis
  // -------------------------------------------------------------------------
  let finalCode: string;
  let usedFallback = false;

  try {
    finalCode = await runRound3(args, round1Results, critiqueResults, designSystem);
  } catch (err) {
    console.warn(
      `\n⚠ Round 3 synthesis failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    console.warn('  Falling back to highest-scored Round 1 output...');

    const bestLabel = findBestLabel(aggregatedScores);
    const bestResult = round1Results.find((r) => r.label === bestLabel && !r.error);
    if (!bestResult) {
      // Last resort: first successful result
      const first = round1Results.find((r) => !r.error && r.code);
      if (!first) {
        console.error('Fatal: no usable output from any round');
        process.exit(1);
      }
      finalCode = first.code;
    } else {
      finalCode = bestResult.code;
    }
    usedFallback = true;
  }

  // Save Round 3 synthesis
  const synthesisFile = path.join(GAUNTLET_OUTPUT_DIR, 'round3-synthesis.tsx');
  writeFile(synthesisFile, finalCode);

  // -------------------------------------------------------------------------
  // Round 4: Validation
  // -------------------------------------------------------------------------
  console.log('\n✅ Round 4: Validation');
  const validation = validate(finalCode);

  if (validation.errors.length > 0) {
    console.warn('  Errors:');
    for (const e of validation.errors) console.warn(`    ✗ ${e}`);
  }
  if (validation.warnings.length > 0) {
    console.log('  Warnings:');
    for (const w of validation.warnings) console.log(`    ⚠ ${w}`);
  }
  if (validation.passed && validation.warnings.length === 0) {
    console.log('  ✓ All checks passed');
  } else if (validation.passed) {
    console.log(`  ✓ Passed with ${validation.warnings.length} warning(s)`);
  } else {
    console.warn(`  ✗ Failed with ${validation.errors.length} error(s)`);
  }

  // -------------------------------------------------------------------------
  // Write final output
  // -------------------------------------------------------------------------
  writeFile(absOutPath, finalCode);

  console.log(`\n💾 Written to: ${absOutPath}`);
  if (usedFallback) {
    console.warn('   (Note: this is a Round 1 fallback — synthesis failed)');
  }
  console.log(`📁 Intermediates saved to: ${GAUNTLET_OUTPUT_DIR}`);

  // Preview
  const lines = finalCode.split('\n');
  const preview = lines.slice(0, 20).join('\n');
  console.log('\n--- Preview (first 20 lines) ---');
  console.log(preview);
  if (lines.length > 20) {
    console.log(`... (${lines.length - 20} more lines)`);
  }
  console.log('--------------------------------\n');
}

main().catch((err) => {
  console.error('\nUnhandled error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

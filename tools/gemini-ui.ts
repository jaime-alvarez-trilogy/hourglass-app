#!/usr/bin/env npx tsx
/**
 * gemini-ui.ts
 *
 * Generates React Native screens and components using Gemini 2.5 Pro via OpenRouter.
 * Automatically injects the full Hourglass design system (brand guidelines,
 * tailwind tokens, reanimated presets) into every prompt.
 *
 * Usage:
 *   npx tsx tools/gemini-ui.ts --screen "Hours dashboard hero card" --out src/components/HeroCard.tsx
 *   npx tsx tools/gemini-ui.ts --screen "Sign in screen" --image screenshot.png --out app/(auth)/credentials.tsx
 *   npx tsx tools/gemini-ui.ts --screen "Iterate on this" --image current.png --image reference.png --out src/components/Foo.tsx
 *
 * Options:
 *   --screen   <text>   Description of the screen/component to generate (required)
 *   --image    <path>   Image to include (screenshot, reference, mockup). Repeatable.
 *   --out      <path>   Output file path relative to project root (required)
 *   --dry              Print the prompt without calling the API
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..');
const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'google/gemini-2.5-pro-preview-03-25';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const DESIGN_SYSTEM_FILES = [
  { label: 'BRAND_GUIDELINES.md', path: path.join(ROOT, 'BRAND_GUIDELINES.md') },
  { label: 'tailwind.config.js', path: path.join(ROOT, 'tailwind.config.js') },
  { label: 'reanimated-presets.ts', path: path.join(ROOT, 'src/lib/reanimated-presets.ts') },
];

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const result: { screen?: string; images: string[]; out?: string; dry: boolean } = {
    images: [],
    dry: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--screen' && args[i + 1]) result.screen = args[++i];
    else if (args[i] === '--image' && args[i + 1]) result.images.push(args[++i]);
    else if (args[i] === '--out' && args[i + 1]) result.out = args[++i];
    else if (args[i] === '--dry') result.dry = true;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

function imageToBase64(imagePath: string): { data: string; mimeType: string } {
  const abs = path.isAbsolute(imagePath) ? imagePath : path.join(process.cwd(), imagePath);
  const data = fs.readFileSync(abs).toString('base64');
  const ext = path.extname(imagePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  return { data, mimeType: mimeMap[ext] ?? 'image/png' };
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  const files = DESIGN_SYSTEM_FILES.map(({ label, path: filePath }) => {
    const content = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf-8')
      : `(file not found: ${filePath})`;
    return `### ${label}\n\`\`\`\n${content}\n\`\`\``;
  }).join('\n\n');

  return `You are an expert React Native UI engineer specialising in Expo, NativeWind v4, and Reanimated v4.

You are building **Hourglass** — a premium work dashboard app for Crossover contractors.
The visual identity is dark glass, Oura + Revolut quality: airy, data-forward, animated.

The full design system is provided below. You MUST follow it exactly.

${files}

## Output Rules

1. Output ONLY valid React Native JSX/TSX — no HTML elements (div, span, h1, p, etc.)
2. Use ONLY: View, Text, ScrollView, Pressable, TouchableOpacity, FlatList, Image,
   SafeAreaView, KeyboardAvoidingView, and Animated.View from react-native-reanimated
3. All styling via NativeWind \`className\` props only — NEVER StyleSheet.create()
4. All color references must use tailwind token names from tailwind.config.js
   (e.g. \`bg-surface\`, \`text-gold\`, \`border-border\`) — NEVER hardcoded hex values
5. All animations must use Reanimated v4:
   - Simple entrances: Reanimated v4 CSS Animations syntax
   - Gesture/reactive/staggered: useSharedValue + useAnimatedStyle
   - Spring/timing values: ONLY from reanimated-presets.ts (no hardcoded numbers)
6. Metric cards must animate values counting up from 0 on mount
7. Chart bars/lines must animate in from 0 with staggered withDelay
8. List items stagger in with 50ms delay increments
9. Press feedback: withSpring scale 0.96 on press, 1.0 on release
10. Output a single complete TSX file — no placeholders, no "TODO" comments
11. Include all necessary imports at the top
12. Export the component as default

## Anti-patterns to NEVER produce
- Generic purple/blue gradients not in the brand palette
- White (#ffffff) backgrounds — always use bg-background or bg-surface
- Centered hero cards with shadow-xl as the primary layout
- The core React Native Animated API — always Reanimated v4
- Hardcoded animation durations or spring values
- StyleSheet.create() calls
- HTML elements`;
}

function buildUserMessage(screen: string, imagePaths: string[]): any[] {
  const content: any[] = [
    {
      type: 'text',
      text: `Generate the following React Native screen/component for Hourglass:\n\n${screen}\n\nOutput a single complete TSX file ready to drop into the project.`,
    },
  ];

  for (const imagePath of imagePaths) {
    try {
      const { data, mimeType } = imageToBase64(imagePath);
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${data}`,
        },
      });
      console.log(`📎 Attached image: ${imagePath}`);
    } catch (err) {
      console.warn(`⚠️  Could not load image: ${imagePath} — ${(err as Error).message}`);
    }
  }

  return content;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ValidationResult {
  valid: boolean;
  issues: string[];
}

function validate(code: string): ValidationResult {
  const issues: string[] = [];

  const htmlTags = ['<div', '<span', '<h1', '<h2', '<h3', '<p ', '<p>', '<section', '<article'];
  for (const tag of htmlTags) {
    if (code.includes(tag)) issues.push(`Contains HTML element: ${tag}`);
  }

  const hardcodedHex = /#[0-9a-fA-F]{3,8}(?!['"a-fA-F0-9])/g;
  const hexMatches = code.match(hardcodedHex);
  if (hexMatches) {
    issues.push(`Hardcoded hex colors: ${[...new Set(hexMatches)].join(', ')}`);
  }

  if (code.includes('StyleSheet.create')) {
    issues.push('Uses StyleSheet.create() — must use NativeWind className only');
  }

  if (code.includes('Animated.') && code.includes("from 'react-native'")) {
    issues.push('Uses core React Native Animated API — must use Reanimated v4');
  }

  const hardcodedDurations = /duration:\s*\d+(?!\s*\/\/)/g;
  const durationMatches = code.match(hardcodedDurations);
  if (durationMatches) {
    issues.push(`Hardcoded animation durations: ${durationMatches.join(', ')}`);
  }

  return { valid: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

async function callGemini(systemPrompt: string, userContent: any[]): Promise<string> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/jalvarez0907/hourglass',
      'X-Title': 'Hourglass UI Generator',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${error}`);
  }

  const json = await response.json() as any;
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from API');
  return content;
}

// ---------------------------------------------------------------------------
// Output extraction
// ---------------------------------------------------------------------------

function extractCode(response: string): string {
  // Try to extract from a tsx/ts/jsx/js code block
  const codeBlock = response.match(/```(?:tsx?|jsx?)\n([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();

  // Try generic code block
  const genericBlock = response.match(/```\n([\s\S]*?)```/);
  if (genericBlock) return genericBlock[1].trim();

  // Return raw if no code block found
  return response.trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();

  if (!args.screen) {
    console.error('❌ --screen is required');
    console.error('   Usage: npx tsx tools/gemini-ui.ts --screen "description" --out path/to/Component.tsx');
    process.exit(1);
  }

  if (!args.out) {
    console.error('❌ --out is required');
    process.exit(1);
  }

  if (!API_KEY && !args.dry) {
    console.error('❌ OPENROUTER_API_KEY not found in environment');
    process.exit(1);
  }

  console.log(`\n🎨 Hourglass UI Generator`);
  console.log(`   Model  : ${MODEL}`);
  console.log(`   Screen : ${args.screen}`);
  console.log(`   Output : ${args.out}`);
  if (args.images.length) console.log(`   Images : ${args.images.length} attached`);
  console.log('');

  const systemPrompt = buildSystemPrompt();
  const userContent = buildUserMessage(args.screen, args.images);

  if (args.dry) {
    console.log('--- SYSTEM PROMPT (dry run) ---');
    console.log(systemPrompt.slice(0, 500) + '...');
    console.log('--- USER MESSAGE ---');
    console.log(typeof userContent[0] === 'object' ? userContent[0].text : userContent[0]);
    return;
  }

  console.log('⏳ Calling Gemini 2.5 Pro...');
  let raw: string;
  try {
    raw = await callGemini(systemPrompt, userContent);
  } catch (err) {
    console.error(`❌ API call failed: ${(err as Error).message}`);
    process.exit(1);
  }

  const code = extractCode(raw);

  console.log('🔍 Validating output...');
  const { valid, issues } = validate(code);

  if (!valid) {
    console.warn('⚠️  Validation issues found:');
    issues.forEach(issue => console.warn(`   • ${issue}`));
    console.warn('   Output saved anyway — review before using.\n');
  } else {
    console.log('✅ Validation passed\n');
  }

  // Write output
  const outPath = path.isAbsolute(args.out) ? args.out : path.join(ROOT, args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, code, 'utf-8');

  console.log(`💾 Written to: ${args.out}`);
  console.log(`\n--- Preview (first 20 lines) ---`);
  console.log(code.split('\n').slice(0, 20).join('\n'));
  console.log('...');
}

main().catch(err => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});

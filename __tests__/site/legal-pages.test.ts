// 01-legal-pages FR1–FR4: static legal site under site/
//
// The three pages are published verbatim to GitHub Pages (pages.yml) and their
// URLs are what App Store Connect / App Review open. These tests lock down:
//   FR1 — the corrected privacy policy (only the contract edits; everything else unchanged)
//   FR2 — the support page contract
//   FR3 — the landing page contract (no App Store / TestFlight link: Unlisted distribution)
//   FR4 — static-site constraints (no JS, no external resources, relative links only)
//
// Source-file assertions follow the fs/path pattern in __tests__/approval-card.test.tsx.

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SITE = path.join(ROOT, 'site');
const PAGES = ['index.html', 'privacy-policy.html', 'support.html'] as const;
type Page = (typeof PAGES)[number];

function readSite(name: Page): string {
  const file = path.join(SITE, name);
  if (!fs.existsSync(file)) {
    throw new Error(`site/${name} does not exist`);
  }
  return fs.readFileSync(file, 'utf8');
}

/** Collapse whitespace runs so verbatim comparisons ignore indentation/line wrapping only. */
function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Visible text of an HTML fragment (tags stripped, the few entities we use decoded). */
function textOf(html: string): string {
  return squash(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&mdash;/g, '—')
      .replace(/&amp;/g, '&')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"'),
  );
}

function innerAll(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  return Array.from(html.matchAll(re), (m) => m[1]);
}

function hrefs(html: string): string[] {
  const re = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  return Array.from(html.matchAll(re), (m) => m[1] ?? m[2] ?? m[3]);
}

/**
 * HTML between the end of the <h2> whose text starts with `headingPrefix` and the next
 * <h2> (or <footer>, for the last section).
 */
function section(html: string, headingPrefix: string): string {
  const start = html.indexOf(`<h2>${headingPrefix}`);
  if (start < 0) throw new Error(`<h2>${headingPrefix}…</h2> not found`);
  const bodyStart = html.indexOf('</h2>', start) + '</h2>'.length;
  const ends = [html.indexOf('<h2>', bodyStart), html.indexOf('<footer', bodyStart)].filter(
    (i) => i >= 0,
  );
  return html.slice(bodyStart, ends.length ? Math.min(...ends) : html.length);
}

/** <body> content between the <h1> and the <footer> — the page's own copy. */
function mainBody(html: string): string {
  const start = html.indexOf('<h1>');
  const end = html.indexOf('<footer');
  if (start < 0 || end < 0) throw new Error('page has no <h1> … <footer> body');
  return html.slice(start, end);
}

function styleBlock(html: string): string {
  const m = html.match(/<style>[\s\S]*?<\/style>/);
  if (!m) throw new Error('no <style> block');
  return m[0];
}

const MAILTO = 'jaime.alvarez@trilogy.com';

const FOOTER =
  '<footer> <p>Hourglass &mdash; Internal tool for Crossover employees &mdash; Not affiliated with or endorsed by Crossover for Work, Inc.</p> </footer>';

// ---------------------------------------------------------------------------
// Policy text contract (spec § Policy text contract)
// ---------------------------------------------------------------------------

const POLICY_H2 = [
  '1. About This App',
  '2. Information We Access',
  '3. How Your Data Is Stored',
  '4. Data We Do Not Collect',
  '5. Background Refresh',
  '6. Data Retention and Deletion',
  '7. Permissions',
  "8. Children's Privacy",
  '9. Changes to This Policy',
  '10. Contact',
];

const NEW_S4_BULLET_1 =
  'We do not operate user accounts, and we do not store your Crossover credentials or work data on any server';

const S4_BULLETS_2_TO_5 = [
  'We do not collect analytics, crash reports, or usage telemetry',
  'We do not use advertising SDKs or tracking libraries',
  'We do not sell, rent, or share any personal data with third parties',
  'We do not export your data to any external system',
];

const S5_ORIGINAL_P =
  'Hourglass uses a lightweight background ping mechanism to keep your home screen widget up to date. This service sends a silent push notification to your device to trigger a local data refresh. No personal data is transmitted as part of this process — the notification contains no payload other than a refresh signal.';

const S5_NEW_P =
  "If you allow notifications, the app registers an anonymous device push token with Expo's push notification service and with this refresh service; the token contains no personal data and is not linked to your identity or your Crossover account.";

const S6_PARAGRAPHS = [
  "Your credentials and cached work data are kept only on your device. Signing out deletes your saved credentials and the app's cached work data. Home screen widgets may continue to show the last data they received until you delete the app. If you delete the app without signing out, iOS may keep your saved credentials in the device Keychain, so sign out first to remove them.",
  "The refresh service stores only the anonymous push token and the time it was last registered. When you sign out, the app asks the refresh service to delete the token. Tokens that Expo's push service reports as no longer registered are deleted automatically.",
];

// Sections the spec requires to stay byte-identical (whitespace-insensitive here).
const UNCHANGED_SECTIONS: Record<string, string> = {
  '1. About This App': `
    <p>Hourglass is a mobile application built exclusively for employees of Crossover for Work. It provides a convenient view of your tracked hours, earnings, AI usage metrics, and team approval requests by connecting directly to your existing Crossover account.</p>
    <p>Access requires an active Crossover employee account. The app is not available to the general public and cannot be used without valid Crossover credentials.</p>`,
  '2. Information We Access': `
    <p>To display your work data, Hourglass connects to the Crossover API using credentials you provide. The following data is accessed:</p>
    <ul>
      <li>Your Crossover account credentials (email and password)</li>
      <li>Work diary entries, tracked hours, and timesheet data</li>
      <li>Earnings and payment summaries</li>
      <li>AI usage and BrainLift session tags</li>
      <li>Pending time approval requests (for managers)</li>
    </ul>
    <p>This data is fetched directly from Crossover's servers and displayed in the app. It is not sent to any third-party service.</p>`,
  '3. How Your Data Is Stored': `
    <p>Your credentials are stored exclusively on your device using the platform's secure storage (iOS Keychain via Expo SecureStore). They are never transmitted to any server operated by this application.</p>
    <p>Work data may be temporarily cached on your device to allow the app and home screen widgets to display information when offline. This cache is stored locally and is never uploaded or shared.</p>`,
  '7. Permissions': `
    <p>The app may request the following device permissions:</p>
    <ul>
      <li><strong>Notifications:</strong> To deliver reminders about approval deadlines and weekly summaries. You can disable these at any time in iOS Settings.</li>
      <li><strong>Background App Refresh:</strong> To keep widget data current.</li>
    </ul>`,
  "8. Children's Privacy": `
    <p>This app is intended for working adults who are Crossover employees. It is not directed at children under the age of 13 and we do not knowingly collect data from minors.</p>`,
  '9. Changes to This Policy': `
    <p>If this policy is updated, the revised version will be posted at this URL with an updated date. Continued use of the app after any changes constitutes acceptance of the updated policy.</p>`,
  '10. Contact': `
    <p>For questions about this privacy policy, reach out to:</p>
    <p>
      Jaime Alvarez<br />
      <a href="mailto:jaime.alvarez@trilogy.com">jaime.alvarez@trilogy.com</a>
    </p>`,
};

// sha256 of the policy's <style>…</style> block as of the April 8, 2026 version.
// The spec requires the policy's <style> block to stay byte-identical.
const POLICY_STYLE_SHA256 = '9271370262f1abd9896863c82349706382ef08c597a845d5283e25f4999e55b2';

const MONTHS =
  'January|February|March|April|May|June|July|August|September|October|November|December';

// ---------------------------------------------------------------------------
// Support + landing page contract (spec § Support and landing page contract)
// ---------------------------------------------------------------------------

const SUPPORT_H2 = ['About Hourglass', 'Frequently Asked Questions', 'Contact', 'Privacy'];

const SUPPORT_H3 = [
  'How do I sign in?',
  'Why is my widget empty or out of date?',
  'How do I sign out or remove my data?',
];

const SUPPORT_PARAGRAPHS = [
  'Help with Hourglass',
  'Hourglass shows your tracked hours, earnings, AI usage and team approval requests from your Crossover account, in the app and in home screen widgets. It is an internal tool for Crossover employees and requires an active Crossover account.',
  'Use the same email and password you use for Crossover. Your credentials are stored only on your device, in the iOS Keychain, and are sent only to Crossover.',
  'Widgets show data after you sign in and open the app at least once. After that, the widget updates when you open the app and in the background when iOS allows it.',
  "Tap the gear icon on the Home screen to open Settings, then tap Sign Out. This deletes your saved credentials and the app's cached data from your device. Sign out before deleting the app to make sure your saved credentials are removed.",
  'For help or to report a problem, email:',
  'Jaime Alvarez jaime.alvarez@trilogy.com',
  'Read the Privacy Policy to see what data Hourglass accesses and how it is stored.',
];

const INDEX_DESCRIPTION =
  'Hourglass shows your tracked hours, earnings, AI usage and approval requests from your Crossover account. It is an internal tool for Crossover employees.';

// ===========================================================================
// FR1: Corrected privacy policy
// ===========================================================================

describe('FR1: corrected privacy policy at site/privacy-policy.html', () => {
  it('FR1: policy lives only at site/privacy-policy.html (root copy moved, not duplicated)', () => {
    expect(fs.existsSync(path.join(ROOT, 'privacy-policy.html'))).toBe(false);
    expect(fs.existsSync(path.join(SITE, 'privacy-policy.html'))).toBe(true);
  });

  it('FR1: <h2> headings are the 10 renumbered sections, in order', () => {
    const html = readSite('privacy-policy.html');
    expect(innerAll(html, 'h2').map(textOf)).toEqual(POLICY_H2);
  });

  it('FR1: §4 bullet 1 no longer claims "no databases"; bullets 2–5 are unchanged', () => {
    const html = readSite('privacy-policy.html');
    expect(html).not.toContain('user accounts or databases');
    expect(html).toContain(NEW_S4_BULLET_1);
    const bullets = innerAll(section(html, '4. '), 'li').map(squash);
    expect(bullets).toEqual([NEW_S4_BULLET_1, ...S4_BULLETS_2_TO_5]);
  });

  it('FR1: §5 keeps its original paragraph and adds exactly one push-token sentence', () => {
    const html = readSite('privacy-policy.html');
    const paragraphs = innerAll(section(html, '5. '), 'p').map(squash);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toBe(S5_ORIGINAL_P);
    expect(paragraphs[1]).toBe(S5_NEW_P);
  });

  it('FR1: new §6 "Data Retention and Deletion" contains both contract paragraphs verbatim', () => {
    const html = readSite('privacy-policy.html');
    const paragraphs = innerAll(section(html, '6. '), 'p').map(squash);
    expect(paragraphs).toEqual(S6_PARAGRAPHS);
  });

  it('FR1: summary box, §3 sentence, §4 bullets 2–5, contact and footer are unchanged', () => {
    const html = readSite('privacy-policy.html');
    expect(html).toContain(
      '<p><strong>Summary:</strong> Hourglass is an internal tool for Crossover employees. Your credentials stay on your device. We do not collect, store, or share your personal data on any external server.</p>',
    );
    expect(html).toContain(
      'They are never transmitted to any server operated by this application.',
    );
    for (const bullet of S4_BULLETS_2_TO_5) {
      expect(html).toContain(`<li>${bullet}</li>`);
    }
    expect(html).toContain('Jaime Alvarez');
    expect(html).toContain(`mailto:${MAILTO}`);
    expect(squash(html.match(/<footer>[\s\S]*?<\/footer>/)?.[0] ?? '')).toBe(FOOTER);
  });

  it.each(Object.keys(UNCHANGED_SECTIONS))('FR1: section "%s" body is unchanged', (heading) => {
    const html = readSite('privacy-policy.html');
    expect(squash(section(html, heading))).toBe(squash(UNCHANGED_SECTIONS[heading]));
  });

  it('FR1: <style> block is byte-identical to the April 8, 2026 policy', () => {
    const html = readSite('privacy-policy.html');
    const digest = crypto.createHash('sha256').update(styleBlock(html)).digest('hex');
    expect(digest).toBe(POLICY_STYLE_SHA256);
  });

  it('FR1: subtitle carries a real "Last updated: Month D, YYYY" date newer than April 8, 2026', () => {
    const html = readSite('privacy-policy.html');
    const m = html.match(
      new RegExp(`<p class="subtitle">Last updated: ((?:${MONTHS}) (\\d{1,2}), (20\\d{2}))</p>`),
    );
    expect(m).not.toBeNull();
    const [, dateText, day] = m!;
    expect(dateText).not.toBe('April 8, 2026');
    const parsed = new Date(dateText);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    // Rejects impossible dates such as "February 31" that Date would roll over.
    expect(parsed.getDate()).toBe(Number(day));
    expect(parsed.getTime()).toBeGreaterThan(new Date('April 8, 2026').getTime());
  });

  it('FR1: <h1> is still "Privacy Policy"', () => {
    const html = readSite('privacy-policy.html');
    expect(innerAll(html, 'h1').map(textOf)).toEqual(['Privacy Policy']);
  });
});

// ===========================================================================
// FR2: Support page
// ===========================================================================

describe('FR2: support page at site/support.html', () => {
  it('FR2: contact mailto is the same single address as the privacy policy', () => {
    const support = readSite('support.html');
    const policy = readSite('privacy-policy.html');
    const mailtos = (html: string) =>
      Array.from(new Set(hrefs(html).filter((h) => h.startsWith('mailto:')))).map((h) =>
        h.slice('mailto:'.length),
      );
    expect(mailtos(support)).toEqual([MAILTO]);
    expect(mailtos(support)).toEqual(mailtos(policy));
    expect(support).toContain(`<a href="mailto:${MAILTO}">${MAILTO}</a>`);
  });

  it('FR2: links to the privacy policy relatively', () => {
    expect(readSite('support.html')).toContain('href="privacy-policy.html"');
  });

  it('FR2: title, <h1> and <h2> sections follow the contract order', () => {
    const html = readSite('support.html');
    expect(innerAll(html, 'title').map(textOf)).toEqual(['Support — Hourglass']);
    expect(innerAll(html, 'h1').map(textOf)).toEqual(['Support']);
    expect(innerAll(html, 'h2').map(textOf)).toEqual(SUPPORT_H2);
  });

  it('FR2: FAQ has exactly the three contract questions, in order, under "Frequently Asked Questions"', () => {
    const html = readSite('support.html');
    expect(innerAll(html, 'h3').map(textOf)).toEqual(SUPPORT_H3);
    expect(innerAll(section(html, 'Frequently Asked Questions'), 'h3').map(textOf)).toEqual(
      SUPPORT_H3,
    );
  });

  it('FR2: sign-out answer names gear icon → Settings → Sign Out and says to sign out before deleting', () => {
    const html = readSite('support.html');
    const afterQuestion = html.split('<h3>How do I sign out or remove my data?</h3>')[1];
    expect(afterQuestion).toBeDefined();
    const answer = textOf(innerAll(afterQuestion, 'p')[0] ?? '');
    for (const phrase of ['gear icon', 'Home screen', 'Settings', 'Sign Out', 'before deleting the app']) {
      expect(answer).toContain(phrase);
    }
  });

  it('FR2: body copy matches the support contract verbatim (every claim traces to code)', () => {
    const html = readSite('support.html');
    expect(innerAll(mainBody(html), 'p').map(textOf)).toEqual(SUPPORT_PARAGRAPHS);
  });

  it('FR2: has no form, input or script', () => {
    const html = readSite('support.html');
    expect(html).not.toMatch(/<form/i);
    expect(html).not.toMatch(/<input/i);
    expect(html).not.toMatch(/<script/i);
  });
});

// ===========================================================================
// FR3: Landing page
// ===========================================================================

describe('FR3: landing page at site/index.html', () => {
  it('FR3: links to both legal pages relatively, with their names', () => {
    const html = readSite('index.html');
    expect(html).toContain('href="privacy-policy.html"');
    expect(html).toContain('href="support.html"');
    expect(squash(html)).toContain(
      '<ul> <li><a href="privacy-policy.html">Privacy Policy</a></li> <li><a href="support.html">Support</a></li> </ul>',
    );
  });

  it('FR3: has no App Store, TestFlight or itms link (Unlisted distribution)', () => {
    const html = readSite('index.html');
    expect(html).not.toMatch(/apps\.apple\.com/i);
    expect(html).not.toMatch(/testflight/i);
    expect(html).not.toMatch(/itms/i);
  });

  it('FR3: title, <h1> and the single description paragraph follow the contract', () => {
    const html = readSite('index.html');
    expect(innerAll(html, 'title').map(textOf)).toEqual(['Hourglass']);
    expect(innerAll(html, 'h1').map(textOf)).toEqual(['Hourglass']);
    expect(innerAll(mainBody(html), 'p').map(textOf)).toEqual([INDEX_DESCRIPTION]);
  });
});

// ===========================================================================
// FR4: Static-site constraints (all three pages)
// ===========================================================================

describe.each(PAGES)('FR4: static-site constraints — site/%s', (page) => {
  it('FR4: has the standard document shell (doctype, lang, charset, viewport, title)', () => {
    const html = readSite(page);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta charset="UTF-8" />');
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    );
    const titles = innerAll(html, 'title').map(textOf);
    expect(titles).toHaveLength(1);
    expect(titles[0].length).toBeGreaterThan(0);
  });

  it('FR4: styling is one inline <style> block; no script, link, iframe, img or src=', () => {
    const html = readSite(page);
    expect(html.match(/<style\b/gi) ?? []).toHaveLength(1);
    expect(html.match(/<\/style>/gi) ?? []).toHaveLength(1);
    expect(styleBlock(html)).not.toMatch(/@import|url\s*\(/i);
    for (const forbidden of [/<link\b/i, /<script\b/i, /<iframe\b/i, /<img\b/i, /\bsrc\s*=/i]) {
      expect(html).not.toMatch(forbidden);
    }
  });

  it('FR4: every href is mailto: or relative (no leading /, no scheme, no //)', () => {
    const all = hrefs(readSite(page));
    expect(all.length).toBeGreaterThan(0);
    for (const href of all) {
      if (href.startsWith('mailto:')) continue;
      expect(href).not.toMatch(/^\//); // root-absolute and protocol-relative (//)
      expect(href).not.toMatch(/^https?:/i);
      expect(href).not.toMatch(/^[a-z][a-z0-9+.-]*:/i); // any other scheme (javascript:, data:, …)
    }
  });

  it('FR4: every relative href resolves to a file inside site/', () => {
    const relative = hrefs(readSite(page)).filter((h) => !h.startsWith('mailto:'));
    expect(relative.length).toBeGreaterThan(0);
    for (const href of relative) {
      const target = href.split('#')[0].split('?')[0];
      let resolved = path.resolve(SITE, target);
      if (target === '' || target.endsWith('/') || target === '.') {
        resolved = path.join(resolved, 'index.html');
      }
      expect(resolved.startsWith(SITE + path.sep)).toBe(true);
      expect(fs.existsSync(resolved) && fs.statSync(resolved).isFile()).toBe(true);
    }
  });

  it('FR4: logo links to the site root with href="./" (works under /hourglass-app/)', () => {
    const html = readSite(page);
    expect(html).toContain('<a class="logo" href="./">');
    expect(html).not.toContain('href="#"');
  });

  it('FR4: shares the policy <style> block (an extra h3 rule is the only allowed difference) and footer', () => {
    const html = readSite(page);
    const withoutH3Rule = (css: string) => css.replace(/\n[ \t]*h3\s*\{[^}]*\}[ \t]*\n/g, '\n');
    expect(squash(withoutH3Rule(styleBlock(html)))).toBe(
      squash(styleBlock(readSite('privacy-policy.html'))),
    );
    expect(squash(html.match(/<footer>[\s\S]*?<\/footer>/)?.[0] ?? '')).toBe(FOOTER);
  });
});

describe('FR4: site-wide constraints', () => {
  it('FR4: the three page titles are all different', () => {
    const titles = PAGES.map((p) => textOf(innerAll(readSite(p), 'title')[0] ?? ''));
    expect(new Set(titles).size).toBe(PAGES.length);
  });

  it('FR4: site/ contains exactly index.html, privacy-policy.html and support.html (dotfiles ignored)', () => {
    expect(fs.existsSync(SITE)).toBe(true);
    const files = fs
      .readdirSync(SITE)
      .filter((name) => !name.startsWith('.'))
      .sort();
    expect(files).toEqual(['index.html', 'privacy-policy.html', 'support.html']);
  });
});

// Offline App Store Connect fixtures for spec 05 (FR2-FR5), used by mock-https.js and check.js.
// Shapes follow the ASC REST API (JSON:API). Ids other than the app id are fake. Each scenario is
// one point in the FR7 release sequence; modifiers add the negative cases.

const APP_ID = '6761698411';
const BUNDLE_ID = 'com.jalvarez0907.hourglass';
const DEAD_URL = 'https://jaime-alvarez-trilogy.github.io/hourglass/hourglassws/privacy-policy.html';
const URLS = {
  privacy: 'https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html',
  support: 'https://jaime-alvarez-trilogy.github.io/hourglass-app/support.html',
  marketing: 'https://jaime-alvarez-trilogy.github.io/hourglass-app/',
};

const OLD_UNLISTED_SENTENCE =
  "We intend to distribute this app via Unlisted App Distribution rather than public App Store listing, per Apple's guidance under Guideline 3.2.";
const NEW_UNLISTED_SENTENCE =
  'This app is distributed via Unlisted App Distribution, as approved under Guideline 3.2, rather than a public App Store listing.';
const REVIEW_NOTES_OLD = `This is an internal tool exclusively for Crossover Solutions contractors/employees to track their own weekly hours, earnings, AI-usage, and BrainLift metrics logged against their Crossover account, and for managers to review/approve direct reports' time entries. It requires an active Crossover account (crossover.com) to sign in — there is no public signup, no general-audience content, and no paid features. ${OLD_UNLISTED_SENTENCE} Demo account credentials are provided below for review.`;
const REVIEW_NOTES_NEW = REVIEW_NOTES_OLD.replace(OLD_UNLISTED_SENTENCE, NEW_UNLISTED_SENTENCE);

const WHATS_NEW_110 = [
  "• Managers: a new Team view in Overview lets you switch between your own numbers and your team's.",
  '• New Patterns card in Overview shows when in the day you work and focus best.',
  "• Your hours headline now includes overtime you've worked that is still awaiting approval.",
  '• Privacy Policy and Support are now in Settings.',
].join('\n');

// Captured from GET /v1/apps?filter[bundleId]=… on 2026-10-19 (only the id differs).
const AGREEMENT_403 = {
  errors: [
    {
      id: 'MOCK403AGREEMENT',
      status: '403',
      code: 'FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED',
      title: 'A required agreement is missing or has expired.',
      detail: 'This request requires an in-effect agreement that has not been signed or has expired.',
      links: { see: '/business' },
    },
  ],
};

const PUBLIC_LINK_IDS = Array.from({ length: 12 }, (_, i) => `bt-pl-${String(i + 1).padStart(2, '0')}`);
const EMAIL_TESTERS = [
  { id: 'bt-em-01', email: 'ana.reyes@example.com', firstName: 'Ana', lastName: 'Reyes' },
  // lastName null: the destructuring defaults in the pre-fix listTesters don't apply to null.
  { id: 'bt-em-02', email: 'ben.ortiz@example.com', firstName: 'Ben', lastName: null },
];
const EMAIL_IDS = EMAIL_TESTERS.map((t) => t.id);

const tester = (id, attrs) => ({ type: 'betaTesters', id, attributes: { state: 'INSTALLED', ...attrs } });

function testers() {
  const pl = PUBLIC_LINK_IDS.map((id) =>
    tester(id, { firstName: null, lastName: null, email: null, inviteType: 'PUBLIC_LINK' }),
  );
  const em = EMAIL_TESTERS.map((t) =>
    tester(t.id, { firstName: t.firstName, lastName: t.lastName, email: t.email, inviteType: 'EMAIL' }),
  );
  // EMAIL rows interleaved so a filter that slices or assumes ordering shows up.
  return [...pl.slice(0, 3), em[0], ...pl.slice(3, 9), em[1], ...pl.slice(9)];
}

const group = (id, attrs) => ({
  type: 'betaGroups',
  id,
  attributes: {
    hasAccessToAllBuilds: false,
    publicLinkLimitEnabled: false,
    publicLinkLimit: null,
    feedbackEnabled: true,
    createdDate: '2026-04-10T17:00:00.000+0000',
    ...attrs,
  },
});

const build = (id, version, prvId, processingState, expired, uploadedDate, expirationDate) => ({
  type: 'builds',
  id,
  prvId,
  attributes: {
    version,
    uploadedDate,
    expirationDate,
    expired,
    minOsVersion: '16.0',
    processingState,
    buildAudienceType: 'APP_STORE_ELIGIBLE',
    usesNonExemptEncryption: false,
  },
});

const version = (id, versionString, state, liveState, releaseType, createdDate) => ({
  type: 'appStoreVersions',
  id,
  attributes: {
    platform: 'IOS',
    versionString,
    appStoreState: state,
    appVersionState: liveState,
    copyright: '2026 Jaime Alvarez',
    releaseType,
    earliestReleaseDate: null,
    downloadable: true,
    createdDate,
  },
});

const versionLoc = (id, locale, attrs) => ({
  type: 'appStoreVersionLocalizations',
  id,
  attributes: {
    locale,
    description: 'Hourglass is a companion app for Crossover employees that puts your work data front and center.',
    keywords: 'crossover,hours,timesheet,earnings,widget,work,productivity,approvals,tracker',
    promotionalText: 'Track your Crossover hours, earnings, and approvals — all in one place.',
    supportUrl: DEAD_URL,
    marketingUrl: DEAD_URL,
    whatsNew: null,
    ...attrs,
  },
});

const reviewDetail = (id, notes) => ({
  type: 'appStoreReviewDetails',
  id,
  attributes: {
    contactFirstName: 'Jaime',
    contactLastName: 'Alvarez',
    contactEmail: 'jaime.alvarez@trilogy.com',
    contactPhone: '+1 555 0100',
    demoAccountName: 'qa.manager@example.com',
    demoAccountPassword: 'fixture-not-a-secret',
    demoAccountRequired: true,
    notes,
    attachments: null,
  },
});

const appInfo = (id, state, appStoreState) => ({
  type: 'appInfos',
  id,
  attributes: {
    state,
    appStoreState,
    appStoreAgeRating: 'FOUR_PLUS',
    brazilAgeRating: 'L',
    brazilAgeRatingV2: 'SELF_RATED_L',
    kidsAgeBand: null,
  },
});

const appInfoLoc = (id) => ({
  type: 'appInfoLocalizations',
  id,
  attributes: {
    locale: 'en-US',
    name: 'Hourglass.xo',
    subtitle: 'Crossover Hours & Earnings',
    privacyPolicyUrl: DEAD_URL,
    privacyChoicesUrl: null,
    privacyPolicyText: null,
  },
});

// Sibling capability answers are explicit false; socialMedia is null (2026-09-22 audit).
const ageRating = (id) => ({
  type: 'ageRatingDeclarations',
  id,
  attributes: {
    advertising: false,
    ageAssurance: false,
    alcoholTobaccoOrDrugUseOrReferences: 'NONE',
    contests: 'NONE',
    gambling: false,
    gamblingSimulated: 'NONE',
    gunsOrOtherWeapons: 'NONE',
    healthOrWellnessTopics: false,
    horrorOrFearThemes: 'NONE',
    lootBox: false,
    matureOrSuggestiveThemes: 'NONE',
    medicalOrTreatmentInformation: 'NONE',
    messagingAndChat: false,
    parentalControls: false,
    profanityOrCrudeHumor: 'NONE',
    sexualContentGraphicAndNudity: 'NONE',
    sexualContentOrNudity: 'NONE',
    socialMedia: null,
    unrestrictedWebAccess: false,
    userGeneratedContent: false,
    violenceCartoonOrFantasy: 'NONE',
    violenceRealistic: 'NONE',
    violenceRealisticProlongedGraphicOrSadistic: 'NONE',
    kidsAgeBand: null,
    ageRatingOverride: 'NONE',
    koreaAgeRatingOverride: 'NONE',
  },
});

// Pre-1.1.0, agreement accepted, Pages not deployed: the state FR7 starts from.
function today() {
  return {
    agreement403: false,
    pages: {
      [URLS.privacy]: { status: 404 },
      [URLS.support]: { status: 404 },
      [URLS.marketing]: { status: 404 },
    },
    app: {
      type: 'apps',
      id: APP_ID,
      attributes: { name: 'Hourglass.xo', bundleId: BUNDLE_ID, sku: 'hourglass', primaryLocale: 'en-US' },
    },
    testers: testers(),
    groups: [
      group('bg-test', {
        name: 'Test',
        isInternalGroup: false,
        publicLinkEnabled: true,
        publicLinkId: 'AbCdEf12',
        publicLink: 'https://testflight.apple.com/join/AbCdEf12',
      }),
      group('bg-internal', {
        name: 'Internal Testers',
        isInternalGroup: true,
        hasAccessToAllBuilds: true,
        publicLinkEnabled: null,
        publicLinkId: null,
        publicLink: null,
      }),
    ],
    preReleaseVersions: [
      { type: 'preReleaseVersions', id: 'prv-100', attributes: { version: '1.0.0', platform: 'IOS' } },
      { type: 'preReleaseVersions', id: 'prv-110', attributes: { version: '1.1.0', platform: 'IOS' } },
    ],
    builds: [
      build('bld-15', '15', 'prv-100', 'VALID', true, '2026-07-10T18:00:00.000-07:00', '2026-10-08T18:00:00.000-07:00'),
      build('bld-16', '16', 'prv-110', 'VALID', true, '2026-07-19T18:00:00.000-07:00', '2026-10-17T18:00:00.000-07:00'),
      build('bld-17', '17', 'prv-110', 'VALID', false, '2026-08-06T18:00:00.000-07:00', '2026-11-04T18:00:00.000-07:00'),
    ],
    versions: [version('asv-100', '1.0', 'READY_FOR_SALE', 'READY_FOR_DISTRIBUTION', 'MANUAL', '2026-04-08T10:00:00.000-07:00')],
    phased: { 'asv-100': null },
    attached: { 'asv-100': 'bld-15' },
    versionLocs: { 'asv-100': [versionLoc('asvl-100-en', 'en-US')] },
    reviewDetails: { 'asv-100': reviewDetail('asrd-100', REVIEW_NOTES_OLD) },
    // Live appInfo listed first so an `appInfos.data[0]` pick is caught.
    appInfos: [appInfo('ai-live', 'READY_FOR_DISTRIBUTION', 'READY_FOR_SALE')],
    appInfoLocs: { 'ai-live': [appInfoLoc('ail-live-en')] },
    ageRatings: { 'ai-live': ageRating('ard-live') },
    betaLocs: [
      {
        type: 'betaAppLocalizations',
        id: 'bal-en',
        attributes: {
          locale: 'en-US',
          description:
            'Hourglass is an internal tool for Crossover employees to track their weekly hours, earnings, AI usage metrics, and team time approvals — all in one place.',
          feedbackEmail: 'jaime.alvarez@trilogy.com',
          marketingUrl: null,
          privacyPolicyUrl: DEAD_URL,
          tvOsPrivacyPolicy: null,
        },
      },
    ],
    reviewSubmissions: [
      {
        type: 'reviewSubmissions',
        id: 'rs-100',
        attributes: { platform: 'IOS', submittedDate: '2026-07-15T12:00:00.000-07:00', state: 'COMPLETE' },
      },
    ],
  };
}

const find = (list, id) => list.find((x) => x.id === id);

function pagesLive(s) {
  for (const u of Object.values(URLS)) s.pages[u] = { status: 200 };
}

function lockdownDone(s) {
  find(s.groups, 'bg-test').attributes.publicLinkEnabled = false;
  s.testers = s.testers.filter((t) => t.attributes.inviteType !== 'PUBLIC_LINK');
}

// What ASC holds right after `create-version 1.1.0` (phased release not yet created).
function create110(s) {
  s.versions.push(
    version('asv-110', '1.1.0', 'PREPARE_FOR_SUBMISSION', 'PREPARE_FOR_SUBMISSION', 'AFTER_APPROVAL', '2026-10-20T09:00:00.000-07:00'),
  );
  s.phased['asv-110'] = null;
  s.attached['asv-110'] = null;
  // en-GB listed first so a locale-blind `[0]` pick is caught.
  s.versionLocs['asv-110'] = [versionLoc('asvl-110-gb', 'en-GB'), versionLoc('asvl-110-en', 'en-US')];
  s.reviewDetails['asv-110'] = reviewDetail('asrd-110', REVIEW_NOTES_OLD);
  s.appInfos.push(appInfo('ai-edit', 'PREPARE_FOR_SUBMISSION', 'PREPARE_FOR_SUBMISSION'));
  s.appInfoLocs['ai-edit'] = [appInfoLoc('ail-edit-en')];
  s.ageRatings['ai-edit'] = ageRating('ard-edit');
}

// After the FR7 ASC-prep live writes.
function prepDone(s) {
  s.phased['asv-110'] = {
    type: 'appStoreVersionPhasedReleases',
    id: 'aspr-110',
    attributes: { phasedReleaseState: 'INACTIVE', startDate: null, totalPauseDuration: 0, currentDayNumber: null },
  };
  find(s.appInfoLocs['ai-edit'], 'ail-edit-en').attributes.privacyPolicyUrl = URLS.privacy;
  Object.assign(find(s.versionLocs['asv-110'], 'asvl-110-en').attributes, {
    supportUrl: URLS.support,
    marketingUrl: URLS.marketing,
    whatsNew: WHATS_NEW_110,
  });
  find(s.betaLocs, 'bal-en').attributes.privacyPolicyUrl = URLS.privacy;
  s.ageRatings['ai-edit'].attributes.socialMedia = false;
  s.reviewDetails['asv-110'].attributes.notes = REVIEW_NOTES_NEW;
}

function addBuild18(s) {
  s.builds.push(
    build('bld-18', '18', 'prv-110', 'VALID', false, '2026-10-21T18:00:00.000-07:00', '2027-01-19T18:00:00.000-08:00'),
  );
}

function attach18(s) {
  s.attached['asv-110'] = 'bld-18';
}

function inReview(s) {
  Object.assign(find(s.versions, 'asv-110').attributes, {
    appStoreState: 'WAITING_FOR_REVIEW',
    appVersionState: 'WAITING_FOR_REVIEW',
  });
  Object.assign(find(s.appInfos, 'ai-edit').attributes, {
    state: 'WAITING_FOR_REVIEW',
    appStoreState: 'WAITING_FOR_REVIEW',
  });
  s.reviewSubmissions.push({
    type: 'reviewSubmissions',
    id: 'rs-110',
    attributes: { platform: 'IOS', submittedDate: '2026-10-22T12:00:00.000-07:00', state: 'WAITING_FOR_REVIEW' },
  });
}

const BASES = {
  'agreement-403': () => Object.assign(today(), { agreement403: true }),
  today: () => today(),
  'v110-fresh': () => {
    const s = today();
    pagesLive(s);
    lockdownDone(s);
    create110(s);
    return s;
  },
  'v110-prepped': () => {
    const s = BASES['v110-fresh']();
    prepDone(s);
    return s;
  },
  'v110-build18': () => {
    const s = BASES['v110-prepped']();
    addBuild18(s);
    return s;
  },
  'post-live': () => {
    const s = BASES['v110-build18']();
    attach18(s);
    return s;
  },
  'v110-in-review': () => {
    const s = BASES['post-live']();
    inReview(s);
    return s;
  },
};

const MODIFIERS = {
  'pages-live': pagesLive,
  'pages-redirect': (s) => {
    pagesLive(s);
    s.pages[URLS.support] = { status: 301, location: `${URLS.marketing}support/` };
    s.pages[`${URLS.marketing}support/`] = { status: 200 };
  },
  'two-editable': (s) =>
    s.versions.push(
      version('asv-120', '1.2.0', 'PREPARE_FOR_SUBMISSION', 'PREPARE_FOR_SUBMISSION', 'AFTER_APPROVAL', '2026-10-25T09:00:00.000-07:00'),
    ),
  'no-en-us': (s) => {
    s.versionLocs['asv-110'] = s.versionLocs['asv-110'].filter((l) => l.attributes.locale !== 'en-US');
  },
  'no-socialmedia-key': (s) => {
    delete s.ageRatings['ai-edit'].attributes.socialMedia;
  },
  'rating-nine-plus': (s) => {
    find(s.appInfos, 'ai-edit').attributes.appStoreAgeRating = 'NINE_PLUS';
  },
  'build19-processing': (s) =>
    s.builds.push(build('bld-19', '19', 'prv-110', 'PROCESSING', false, '2026-10-23T18:00:00.000-07:00', null)),
  'build18-expired': (s) => {
    find(s.builds, 'bld-18').attributes.expired = true;
  },
  'attached-17': (s) => {
    s.attached['asv-110'] = 'bld-17';
  },
  'two-editable-infos': (s) => s.appInfos.push(appInfo('ai-edit-2', 'PREPARE_FOR_SUBMISSION', 'PREPARE_FOR_SUBMISSION')),
  'build15-unexpired': (s) => {
    find(s.builds, 'bld-15').attributes.expired = false;
  },
  'partial-urls': (s) => {
    find(s.appInfoLocs['ai-edit'], 'ail-edit-en').attributes.privacyPolicyUrl = URLS.privacy;
    find(s.versionLocs['asv-110'], 'asvl-110-en').attributes.supportUrl = URLS.support;
  },
};

/** Builds the fixture state for "base+modifier+…" (e.g. "v110-fresh+no-en-us"). */
function buildState(name) {
  const [base, ...mods] = String(name).split('+');
  if (!BASES[base]) throw new Error(`unknown fixture scenario: ${base}`);
  const s = BASES[base]();
  for (const m of mods) {
    if (!MODIFIERS[m]) throw new Error(`unknown fixture modifier: ${m}`);
    MODIFIERS[m](s);
  }
  return s;
}

module.exports = {
  APP_ID,
  BUNDLE_ID,
  DEAD_URL,
  URLS,
  OLD_UNLISTED_SENTENCE,
  NEW_UNLISTED_SENTENCE,
  REVIEW_NOTES_OLD,
  REVIEW_NOTES_NEW,
  WHATS_NEW_110,
  AGREEMENT_403,
  PUBLIC_LINK_IDS,
  EMAIL_TESTERS,
  EMAIL_IDS,
  SCENARIOS: Object.keys(BASES),
  MODIFIERS: Object.keys(MODIFIERS),
  buildState,
};

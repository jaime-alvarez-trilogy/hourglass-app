// In-memory App Store Connect for the offline asc.js harness. `route(state, method, url)` is
// pure: it answers from a fixtures.js state and never touches the network. Non-GET requests are
// answered with an error and flagged `blocked`.

const fixtures = require('./fixtures');

const ASC_HOST = 'api.appstoreconnect.apple.com';
const PAGES_HOST = 'jaime-alvarez-trilogy.github.io';

const ok = (body) => ({ status: 200, body });
const errorBody = (status, code, title, detail) => ({
  status,
  body: { errors: [{ id: `MOCK${status}`, status: String(status), code, title, detail }] },
});
const notFound = (detail) => errorBody(404, 'NOT_FOUND', 'The specified resource does not exist', detail);

const csv = (v) => (v == null ? null : String(v).split(','));
const matches = (param, value) => param == null || csv(param).includes(String(value));

function serializeBuild(s, b, include) {
  const prv = s.preReleaseVersions.find((p) => p.id === b.prvId);
  const rel = { links: { related: `https://${ASC_HOST}/v1/builds/${b.id}/preReleaseVersion` } };
  const out = { type: 'builds', id: b.id, attributes: { ...b.attributes }, relationships: { preReleaseVersion: rel } };
  if (include.includes('preReleaseVersion')) rel.data = { type: 'preReleaseVersions', id: prv.id };
  return out;
}

function buildsResponse(s, list, q, single) {
  const include = csv(q.get('include')) ?? [];
  const data = list.map((b) => serializeBuild(s, b, include));
  const body = { data: single ? data[0] : data, links: { self: 'mock' } };
  if (include.includes('preReleaseVersion')) {
    const ids = [...new Set(list.map((b) => b.prvId))];
    body.included = s.preReleaseVersions.filter((p) => ids.includes(p.id));
  }
  return ok(body);
}

function filterBuilds(s, q) {
  const prvById = (id) => s.preReleaseVersions.find((p) => p.id === id);
  let list = s.builds.filter(
    (b) =>
      matches(q.get('filter[app]'), fixtures.APP_ID) &&
      matches(q.get('filter[processingState]'), b.attributes.processingState) &&
      matches(q.get('filter[version]'), b.attributes.version) &&
      matches(q.get('filter[expired]'), b.attributes.expired) &&
      matches(q.get('filter[preReleaseVersion]'), b.prvId) &&
      matches(q.get('filter[preReleaseVersion.version]'), prvById(b.prvId).attributes.version) &&
      matches(q.get('filter[id]'), b.id),
  );
  const sort = q.get('sort') ?? '-uploadedDate';
  const dir = sort.startsWith('-') ? -1 : 1;
  if (sort.replace('-', '') === 'uploadedDate') {
    list = [...list].sort((a, b) => dir * a.attributes.uploadedDate.localeCompare(b.attributes.uploadedDate));
  }
  return list;
}

function versionResource(s, v, include) {
  const out = { ...v, attributes: { ...v.attributes }, relationships: {} };
  const included = [];
  if (include.includes('build')) {
    const id = s.attached[v.id];
    out.relationships.build = { data: id ? { type: 'builds', id } : null };
    if (id) included.push(serializeBuild(s, s.builds.find((b) => b.id === id), []));
  }
  if (include.includes('appStoreVersionPhasedRelease')) {
    const p = s.phased[v.id];
    out.relationships.appStoreVersionPhasedRelease = { data: p ? { type: p.type, id: p.id } : null };
    if (p) included.push(p);
  }
  return { out, included };
}

function routeAsc(s, method, url) {
  if (s.agreement403) return { status: 403, body: fixtures.AGREEMENT_403 };
  if (method !== 'GET') {
    return {
      ...errorBody(403, 'MOCK.WRITE_BLOCKED', 'The offline harness answers every non-GET with an error', `${method} ${url.pathname}`),
      blocked: true,
    };
  }
  const p = url.pathname.replace(/^\/v1(?=\/)/, '');
  const q = url.searchParams;
  const list = (items) => ok({ data: items, links: { self: url.href }, meta: { paging: { total: items.length, limit: 200 } } });
  const one = (item, what) => (item ? ok({ data: item, links: { self: url.href } }) : notFound(`mock: no ${what}`));
  const isApp = (id) => id === fixtures.APP_ID;
  let m;

  if (p === '/apps') return list(matches(q.get('filter[bundleId]'), fixtures.BUNDLE_ID) ? [s.app] : []);
  if ((m = p.match(/^\/apps\/([^/]+)$/))) return one(isApp(m[1]) && s.app, 'app');
  if ((m = p.match(/^\/apps\/([^/]+)\/(\w+)$/)) && isApp(m[1])) {
    switch (m[2]) {
      case 'betaGroups':
        return list(s.groups);
      case 'betaTesters':
        return list(s.testers);
      case 'builds':
        return buildsResponse(s, filterBuilds(s, q), q);
      case 'preReleaseVersions':
        return list(s.preReleaseVersions.filter((x) => matches(q.get('filter[version]'), x.attributes.version)));
      case 'appStoreVersions': {
        const vs = s.versions.filter(
          (v) =>
            matches(q.get('filter[platform]'), v.attributes.platform) &&
            matches(q.get('filter[appStoreState]'), v.attributes.appStoreState) &&
            matches(q.get('filter[appVersionState]'), v.attributes.appVersionState) &&
            matches(q.get('filter[versionString]'), v.attributes.versionString) &&
            matches(q.get('filter[id]'), v.id),
        );
        return list(vs);
      }
      case 'appInfos':
        return list(s.appInfos);
      case 'betaAppLocalizations':
        return list(s.betaLocs);
      case 'reviewSubmissions':
        return list(s.reviewSubmissions);
      default:
        return notFound(`mock: no fixture for GET ${p}`);
    }
  }

  if (p === '/betaTesters') {
    return list(
      s.testers.filter(
        (t) =>
          matches(q.get('filter[apps]'), fixtures.APP_ID) &&
          matches(q.get('filter[email]'), t.attributes.email) &&
          matches(q.get('filter[inviteType]'), t.attributes.inviteType) &&
          matches(q.get('filter[betaGroups]'), 'bg-test') &&
          matches(q.get('filter[id]'), t.id),
      ),
    );
  }
  if ((m = p.match(/^\/betaTesters\/([^/]+)$/))) return one(s.testers.find((t) => t.id === m[1]), `betaTester ${m[1]}`);
  if (p === '/betaGroups') return list(matches(q.get('filter[app]'), fixtures.APP_ID) ? s.groups : []);
  if ((m = p.match(/^\/betaGroups\/([^/]+)$/))) return one(s.groups.find((g) => g.id === m[1]), `betaGroup ${m[1]}`);
  if ((m = p.match(/^\/betaGroups\/([^/]+)\/betaTesters$/))) return list(m[1] === 'bg-test' ? s.testers : []);

  if (p === '/builds') return buildsResponse(s, filterBuilds(s, q), q);
  if ((m = p.match(/^\/builds\/([^/]+)$/))) {
    const b = s.builds.find((x) => x.id === m[1]);
    return b ? buildsResponse(s, [b], q, true) : notFound(`mock: no build ${m[1]}`);
  }
  if ((m = p.match(/^\/builds\/([^/]+)\/preReleaseVersion$/))) {
    const b = s.builds.find((x) => x.id === m[1]);
    return one(b && s.preReleaseVersions.find((x) => x.id === b.prvId), `build ${m[1]}`);
  }
  if ((m = p.match(/^\/builds\/([^/]+)\/appStoreVersion$/))) {
    const vid = Object.keys(s.attached).find((k) => s.attached[k] === m[1]);
    return ok({ data: s.versions.find((v) => v.id === vid) ?? null, links: { self: url.href } });
  }
  if (p === '/preReleaseVersions') {
    return list(
      s.preReleaseVersions.filter(
        (x) => matches(q.get('filter[version]'), x.attributes.version) && matches(q.get('filter[app]'), fixtures.APP_ID),
      ),
    );
  }
  if ((m = p.match(/^\/preReleaseVersions\/([^/]+)$/))) return one(s.preReleaseVersions.find((x) => x.id === m[1]), 'preReleaseVersion');
  if ((m = p.match(/^\/preReleaseVersions\/([^/]+)\/builds$/))) {
    return buildsResponse(s, s.builds.filter((b) => b.prvId === m[1]), q);
  }

  if ((m = p.match(/^\/appStoreVersions\/([^/]+)(?:\/(.+))?$/))) {
    const v = s.versions.find((x) => x.id === m[1]);
    if (!v) return notFound(`mock: no appStoreVersion ${m[1]}`);
    const include = csv(q.get('include')) ?? [];
    switch (m[2]) {
      case undefined: {
        const { out, included } = versionResource(s, v, include);
        return ok({ data: out, ...(include.length ? { included } : {}), links: { self: url.href } });
      }
      case 'build': {
        const id = s.attached[v.id];
        return ok({ data: id ? serializeBuild(s, s.builds.find((b) => b.id === id), []) : null, links: { self: url.href } });
      }
      case 'relationships/build': {
        const id = s.attached[v.id];
        return ok({ data: id ? { type: 'builds', id } : null, links: { self: url.href } });
      }
      case 'appStoreVersionPhasedRelease':
        return ok({ data: s.phased[v.id] ?? null, links: { self: url.href } });
      case 'appStoreVersionLocalizations':
        return list(s.versionLocs[v.id] ?? []);
      case 'appStoreReviewDetail':
        return ok({ data: s.reviewDetails[v.id] ?? null, links: { self: url.href } });
      default:
        return notFound(`mock: no fixture for GET ${p}`);
    }
  }
  if ((m = p.match(/^\/appStoreVersionLocalizations\/([^/]+)$/))) {
    return one(Object.values(s.versionLocs).flat().find((l) => l.id === m[1]), 'appStoreVersionLocalization');
  }
  if ((m = p.match(/^\/appStoreReviewDetails\/([^/]+)$/))) {
    return one(Object.values(s.reviewDetails).find((d) => d.id === m[1]), 'appStoreReviewDetail');
  }
  if ((m = p.match(/^\/appStoreVersionPhasedReleases\/([^/]+)$/))) {
    return one(Object.values(s.phased).find((x) => x && x.id === m[1]), 'phased release');
  }

  if ((m = p.match(/^\/appInfos\/([^/]+)(?:\/(\w+))?$/))) {
    const info = s.appInfos.find((x) => x.id === m[1]);
    if (!info) return notFound(`mock: no appInfo ${m[1]}`);
    if (!m[2]) return one(info, 'appInfo');
    if (m[2] === 'appInfoLocalizations') return list(s.appInfoLocs[info.id] ?? []);
    if (m[2] === 'ageRatingDeclaration') return one(s.ageRatings[info.id], 'ageRatingDeclaration');
    return notFound(`mock: no fixture for GET ${p}`);
  }
  if ((m = p.match(/^\/appInfoLocalizations\/([^/]+)$/))) {
    return one(Object.values(s.appInfoLocs).flat().find((l) => l.id === m[1]), 'appInfoLocalization');
  }
  if ((m = p.match(/^\/ageRatingDeclarations\/([^/]+)$/))) {
    return one(Object.values(s.ageRatings).find((d) => d.id === m[1]), 'ageRatingDeclaration');
  }
  if (p === '/betaAppLocalizations') return list(matches(q.get('filter[app]'), fixtures.APP_ID) ? s.betaLocs : []);
  if ((m = p.match(/^\/betaAppLocalizations\/([^/]+)$/))) return one(s.betaLocs.find((l) => l.id === m[1]), 'betaAppLocalization');
  if (p === '/reviewSubmissions') {
    if (!matches(q.get('filter[app]'), fixtures.APP_ID)) return list([]);
    return list(
      s.reviewSubmissions.filter(
        (x) => matches(q.get('filter[platform]'), x.attributes.platform) && matches(q.get('filter[state]'), x.attributes.state),
      ),
    );
  }
  if ((m = p.match(/^\/reviewSubmissions\/([^/]+)\/items$/))) {
    if (!s.reviewSubmissions.some((x) => x.id === m[1])) return notFound(`mock: no reviewSubmission ${m[1]}`);
    const include = csv(q.get('include')) ?? [];
    const items = (s.reviewSubmissionItems[m[1]] ?? []).map((it) => {
      const rel = { links: { related: `https://${ASC_HOST}/v1/reviewSubmissionItems/${it.id}/appStoreVersion` } };
      if (include.includes('appStoreVersion')) rel.data = it.versionId ? { type: 'appStoreVersions', id: it.versionId } : null;
      return { type: 'reviewSubmissionItems', id: it.id, attributes: { ...it.attributes }, relationships: { appStoreVersion: rel } };
    });
    const body = { data: items, links: { self: url.href }, meta: { paging: { total: items.length, limit: 200 } } };
    if (include.includes('appStoreVersion')) {
      const ids = [...new Set((s.reviewSubmissionItems[m[1]] ?? []).map((it) => it.versionId).filter(Boolean))];
      body.included = s.versions.filter((v) => ids.includes(v.id));
    }
    return ok(body);
  }

  return notFound(`mock: no fixture for GET ${p}`);
}

/** Pure router: returns { status, headers, body, blocked?, unhandled?, networkError? }. */
function route(state, method, url) {
  if (url.hostname === ASC_HOST) {
    const r = routeAsc(state, method, url);
    const unhandled = r.status === 404 && /no fixture for/.test(JSON.stringify(r.body));
    return { ...r, unhandled, headers: { 'content-type': 'application/json' } };
  }
  if (url.hostname === PAGES_HOST) {
    if (method !== 'GET' && method !== 'HEAD') return { status: 405, headers: {}, body: '', blocked: true };
    const page = state.pages[`${url.origin}${url.pathname}`] ?? { status: 404 };
    const headers = { 'content-type': 'text/html; charset=utf-8', ...(page.location ? { location: page.location } : {}) };
    return { status: page.status, headers, body: method === 'HEAD' ? '' : `<html>mock ${page.status}</html>` };
  }
  return { networkError: `getaddrinfo ENOTFOUND ${url.hostname} (offline harness allows only ${ASC_HOST} and ${PAGES_HOST})` };
}

module.exports = { route, ASC_HOST, PAGES_HOST };

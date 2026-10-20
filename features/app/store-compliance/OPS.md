# Ops Checklist — non-code steps

Things that happen in App Store Connect, GitHub settings or the local filesystem rather than in a PR. Owner: **J** = Jaime (needs a logged-in browser), **C** = Claude (can do via CLI/API).

## Before build 18 is submitted

- [ ] **O1 (C) — Contain the ASC key.** Add `Gdrive/`, `Video Recordings/`, `*.p8`, `*.p12`, `*.key`, `*.pem`, `*.mobileprovision`, `.env`, `.env.*` to `WS/.gitignore` if not already present. Then `mv "WS/Gdrive" ~/.hourglass-secrets/`. Verify: `git -C WS check-ignore -v Gdrive/` prints a rule and `ls WS/Gdrive` fails. Leave `hourglassws/.appstore/` alone (already ignored). Don't unarchive `hourglass-scriptable`.
- [ ] **O2 (C) — Enable GitHub Pages** on `hourglass-app` with source = GitHub Actions: `gh api -X POST repos/jaime-alvarez-trilogy/hourglass-app/pages -f build_type=workflow`. Part of spec 01's rollout.
- [ ] **O3 (J) — Age rating.** ASC → App Information → Age Rating → Capabilities → Social Media = **No** (no feed or discovery surface). Re-check that the rating stays 4+ / Brazil L. If locked, do it on the 1.1.0 version record (O7).
- [ ] **O4 (J) — Update URLs in ASC.** Privacy Policy URL → `https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html`. Support URL → `…/hourglass-app/support.html`. Marketing URL → `…/hourglass-app/` or blank. Do this only after spec 01's curl checks return 200.
- [ ] **O5 (J) — App Privacy label.** Declare Identifiers → Device ID: purpose App Functionality, Not Linked to You, Not Used for Tracking. Must match the policy text from spec 01 and the manifest decision in spec 03.
- [ ] **O6 (J) — TestFlight public link.** External group "Test" → turn off Public Link. Delete the group, or remove the 12 anonymous `PUBLIC_LINK` testers. Move the two email testers to an internal group. Do this **before** build 18 lands in TestFlight so strangers don't get the unreleased build.
- [ ] **O7 (J/C) — 1.1.0 version record + submission.** See spec 05's runbook.

## After build 18 is live

- [ ] **O8 (J+C) — Rotate the ASC API key to least privilege.** J: revoke `W4UV4XTKPC` (Admin) and create an **App Manager** key. C: update `eas.json` (submit block), `.appstore/asc.js`, `.appstore/query-listing.js` and `.appstore/config.json`, and **regenerate** `.appstore/api_key.json`, which embeds a second inline copy of the key. Verify with `node .appstore/asc.js builds`. While in ASC, audit Users and Access and Certificates.
- [ ] **O9 (C) — Purge local checkpoint refs** in the outer repo after O8: `git -C WS for-each-ref --format='%(refname)' refs/t3 | xargs -n1 git -C WS update-ref -d && git -C WS reflog expire --expire=now --all && git -C WS gc --prune=now`.
- [ ] **O10 (C) — Untrack `hourglassws/` from the outer `WS` repo.** In one commit: `git rm -r --cached hourglassws/` and add `hourglassws/` to `WS/.gitignore`. No submodule. The 95 unpushed outer commits stay local (the repo is archived).
- [ ] **O11 (C) — Baseline OTA.** See spec 04 FR4.

## Dated reminders

- **Early Feb 2027:** re-check `developer.apple.com/news/upcoming-requirements/` for the exact iOS 27 SDK day.
- **Early Mar 2027:** renew signing certs and all six provisioning profiles (expire 2027-04-06).

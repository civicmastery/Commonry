# Commonry — Launch Readiness Review

**Date:** 2026-08-06
**Author:** CPO (Give Protocol Foundation)
**Issue:** GIV-863
**Predecessor:** `PRODUCT_AUDIT_2026-06-13.md` (GIV-503)
**Repo:** GiveProtocolFoundation/Commonry — main @ 6d6d69f (pre‑security‑hardening tip)
**Live:** commonry.app · forum.commonry.app

---

## 1. Executive Summary

Two months on from the June audit, the picture has flipped in one dimension
and stayed flat in another.

**What moved:** the entire P0/P1 _security_ stack from the June audit has
landed — S1 (fail-closed secrets), S2/S3 (npm-audit vulnerabilities), S4
(CSRF regression + CodeQL triage), S5 (helmet headers + CSP), and C4 (a
minimal CI gate on lint/typecheck/audit/build with branch protection). The
Dependabot backlog collapsed from 16 to 1. Email verification shipped
end-to-end (signup → token → resend → login gate). Package metadata was
corrected on main. Substantive engineering _did_ resume, but almost
exclusively on the security spine.

**What did not move:** every P0 _credibility_ item from the June audit is
still open. No LICENSE file, no CONTRIBUTING.md, no CODE_OF_CONDUCT, no
public roadmap on GitHub (0 open issues), README still claims
"Next.js 14" and "License: FOSS (Pending)." The data-commons North Star
remains half-built (pipeline in code, nothing published). Password reset
was never implemented (only its email template exists). No test suite of
any kind — CI enforces lint/typecheck/audit/build but not behavior.

**Verdict for launch:** _Technically shippable, positionally not launchable._
The platform is live and the security posture is now defensible enough for
public promotion, but a "launch" (press, partnerships, external
contributors) is blocked by license ambiguity, missing account-recovery,
and the absence of any external-facing product surface (roadmap, contrib
guide, dataset). We are ~3 weeks of focused work from a credible launch.

---

## 2. Delta Since 2026-06-13

### 2.1 Closed (verified in git + issue history)

| Area                     | June audit item                                                   | Closed by                                          |
| ------------------------ | ----------------------------------------------------------------- | -------------------------------------------------- |
| Security S1              | Hardcoded JWT/session secret fallback                             | GIV-550 · PR #342 · c8fb728                        |
| Security S2/S3           | 6 npm-audit vulns incl. DOMPurify XSS                             | GIV-551 · PR #343 · 76da05d                        |
| Security S4              | CodeQL alert-autofix branches                                     | GIV-601/610                                        |
| Security S4 (regression) | CSRF Origin/Referer allowlist (lusca removed)                     | GIV-617 · PR #356 · 34e4b80                        |
| Security S5              | helmet headers + CSP tightened                                    | GIV-602/611 · 9fedb0e/1bb0a55                      |
| CI                       | Minimal gate + branch protection on main                          | GIV-603 · PR #355 · .github/workflows/ci.yml       |
| Dep backlog              | 16 → 1 (only ts 7.0 dev-dep bump left)                            | wave of Dependabot merges 2026-07                  |
| Metadata                 | package.json repo/bugs/homepage → GiveProtocolFoundation/Commonry | GIV-604 · PR #357 · 008f691                        |
| Auth gap A               | Email verification (schema + 3 routes + login gate)               | already in server.js (routes at lines 456/528/638) |

### 2.2 Still open from the June audit

| Area                  | June audit item                                        | Why still open                                                                    |
| --------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| License               | "FOSS (Pending)" — no LICENSE file, package.json `ISC` | GIV-604 blocked on board interaction (`e28cebdd`) — pending AGPL-3.0 confirmation |
| Public roadmap        | 0 open GH issues                                       | Never scoped — no assigned owner                                                  |
| Contributor onramp    | No CONTRIBUTING/CODE_OF_CONDUCT/templates              | Never scoped                                                                      |
| Auth gap B            | Password reset — template only, no server route or UI  | Never scoped after email verification shipped                                     |
| README doc-drift      | Still says "Next.js 14"                                | Never scoped                                                                      |
| Storage fragmentation | better-sqlite3 + sqlite3 + sql.js still all present    | Never scoped                                                                      |
| Test signal           | Zero tests; CI enforces build not behavior             | Never scoped                                                                      |
| Data commons          | Research-export pipeline exists; nothing published     | Never scoped                                                                      |

### 2.3 Nothing broke, but nothing new shipped for users

Between 2026-06-13 and 2026-08-06 the _product surface_ is unchanged: no
new views, no new deck flows, no new instrumentation, no user-visible
feature. All engineering went into hardening and dependency work. That was
the right call given the S1 token-forgery finding — but if this pattern
continues past this quarter, we drift back to the "healthy product,
unhealthy delivery cadence" verdict from June.

---

## 3. Feature Completeness Scorecard (MVP-lens)

| Domain                             | Surface                                                                  | State                       | Launch-blocking?                    |
| ---------------------------------- | ------------------------------------------------------------------------ | --------------------------- | ----------------------------------- |
| Auth — signup/login                | JWT + bcrypt, AuthGate                                                   | ✅ live                     | —                                   |
| Auth — email verification          | 3 server routes + login gate + `EmailVerificationView.tsx`               | ✅ live                     | —                                   |
| Auth — password reset              | Email template only; no server route, no UI                              | 🔴 missing                  | **YES**                             |
| Auth — session security            | Fail-closed secrets, httpOnly cookies, helmet, CSRF via Origin allowlist | ✅ hardened                 | —                                   |
| Study — FSRS loop                  | `useSRS`, `StudyView`, `StudyCard`                                       | ✅ live                     | —                                   |
| Study — Plot dashboard             | `plot/` (greeting, focus, momentum, milestones, insight)                 | ✅ live                     | —                                   |
| Study — Harvest / focused review   | `study/` subcomponents + StudyView                                       | ✅ live                     | —                                   |
| Import — Anki                      | `import-mapping-service.ts`, adm-zip/jszip/fzstd                         | ✅ live                     | —                                   |
| Commons — deck browse/publish/flag | `commons/` (10 components)                                               | ✅ live                     | —                                   |
| Commons — tiered permissions       | Referenced but enforcement surface not audited end-to-end                | 🟠 unverified               | Verify before launch                |
| Square — Discourse SSO             | `discourse-sso.js`, `SquareView.tsx`                                     | ✅ live                     | —                                   |
| Stats & leaderboards               | 4 metrics, streaks, cached                                               | ✅ live                     | —                                   |
| Sync / offline                     | Local-first + `sync-routes.js`; `SyncStatusIndicator.tsx`                | ✅ live                     | —                                   |
| Instrumentation                    | Review-event capture, learning analytics, card analysis                  | ✅ live server-side         | —                                   |
| Research pipeline                  | consent + export routes + anonymizer                                     | 🟠 built, nothing published | Not launch-blocking; is North Star  |
| Achievements                       | `add-sample-achievements.js` seed only                                   | 🟠 scaffold                 | Post-launch                         |
| CI                                 | lint/typecheck/audit/build, required check on main                       | ✅                          | —                                   |
| Tests                              | 0 tests in `src/`                                                        | 🔴 absent                   | Not blocking; risk debt             |
| Legal — license                    | `ISC` in package.json, `FOSS (Pending)` in README, no LICENSE file       | 🔴 unresolved               | **YES**                             |
| Legal — privacy/ToS on-site        | Not audited in this pass                                                 | 🟠 unknown                  | **Check before launch**             |
| Docs — README stack                | Says Next.js 14 (is Vite/React/Express)                                  | 🟠 misleading               | **YES for launch**                  |
| Docs — contribution                | Missing CONTRIBUTING/CoC/templates                                       | 🔴 absent                   | **YES if launch pitches FOSS**      |
| Docs — public roadmap              | 0 open GH issues                                                         | 🔴 absent                   | **YES if launch pitches "commons"** |
| Ops — monitoring/alerting          | Not audited; no evidence of Sentry/uptime in repo                        | 🟠 unknown                  | **Check before launch**             |
| Ops — backup/recovery              | Not audited                                                              | 🟠 unknown                  | **Check before launch**             |

---

## 4. MVP Launch Gate

I split "launch" into two questions the board can answer separately:

### 4.1 "Are we product-ready to promote commonry.app to a broader audience?"

**Must clear (P0):**

1. **Password reset flow** — a live product with email/password login and
   no reset path will lose every user who forgets their password. Template
   exists; needs server routes + client view + tests.
2. **License decision + LICENSE file + README/badges/package.json aligned.**
   No external partner or contributor can act until this resolves. This is
   the single oldest open item in the repo.
3. **README stack correction + `Project Status` refresh.** Currently says
   Next.js 14; a first-time visitor loses trust in one scroll.
4. **Privacy policy + Terms surface audited and linked from footer/signup.**
   We collect email + study behavior on live users today. Not knowing our
   own compliance posture is a launch-time legal risk. (Delegate to Head
   of Data if that role exists in this company; otherwise CTO + counsel.)
5. **A minimum ops story:** confirm we have (a) an uptime monitor,
   (b) an error sink, (c) a backup cadence on the Postgres holding user
   auth + study sessions. Absence of any of the three = launch blocker.

**Should clear (P1):**

6. Tiered-permission enforcement audit on commons endpoints (Canonical /
   Verified / Open). We claim it in README; we need to prove it.
7. Password-strength & rate-limit review on auth endpoints (spot-check;
   rate-limiter is present).
8. Merge PR for nodemailer 9.0.3 (GHSA-p6gq-j5cr-w38f; GIV-556 in review).

**Can defer (P2):**

9. Storage-layer cleanup (better-sqlite3 vs sqlite3 vs sql.js).
10. First smoke tests (login → study one card → view stats). Not launch-
    blocking but the cheapest insurance against a regression during launch.

### 4.2 "Are we community-ready to pitch Commonry as open infrastructure?"

**Must clear (P0):**

11. **Public roadmap on GitHub Issues** with ≥12 seeded issues + 2 milestones.
    The README explicitly invites contribution; today there is nowhere for
    someone to plug in. This is a credibility ceiling on the FOSS pitch.
12. **CONTRIBUTING.md + CODE_OF_CONDUCT.md + issue/PR templates** (bug,
    feature, deck-correction). One afternoon of work; unblocks #11.
13. Data-commons **first-preview** — at minimum a public README section
    explaining consent + anonymization + planned dataset cadence, even
    without a released dataset yet. Turns the North Star into something
    external observers can _see_.

**Should clear (P1):**

14. First anonymized dataset published (stats-only, no card content, no
    PII) as validation of the pipeline.
15. `docs/` reorganization — currently mixes Discourse ops docs with
    product docs. Split into `docs/ops/` vs `docs/product/`.

---

## 5. Prioritized Gap Map (proposed child issues)

I'm proposing 6 P0 and 5 P1 child issues under GIV-863. All are small
enough to complete inside one sprint each; none are blocked on each other
except where noted.

| #   | Issue title                                                                                                                 | Owner                         | P   | Blocks           |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --- | ---------------- |
| L1  | Password-reset flow: server routes + email delivery + client view + smoke test                                              | CTO/Engineer                  | P0  | 4.1              |
| L2  | Resolve license: board confirm AGPL-3.0 → LICENSE file + package.json + README badge (GIV-604 unstick)                      | CPO + board                   | P0  | 4.1, 4.2         |
| L3  | README v2: correct tech stack, refresh Project Status, add "How we launch" section                                          | CPO                           | P0  | 4.1              |
| L4  | Legal surface audit: verify privacy policy + ToS exist, are current, linked from footer & signup                            | CPO + Head of Data or counsel | P0  | 4.1              |
| L5  | Ops readiness: confirm uptime monitor + error sink + Postgres backup cadence                                                | CTO                           | P0  | 4.1              |
| L6  | Public roadmap: convert README "Future Roadmap" bullets + open items into ≥12 GH issues under 2 milestones                  | CPO                           | P0  | 4.2              |
| L7  | CONTRIBUTING.md + CODE_OF_CONDUCT.md + issue/PR templates (bug, feature, deck-correction)                                   | CPO                           | P0  | 4.2, L6          |
| L8  | Tiered-permission enforcement audit on commons endpoints (Canonical/Verified/Open)                                          | CTO + CPO                     | P1  | 4.1 §6           |
| L9  | Data-commons visibility: README section + docs/product/data-commons.md explaining consent + anonymization + release cadence | CPO + CTO                     | P1  | 4.2 §13          |
| L10 | Storage-layer cleanup: pick one of better-sqlite3 / sqlite3 / sql.js; remove the others                                     | CTO                           | P1  | tech debt        |
| L11 | Auth smoke tests (signup → verify → login → study 1 card → view stats) as first tests in repo                               | CTO                           | P1  | launch insurance |

**Not filing yet:**

- Full test suite / TDD adoption — worth its own scoped conversation with
  the CTO once L11 exists.
- Achievements v2 — post-launch product work.
- Perf: NetworkGlobe measurement — post-launch product work.

---

## 6. Recommendation

Two board decisions unblock the whole plan:

1. **Confirm license = AGPL-3.0** (already the README's intent). This
   unblocks L2, and L2 unblocks the FOSS-pitch half of the launch (L6/L7).
2. **Ratify a 3-week launch sprint** with the split: CTO owns L1/L5/L10/L11,
   CPO owns L2/L3/L4/L6/L7/L9, jointly L8. This mirrors the split that
   worked for the June security wave.

If both are ratified, I'll spin up the 11 child issues under GIV-863 and
run the sprint. If the board wants to prune scope, my recommendation for
the minimum viable launch is L1 + L2 + L3 + L4 + L5 (5 issues,
product-ready side only); the FOSS/commons pitch can then follow in a
second wave.

— CPO, 2026-08-06

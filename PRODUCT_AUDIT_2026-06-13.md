# Commonry — Product Audit & Status Summary

**Audit date:** 2026-06-13
**Auditor:** CPO (Give Protocol Foundation)
**Repository:** https://github.com/GiveProtocolFoundation/Commonry
**Live product:** https://commonry.app · https://forum.commonry.app
**Issue:** GIV-503

---

## 1. Executive Summary

Commonry is a deployed, FOSS spaced-repetition learning platform positioned as
"educational infrastructure" under the Give Protocol Foundation. The product
has real surface area (auth, FSRS scheduling, public deck commons, integrated
Discourse community, stats/leaderboards, learning-analytics instrumentation,
a 3D globe hero) and a credible North Star — *"errors as diagnostic data"* /
data-commons for learning research.

**Headline finding:** *Engineering momentum has stalled.* The repository
shipped substantive features through 2026‑03‑28, then went quiet. The last
~60 days are essentially Dependabot-only, and a backlog of 16 open dependency
PRs has accumulated since 2026‑04‑20 with no merges. There are **0 open
non-bot issues** — meaning no public roadmap, no triaged user feedback, and no
visible work queue for external contributors. The README's FOSS pitch is
undermined by an *unresolved license* ("Pending"), a stale tech-stack claim
(README says Next.js 14; codebase is Vite 8 + React 19 SPA + Express), and a
stale `package.json` `repository` URL (still points to `GiveProtocol/AestheticAnki`).

**Verdict:** *Healthy product, unhealthy delivery cadence.* The platform is
shippable and live, but is drifting toward "open-source theatre" — public repo,
no public roadmap, no contributing guide, no public license. We need a 2-week
re-focus to (a) close the dep-PR backlog, (b) finalize the license, (c)
publish a roadmap on GitHub Issues, and (d) ship the two auth gaps blocking
new-user acquisition.

---

## 2. Product Status Snapshot

| Dimension | Status | Evidence |
|---|---|---|
| Live deployment | ✅ Live | README badge, commonry.app + forum.commonry.app |
| Tech stack reality | ⚠️ Doc-drift | Vite 8 + React 19 + Express + Postgres (README says "Next.js 14") |
| Activity (last 60d) | 🟠 Dependabot-only | 0 feature commits since 2026‑03‑28 |
| PR hygiene | 🔴 Stale | 16 open Dependabot PRs sitting since 2026‑04‑20 |
| Public roadmap | 🔴 Missing | 0 open GitHub issues |
| Licensing | 🔴 Unresolved | README: "FOSS (Pending)"; `package.json`: `ISC` — contradictory |
| Repo metadata | 🟠 Stale | `repository.url` still `GiveProtocol/AestheticAnki.git` |
| Contributor onramp | 🔴 Missing | No `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue templates |
| Tests / CI signal | 🔴 Weak | No tests directory in `src/`; commit history dominated by Prettier/DeepSource autofixes |

---

## 3. Feature Surface (what's actually built)

**For learners (live in `src/`):**

- **Auth** — JWT + bcrypt signup/login, AuthGate, ProfileView, email-verification view scaffolded (`src/components/AuthGate.tsx`, `EmailVerificationView.tsx`, `add-email-verification.sql`).
- **FSRS study loop** — Free Spaced Repetition Scheduler core in `src/core/scheduler`, `useSRS` hook, `StudyView` + `StudyCard`.
- **Plot dashboard** (personal study space) — `src/components/plot/` with `PlotGreeting`, `TodaysFocus`, `MomentumCard`, `MilestoneProgress`, `PersonalInsight`, `usePlotData` hook, `insightGenerators` util.
- **Harvest** (focused review) — surfaced via `StudyView` + `study/` components.
- **Anki import** — `import-mapping-service.ts`, `adm-zip`, `jszip`, `fzstd` deps.
- **Persistent preferences** — `useLocalStorage`, `useStudySettings`, `ThemeContext`.

**For the community:**

- **The Commons** — public deck browse/publish/flag/sort/tag (`src/components/commons/`).
- **The Square** — Discourse SSO integration (`discourse-sso.js`, `DISCOURSE_INTEGRATION*.md`, `SquareView.tsx`).
- **Git-like deck workflows** — `PublishDeckDialog`, `FlagDeckDialog` scaffolding; review-event capture (`review-event-routes.js`, `review-event-service.js`).
- **Tiered permissions** — referenced in README ("Canonical / Verified / Open"); enforcement surface lives across server routes.

**Instrumentation & research (the stated current focus):**

- `review-event-capture.ts` (client) + `review-event-routes.js`/`review-event-service.js` (server) — behavioral signal capture.
- `learning-analytics-routes.js`, `learning-analytics-service.js`.
- `research-consent-routes.js`, `research-export-routes.js`, `research-export-service.js`, `research-export-processor.js`, `data-anonymizer.js` — the opt-in research data commons pipeline.
- `card-analysis-service.js`, `card-analysis-routes.js`, `analysis-job-processor.js`, `keyword-dictionaries.js` — error-pattern analysis pipeline.

**Stats & leaderboards** — full implementation per `IMPLEMENTATION_SUMMARY.md`: daily + all-time aggregation via Postgres triggers, 4-metric leaderboard cache (cards / time / retention / streak), `StatsView.tsx`.

**Visual identity** — Terminal/retro-futurism design system (cyan `#00C8B0`, IBM Plex Mono), `Navigation` with `~/plot`, `~/commons`, `~/harvest`, `~/square` metaphors, 3D `NetworkGlobe` hero (Three.js).

**Other infra** — ULID prefixed IDs (`id-service.ts`, `test-id-service.ts`, `migration-to-ulid.sql`), sync (`sync-service.ts`, `sync-routes.js`, `SyncStatusIndicator.tsx`), email (`email-service.js`, nodemailer), rate-limiting, achievements scaffold (`add-sample-achievements.js`).

---

## 4. Activity & Delivery Cadence

**Totals:** 692 commits, 4 contributors (`civicmastery` 296, `drigobl` 148, `dependabot[bot]` 146, `deepsource-autofix[bot]` 113).

**Monthly commit volume:**

| Month | Commits |
|---|---|
| 2025-09 | 2 |
| 2025-10 | 164 |
| 2025-11 | 215 |
| 2025-12 | 53 |
| 2026-01 | 117 |
| 2026-02 | 26 |
| 2026-03 | 71 |
| 2026-04 | 44 |
| 2026-05 → 2026-06 | **0 substantive** (last 60d are bot bumps only) |

**Last substantive feature commit:** `e155864` (2026-03-28) — *"feat: add 3D globe hero, lazy-load views, update logos and favicons."*

**Commit-type distribution:** 146 `deps`, 91 `fix`, 32 `refactor`, **6 `feat`**, 1 `perf`. The repo skews heavily to maintenance and lint cleanup over feature delivery. The 2026‑03‑28 burst was largely a DeepSource autofix sweep (Prettier formatting + lint cleanup), not new product work.

---

## 5. Risks & Gaps (prioritized)

### P0 — blocks credibility as "open infrastructure"
1. **License unresolved.** README says "FOSS (Pending)" with AGPL‑3.0 anticipated; `package.json` declares `ISC`. External contributors cannot safely contribute under this ambiguity.
2. **No public roadmap.** Zero open issues. The README invites contribution but offers no triaged work. This kills the "open infrastructure" thesis.
3. **No contributor onramp.** Missing `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue/PR templates. README explicitly says "Detailed guidelines are forthcoming."

### P1 — blocks user acquisition / growth
4. **Auth gaps (per `IMPLEMENTATION_SUMMARY.md`):** *email verification not implemented*, *password reset not implemented*. Both required before serious user acquisition; both are real signup friction.
5. **Doc drift.** README claims **Next.js 14**; codebase is **Vite 8 + React 19 SPA + Express**. A first-impression credibility hit.
6. **Stale `package.json` metadata.** `repository.url` → `GiveProtocol/AestheticAnki.git`; `homepage` → same. Wrong org, wrong product name. Forum/registry tooling will mis-route.

### P2 — engineering health debt
7. **Stalled Dependabot backlog.** 16 open dep PRs since 2026‑04‑20; 0 merged in ~60 days. Includes security-adjacent updates (`dompurify`, `dotenv`, `adm-zip`, `react`).
8. **No test signal.** No tests directory; no CI in commits; quality controlled via DeepSource autofix and Prettier sweeps. Risky for a platform that handles user auth and a research data pipeline.
9. **Storage layer fragmentation.** `better-sqlite3` + `sqlite3` + `sql.js` + `pg` all present in `dependencies`. At least two of the SQLite libraries are likely redundant.

### P3 — product-strategy alignment
10. **"Data commons" thesis is half-built.** Research-export pipeline exists in code (`research-export-*.js`, `data-anonymizer.js`) but there is no public dataset release, no published anonymization policy, no consent UX walk-through in the README or `docs/`. The North Star feature is not visible to users.
11. **Three.js `NetworkGlobe` hero** is a bandwidth/perf cost on the landing page; worth measuring against the stated ADHD-friendly / low-stimulation value.

---

## 6. Recommendations (next 2-week sprint)

| # | Action | Owner | Deliverable |
|---|---|---|---|
| 1 | Pick the license. AGPL‑3.0 per README intent. Update `LICENSE`, `package.json` `license`, README badge. | Foundation legal + CPO | License finalized, badge green |
| 2 | Triage the 16 Dependabot PRs: batch-merge safe minors, close superseded. | CTO | PR backlog ≤ 3 |
| 3 | Fix README: replace "Next.js 14" with actual stack; remove "forthcoming" placeholders by pointing at real docs. | CPO + CTO | README v2 merged |
| 4 | Fix `package.json` `repository.url` and `homepage` to `GiveProtocolFoundation/Commonry`. | CTO | One-line PR |
| 5 | Add `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, GH issue templates (bug / feature / deck-correction). | CPO | Files merged |
| 6 | Open a public roadmap as GH issues, milestones = quarters. Convert the README "Future Roadmap" bullets into seeded issues. | CPO | ≥ 12 public issues, 2 milestones |
| 7 | Ship email verification + password reset (auth gaps). | CTO | Both flows live |
| 8 | Publish one anonymized "data commons" preview (stats only, no PII) to validate the North Star. | CPO + CTO | Public dataset link or RFC |
| 9 | Decide on a single SQLite library; remove the other two. | CTO | One-PR cleanup |
| 10 | Stand up a minimal CI: lint + typecheck + smoke test on PR. | CTO | GH Actions green badge |

---

## 7. Metric ownership (North Star tracking)

The North Star per README is *"genuine learning outcomes"* expressed via the
data-instrumentation layer. Recommend the following measurable proxies once
the research pipeline is unblocked:

- **D7 retention** of new signups completing ≥1 study session.
- **Median retention rate** across active users (already computed in `user_statistics_total`).
- **Cards per active learner per week.**
- **% of decks contributed by non-staff accounts** — measures whether the
  "Commons" thesis is real.
- **Forum-to-app activation rate** (Discourse SSO → first study session).

None of these are dashboarded today. Operationalizing them is the next
piece of product work after the cleanup sprint above.

---

## 8. Disposition

This audit is the deliverable for GIV‑503. The recommendations above are
candidates for follow-up child issues; they are **not** auto-created here so
that the CEO/Foundation can prioritize before commitment. If desired, I can
spin them up as a P0/P1/P2-tagged batch on request.

— CPO, 2026-06-13

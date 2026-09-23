# Beginner ITR SaaS PRD

## Verdict
Build this as a guided filing coach, not as a generic tax dashboard. The winning product is: "I do not know anything about ITR. Tell me exactly what to do, collect my data safely, explain red flags, generate my ITR JSON, and walk me through the government portal upload."

Current repo fit: strong prototype, not yet production SaaS. The core ingredients exist: auth, protected routes, filing session, tax calculators, ITR JSON generation, crypto import, Schedule VDA, and Supabase persistence. The main gap is product coherence: multiple wizards and multiple crypto schemas compete for ownership.

## Current Stack Rating
Overall: 7/10.

Frontend: 8/10. React, Vite, TypeScript, shadcn/Radix, Tailwind, TanStack Query are a strong SaaS stack. Build passes. UX needs consolidation and code splitting.

Backend: 5.5/10. Supabase is right for a lean SaaS, but schema drift is high. Live DB is missing tables referenced by code. RLS exists, but grants are too broad.

Tax/Crypto Engine: 7/10. The crypto engine has meaningful tests and handles FIFO, TDS, prior-year lots, and 115BBH rules. Some CoinDCX parser tests were failing and were fixed as part of this review.

Product Readiness: 5/10. There are strong screens, but not yet one obvious beginner journey from "create account" to "filed and e-verified".

## Ideal First Customer
The founder files their own AY 2026-27 return first. Profile:
- Indian resident individual.
- Beginner to ITR filing.
- Has salary or other simple income.
- Has CoinDCX crypto trades.
- Needs exact portal guidance after JSON generation.

## North Star Flow
1. Create account.
2. Choose financial year and assessment year.
3. Answer a plain-English income/source interview.
4. Connect or upload evidence:
   - PAN/profile fields.
   - Form 16.
   - AIS/Form 26AS.
   - CoinDCX order history, Insta history, and TDS CSVs.
   - Bank account for refund.
5. Data coverage check shows what is complete, missing, or risky.
6. System selects likely ITR form.
7. Regime comparison explains old vs new with rupee impact.
8. Review Gate blocks unsafe filing and explains fixes.
9. Generate computation report and ITR JSON.
10. Guided upload checklist for incometax.gov.in.
11. Mark filed/e-verified with acknowledgement number.

## Product Principles
- Beginner language first; tax section numbers second.
- One question per decision.
- Every number needs evidence or an explicit manual override.
- Never hide uncertainty; classify it as blocking, warning, or informational.
- Crypto is a module inside filing, not a separate product island.
- Final output is not "tax calculated"; final output is "return filed and e-verified".

## Chosen Architecture
Use `FilingSession` as the external interface for the filing product. All modules push normalized data into one filing session:
- Crypto calculator pushes `cryptoVDA`.
- Form 16 parser pushes `salary`.
- AIS parser pushes `otherSources`, `tds`, and reconciliation warnings.
- Manual interview updates the same session.
- ITR JSON generator reads only from the filing session.

Retire `SmartFilingWizard` as the product spine after its useful UI pieces are migrated into `GuidedFiling`. Keeping both creates duplicate state, duplicate form logic, and beginner confusion.

## MVP Scope
Must-have:
- Auth and resume.
- Beginner onboarding interview.
- Single guided filing route.
- CoinDCX CSV import and data coverage.
- Crypto tax computation and Schedule VDA export/sync.
- Salary/other income/deductions/manual TDS entry.
- Old vs new regime comparison.
- Review Gate with blockers and warnings.
- Computation report and ITR JSON.
- Government portal upload and e-verify checklist.

Not MVP:
- CA marketplace.
- GST center.
- Family dashboard.
- Foreign assets beyond warning/manual capture.
- Multi-exchange API sync beyond CoinDCX CSV/API proof.

## Implementation Plan
Phase 1: Stabilize trust.
- Fix parser/test failures in CoinDCX import.
- Apply schema repair migration to align live DB with app code.
- Revoke unnecessary `anon` grants and harden security-definer functions.
- Add one smoke test for the beginner flow.

Phase 2: Consolidate filing UX.
- Make `/guided` the only filing path.
- Move useful `SmartFilingWizard` content into smaller guided-step modules.
- Add a "first-time filer" checklist before personal info.
- Add bank details step; current validation requires it but the visible guided steps do not collect it clearly enough.

Phase 3: Crypto-to-ITR reliability.
- Make CoinDCX import show exact coverage: order, Insta, TDS, FY range.
- Block "send to ITR" until data quality is clean or user accepts a specific warning.
- Persist Schedule VDA rows as evidence attached to the filing session.

Phase 4: Filing completion.
- Improve JSON validation against required fields.
- Add upload checklist with acknowledgement/e-verification capture.
- Store generated JSON snapshot and computation report in `itr_filings`.

## Industry-Standard Improvements
- Secrets: rotate leaked DB password and HF token; remove sensitive tokens from committed/local shared files.
- Security: least-privilege grants, RLS `WITH CHECK`, security-definer `search_path`, audit log append-only policies.
- Performance: index all FK columns and common `(user_id, financial_year)` query paths.
- Reliability: no live feature should depend on tables absent from migrations or generated types.
- Testing: protect parser fixtures, tax engine fixtures, and one e2e happy path.
- Observability: capture import failures, validation failures, and JSON generation errors with redacted payload IDs.
- Architecture: one filing session module as the interface; parsers/calculators are implementations behind it.

## Open Risks
- ITR JSON schema accuracy needs official utility validation before claiming production filing.
- CoinDCX API credentials should not be stored raw; use Supabase Vault or encrypted server-side storage.
- Tax law constants must be versioned by assessment year.
- Live Supabase migration history appears out of sync with repository migrations.

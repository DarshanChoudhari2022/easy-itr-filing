# Filing Flow Audit and Automation Plan

Reviewed: 23 September 2026. Target: FY2025-26 / AY2026-27.

## Verdict

This is an assisted preparation application, not a production-certified filing service for all taxpayer profiles. No government return was submitted during this work. A passing test suite does not establish correctness of a customer's complete return.

## Implemented Journey

1. Sign in to EasyITR, separately from the Income Tax portal account.
2. Answer whether the government account exists. Follow registration or password-recovery steps if needed; confirm login, PAN requirements and bank validation.
3. Collect personal details and income sources. Recommend a form conservatively; route unsupported profiles to specialist review.
4. Import actual crypto records. Carry historical acquisition data forward, reconcile Schedule VDA, and confirm coverage across exchanges and wallets.
5. Reconcile evidence and tax credits. Missing TDS evidence is not replaced with an assumed deduction.
6. Compare tax regimes and review the draft. Draft JSON is explicitly not a validated government upload file.
7. Prepare and validate on the official portal; review final liability including interest and late fees, pay where necessary and submit.
8. Record acknowledgement and submission date. E-verification is a separate state; processing is later. Tracking is self-reported, not a government status check.

## Defects Corrected

- Removed simulated AIS fetch, audit pack and filing-success behavior from the e-filing page.
- Removed hard-coded crypto dashboard and auto-fill fallbacks on failed requests.
- Authenticated crypto sync now requires Schedule VDA and successful quality checks; high/critical warnings block it.
- Removed theoretical 1% TDS credit and exchange-charge deductions from the calculation paths changed here.
- Missing acquisitions block quick-import and server computation. The server no longer guesses stablecoin acquisition cost or matches a sale with a future buy.
- Server trade-history reads paginate; prior-disposal query failures block computation.
- Non-INR CoinDCX API trades and crypto-denominated fees require valuation review instead of monthly/live-rate assumptions in spot normalization. CSV ingestion no longer invents default INR rates.
- Preparation gates require portal readiness and reconciliation, and block unsupported profiles and missing/inconsistent crypto schedules.
- Detailed form routing covers non-resident/HUF and restricted presumptive-business profiles; corrected reversed cash/digital 44AD guidance.

## Remaining Release Blockers

- Approved ERI access, taxpayer consent, government prefill, official schema validation, submission and e-verification APIs are not integrated. Do not automate login/OTP handling as a substitute.
- Official AY-specific ITR schemas and business validation rules must be implemented and tested against portal/utility acceptance. The current generator uses legacy draft structures.
- Business, non-crypto capital gains, agricultural integration, foreign assets, HUF/non-resident and complex deductions need comprehensive verified schedules and computation fixtures. These profiles are now marked as requiring specialist review.
- Full return interest, late fees, surcharge/marginal relief and special-income interactions need independent tax review. The portal remains the final computation check.
- All import routes need a common evidence-backed historical INR valuation service; reward/gift/derivative and crypto-fee cases need classification and reconciliation. Spot API access alone cannot prove complete history or TDS.
- Existing saved crypto computations must be recomputed from source records after this change. A quality score alone cannot certify old calculations.
- Live authenticated Supabase saves/RLS, real CoinDCX pagination and reconciliation against complete customer statements were not verified in this change. Local tests use synthetic fixtures; no real taxpayer data or credentials are embedded in them.
- Consolidate the remaining independent calculation engines, add versioned computation provenance and transactional server persistence, and test cross-device saves and concurrent imports before production release.

## Automation Milestones

1. Validate a narrowly defined resident-individual salary/interest/INR-spot-crypto profile with reconciled source documents and independent expected returns.
2. Implement AY-specific schemas, all supported schedules, decimal-safe monetary processing and statutory validation fixtures; validate exports with the official utility.
3. Integrate approved ERI authentication, explicit taxpayer consent and prefill with encrypted server-side credentials and audit records.
4. Implement idempotent submission, receipts, status polling and taxpayer-controlled e-verification. Mark submitted/verified only from government responses.
5. Expand supported taxpayer profiles only after form-specific fixture and acceptance coverage.

## Official Sources

- [Taxpayer registration](https://www.incometax.gov.in/iec/foportal/help/how-to-register-e-filing)
- [ITR-2 online filing](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/itr-2/itr-2-UM)
- [VDA treatment and Schedule VDA](https://www.incometax.gov.in/iec/foportal/help/FileITR-2Online-FAQ)
- [Verification timeline](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/itr-v-faqs30-days-timeline-e-verification-returns-faq)
- [ERI API specifications](https://www.incometax.gov.in/iec/foportal/api-specifications)
- [Official return downloads and schemas](https://www.incometax.gov.in/iec/foportal/newdownloads/income-tax-returns)

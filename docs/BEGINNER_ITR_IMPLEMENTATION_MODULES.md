# Beginner ITR SaaS Implementation Modules

This plan turns EasyITR into a beginner-first Indian ITR filing SaaS, with crypto tax as the first deep wedge.

## Verdict

The current stack is a solid MVP base: React, TypeScript, Vite, Supabase, RLS, a local tax engine, and a crypto transaction parser. It is not yet production-ready for real filing because filing accuracy depends on data coverage, reconciliation, review gates, audit trails, and secure access controls. The right path is to build the product as guided modules, where each module produces evidence and validations consumed by the final review gate.

Current stack rating: 7/10.

It is strong for fast product development and user onboarding. It needs stronger compliance modeling, automated tests around tax rules, observability, data import coverage, and security hardening before it should be trusted for paid production filing.

## Module 1: Account And Filing Workspace

Goal: A new user can create an account, start a filing session for the right financial year, and understand the whole journey.

Status: Partially implemented.

Implemented now:

- Beginner launchpad in the guided filing flow.
- Shared guidance model in `src/lib/filing-guidance.ts`.
- Filing module status cards for identity, income, evidence, computation, and output.

Next requirements:

- Create a first-run onboarding checklist after signup.
- Explain why account creation matters for saved filing evidence.
- Add session recovery and autosave confidence states.

## Module 2: Identity And Portal Readiness

Goal: A beginner enters PAN, name, contact, address, residential status, and filing capacity without needing to know portal terminology.

Required behavior:

- Validate PAN format, mobile, pincode, date of birth, and state.
- Show field-level help that maps each answer to portal/ITR meaning.
- Mark identity readiness only when minimum filing fields are complete.

## Module 3: Income Source Interview

Goal: Convert plain-language answers into ITR form selection and relevant schedules.

Required behavior:

- Ask about salary, house property, stocks, mutual funds, crypto, business/freelance, interest, dividends, foreign assets, and agriculture.
- Recommend ITR-1, ITR-2, ITR-3, or ITR-4 with explainable reasons.
- Warn when the selected income source makes a simpler ITR form unavailable.

## Module 4: Evidence And Imports

Goal: Every material tax number is backed by a source document, import, or explicit manual answer.

Required behavior:

- Salary: Form 16 values and TDS.
- AIS/Form 26AS: interest, dividends, TDS, TCS, advance tax, and self-assessment tax.
- Capital gains: broker reports.
- Crypto: CoinDCX orders, Insta history, TDS, and coverage status.
- Business/freelance: gross receipts, presumptive section, expenses where applicable.

## Module 5: Crypto Tax Engine

Goal: Accurately compute Indian VDA tax for the user’s CoinDCX history.

Required behavior:

- Validate complete financial-year coverage before final reliance.
- Normalize CoinDCX order and Insta history files.
- Compute FIFO acquisition cost for each transfer.
- Separate taxable gains, non-deductible losses, sale consideration, and 194S TDS.
- Generate Schedule VDA-ready rows with acquisition/transfer dates.

## Module 6: Deductions And Exemptions

Goal: Help beginners claim eligible deductions without overclaiming.

Required behavior:

- Old-regime deduction entry with caps and warnings.
- HRA, home loan interest, 80C, 80D, 80CCD(1B), 80TTA/TTB, 80G and similar sections.
- Explain when new regime makes a deduction irrelevant.

## Module 7: Tax Computation And Regime Decision

Goal: Compare old and new regimes clearly before final filing.

Required behavior:

- Compute gross total income, deductions, taxable income, slab tax, surcharge, cess, VDA tax, credits, refund/payable, and challan need.
- Show a trace for each major number.
- Recommend a regime only with the reason and savings amount.

## Module 8: Review Gate And Filing Output

Goal: Prevent unsafe filing and produce a filing-ready package.

Required behavior:

- Block final output when required fields, evidence, or crypto coverage are missing.
- Show warnings separately from blockers.
- Generate ITR JSON, computation statement, challan guide, and portal handoff checklist.
- Guide upload and e-verification on the Income Tax portal.

## Module 9: Production Operations

Goal: Make the SaaS secure, fast, and observable enough for real users.

Required behavior:

- Keep RLS enabled on all user data.
- Restrict anonymous database writes.
- Add audit logs for generated outputs and source evidence changes.
- Add performance indexes for dashboard, filing sessions, crypto imports, and review states.
- Add error monitoring, backup strategy, and tax-rule versioning.

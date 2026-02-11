# Implementation Plan: TaxMitra — India's Personal Tax Assistant

## 1. Executive Summary

TaxMitra is a production-grade, SaaS tax filing platform for the Indian market covering Income Tax (ITR-1 to ITR-4), Crypto/VDA (Section 115BBH), GST, and AIS/TIS reconciliation. The product is designed for three personas: salaried professionals, freelancers/businesses, and crypto investors.

## 2. System Architecture

### 2.1 Core Stack
- **Frontend**: React (Vite) + TypeScript + Tailwind CSS + Shadcn UI
- **State Management**: TanStack Query (server state) + React Context (client state)
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **AI**: Hugging Face Inference API (Mistral 7B) for tax guidance chatbot
- **PDF Processing**: pdfjs-dist v4.0.379 for Form 16 / AIS extraction

### 2.2 Data Model (v4 Production Schema)
- **profiles**: Extended with KYC fields (PAN, DOB, gender, address, mobile)
- **income_sources**: All 5 heads of income with AY-based partitioning
- **deductions**: Chapter VI-A sections (80C through 80U)
- **crypto_trades**: Individual trades with exchange, TDS, and metadata
- **form16_data**: Parsed Form 16 data per employer
- **itr_filings**: Filing history with JSON snapshots
- **bank_details**: Bank accounts for refund processing
- **ca_assignments / ca_comments**: Expert plan CA workflow

### 2.3 Feature Gating (Plan Guard)
- **Free**: ITR-1, basic calculator, 3 AI queries/day, 1 return/AY
- **Pro** (₹999/yr): All ITR forms, crypto engine, full AIS, unlimited AI
- **Expert** (₹4,999/yr): Dedicated CA review, filing within 48 hours

## 3. Completed Fixes (Current Session)

### ✅ Fix 1: AY 2026-27 Tax Configuration
- Updated `src/lib/tax-config.ts` with Budget 2025 slabs
- New regime: ₹0-4L (nil), ₹4-8L (5%), ₹8-12L (10%), ₹12-16L (15%), ₹16-20L (20%), ₹20-24L (25%), ₹24L+ (30%)
- Enhanced ₹12L rebate threshold with ₹60,000 amount
- Config-driven surcharge slabs with new regime cap

### ✅ Fix 2: Tax Calculation Engine Rewrite
- File: `src/lib/tax-calculation.ts` — complete rewrite
- Correct rebate u/s 87A with marginal relief
- Surcharge with marginal surcharge relief
- Updated capital gains (STCG 20%, LTCG 12.5% from AY 2025-26)
- Section 44AD / 44ADA presumptive income calculator
- Enhanced regime comparison with detailed reasoning

### ✅ Fix 3: Production Database Schema (v4)
- File: `supabase/schema_v4_production.sql`
- All new tables with UUID primary keys, RLS policies, and indexes
- Resolves critical "ephemeral data" issue — all income, deductions, crypto, and filing data now persists

### ✅ Fix 4: Plan Guard (Feature Flags)
- File: `src/lib/plan-guard.ts`
- Feature matrix, rate limits, plan info, and utility functions
- `canAccess()`, `isWithinLimit()`, `getRequiredPlan()` APIs

### ✅ Fix 5: PDF Text Extractor
- File: `src/lib/pdf-extractor.ts`
- Uses pdfjs-dist for client-side PDF parsing
- Handles password-protected PDFs, image-based detection
- Auto-detects document type (Form 16, AIS, 26AS)
- Text cleanup for reliable downstream parsing

### ✅ Fix 6: Comprehensive Validators
- File: `src/lib/validators.ts`
- PAN, Aadhaar, IFSC, mobile, pincode, GSTIN, TAN, email, account number
- Indian states list, AY utilities, INR formatting
- Profile KYC validation with field-level errors

### ✅ Fix 7: Upgrade Prompt Component
- File: `src/components/UpgradePrompt.tsx`
- Reusable UI for plan-gated features (card & inline variants)
- Shows required plan, benefits, pricing, and CTA

### ✅ Fix 8: Enhanced AI Service
- File: `src/lib/ai-service.ts` — complete rewrite
- User tax context injection (income, regime, AY, crypto)
- Intent detection (tax summary, regime, crypto, deductions, filing, AIS)
- Guardrails, disclaimer, improved prompt engineering
- Fallback responses for common queries when API is down

### ✅ Fix 9: Supabase Data Service
- File: `src/lib/supabase-data-service.ts`
- Complete CRUD for: income sources, deductions, bank details, crypto trades, Form 16 data, ITR filings, profile KYC, user plan
- All operations authenticated with `getUser()`

### ✅ Fix 10: TaxChatbot Context Integration
- Updated `src/components/TaxChatbot.tsx`
- Accepts `UserTaxContext` prop for personalized answers
- AI disclaimer shown, updated quick questions

### ✅ Fix 11: Onboarding Wizard (KYC Capture)
- File: `src/components/OnboardingWizard.tsx`
- 5-step wizard: Identity → Personal → Address → Contact → Confirm
- Full validation at each step, animated transitions
- Routes: `/onboarding` (added to App.tsx)

### ✅ Fix 12: Bank Details Manager
- File: `src/components/BankDetailsManager.tsx`
- CRUD for bank accounts with IFSC/account validation
- Primary/refund account designation, masked display

### ✅ Fix 13: Enhanced ITR JSON Generator
- Updated `src/lib/itr-json-generator.ts`
- `computeTax()` now uses centralized `YEAR_CONFIGS` (config-driven)
- ITR-3 enhanced with P&L + Balance Sheet schedules
- ITR-4 enhanced with proper 44AD (6% digital + 8% cash) and 44ADA (50%)
- Added `ScheduleVDAEntry` interface
- Comprehensive form-specific validation (turnover limits, form eligibility)

### ✅ Fix 14: Dashboard AI Context
- Dashboard now passes income, deductions, crypto, AY to AI service

### ✅ Fix 15: Landing Page SEO Update
- Hero badge updated to "AY 2026-27 • Budget 2025 Ready"
- Marketing copy updated with ₹12L rebate and Schedule VDA mentions

## 4. Remaining Work (Prioritized)

### 🔲 Phase 2 (Next Session)
1. **Form 16 Parser Integration** — Wire `pdf-extractor.ts` → `form16-parser.ts` → `supabase-data-service.ts`
2. **AIS PDF Upload & Reconciliation UI** — Upload PDF, parse, show conflicts with user data
3. **Profile/KYC Page** — Full settings page with KYC editing (wired to Supabase)
4. **Plan Guard Enforcement** — Wire `canAccess()` checks into Crypto, AIS, and E-File pages
5. **Exchange API Connections** — Real-time crypto import from WazirX, CoinDCX, Binance

### 🔲 Phase 3 (Future)
6. **Business Income Screens** — P&L, Balance Sheet, GST Reconciliation for ITR-3
7. **CA Expert Workflow** — Assignment, comments, review, and filing by CA
8. **Razorpay/Stripe Integration** — Payment processing for Pro and Expert plans
9. **E-Verification** — Aadhaar OTP / DSC / Send to CPC flow
10. **Mobile Optimization** — Responsive layouts for all components

## 5. File Inventory (New/Modified)

| File | Status | Purpose |
|------|--------|---------|
| `src/lib/tax-config.ts` | Modified | AY 2026-27 slabs, rebate, surcharge |
| `src/lib/tax-calculation.ts` | Rewritten | Core tax engine with marginal relief |
| `src/lib/plan-guard.ts` | New | Feature gating per plan |
| `src/lib/pdf-extractor.ts` | New | PDF text extraction via pdfjs-dist |
| `src/lib/validators.ts` | New | Indian tax document validators |
| `src/lib/ai-service.ts` | Rewritten | Context-aware AI with fallbacks |
| `src/lib/supabase-data-service.ts` | New | Supabase CRUD layer |
| `src/lib/itr-json-generator.ts` | Modified | Config-driven tax, enhanced ITR-3/4 |
| `src/components/UpgradePrompt.tsx` | New | Plan-gate UI component |
| `src/components/OnboardingWizard.tsx` | New | 5-step KYC wizard |
| `src/components/BankDetailsManager.tsx` | New | Bank account CRUD UI |
| `src/components/TaxChatbot.tsx` | Modified | Context-aware AI chat |
| `src/pages/Dashboard.tsx` | Modified | AI context integration |
| `src/pages/Index.tsx` | Modified | AY 2026-27 marketing copy |
| `src/App.tsx` | Modified | Added /onboarding route |
| `supabase/schema_v4_production.sql` | New | Production database schema |
| `docs/TAXMITRA_COMPLETE_AUDIT.md` | New | Product audit Part 1 |
| `docs/TAXMITRA_COMPLETE_AUDIT_PART2.md` | New | Product audit Part 2 |

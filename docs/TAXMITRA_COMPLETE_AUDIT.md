# TaxMitra — Complete Product Audit & Implementation Blueprint

**Date:** February 11, 2026  
**Auditor Role:** Senior Full-Stack Architect, Indian Tax Domain Consultant, UX Writer  
**Live Site:** https://easy-itr-filing.vercel.app/  
**Brand:** TaxMitra | Your Personal Tax Assistant for India  
**Stack:** React + TypeScript + Vite | Shadcn/UI + Tailwind | Supabase (Auth, DB, Storage) | Recharts | jsPDF

---

## TABLE OF CONTENTS

1. [Product Gaps & Must-Have Fixes](#1-product-gaps--must-have-fixes)
2. [Feature Implementation Blueprint](#2-feature-implementation-blueprint)
3. [Rewritten Marketing Copy](#3-rewritten-marketing-copy)
4. [User Tutorials](#4-user-tutorials)

---

# 1. PRODUCT GAPS & MUST-HAVE FIXES

## 1.1 Persona: Salaried (ITR-1, ITR-2)

### Must-Have for Launch
| # | Gap | Severity | Current State |
|---|-----|----------|---------------|
| 1 | **Form 16 parser is text-only** — no actual PDF upload/extraction pipeline. `form16-parser.ts` expects raw text, but there is no PDF-to-text integration (no `pdf.js`, `pdfplumber`, or OCR). Users cannot actually upload a PDF and get data extracted. | 🔴 Critical | Function exists but unusable without PDF library |
| 2 | **No income_sources or deductions DB tables** — The `schema.sql` has `profiles`, `gst_invoices`, `user_roles` but **no table for salary, house property, other income, or deductions**. All filing wizard data is ephemeral (useState only). Refresh = data lost. | 🔴 Critical | Data not persisted |
| 3 | **AIS parser is JSON-only** — `ais-parser.ts` can parse structured JSON but there's no PDF upload or portal-fetch flow. Real users download AIS as PDF from the IT portal. | 🟡 High | Parser exists, no upload flow |
| 4 | **No 26AS integration** — Not even a stub. 26AS is critical for TDS credit verification. | 🟡 High | Missing entirely |
| 5 | **Tax config for AY 2026-27** has identical new-regime slabs to AY 2025-26 — needs verification against Union Budget 2025. The new regime slabs for FY 2025-26 (AY 2026-27) should reflect the latest budget changes (₹0-₹4L: nil, ₹4-8L: 5%, etc., rebate up to ₹12L). | 🔴 Critical | Possibly incorrect slabs |
| 6 | **Rebate 87A logic incomplete** — `tax-calculation.ts` applies rebate but doesn't handle the new regime's enhanced ₹25,000 rebate (or ₹12L threshold for AY 2026-27). | 🟡 High | Needs AY-specific logic |
| 7 | **No bank details capture** — ITR JSON needs bank account for refund but there's no UI to collect IFSC, account number, bank name. | 🟡 High | Missing UI |
| 8 | **Profile is bare** — Only `full_name`, `email`, `pan_number` in DB. Missing: DOB, gender, father's name, address, state, mobile — all required for ITR JSON generation. | 🔴 Critical | Schema incomplete |

### Nice-to-Have
- Previous year return import/auto-fill
- Salary slip OCR (beyond Form 16)
- HRA optimizer with rent receipt upload
- Multi-AY data locking (prevent edits after filing)

## 1.2 Persona: Business/Freelancer (ITR-3, ITR-4)

### Must-Have for Launch
| # | Gap | Severity | Current State |
|---|-----|----------|---------------|
| 1 | **No presumptive taxation module** — ITR-4 (44AD/44ADA) fields exist in `SmartFilingWizard.tsx` but there's no turnover-to-presumptive-income auto-calculation (8%/6% for 44AD, 50% for 44ADA). | 🔴 Critical | UI fields exist, logic missing |
| 2 | **No P&L / Balance Sheet screens** — ITR-3 requires profit & loss and balance sheet data. Currently zero implementation. | 🟡 High | Missing entirely |
| 3 | **GST Center is invoice-only** — `GSTCenter.tsx` handles invoice upload/matching but has no GSTR-3B/1 summary import or turnover reconciliation with ITR. | 🟡 High | Partial |
| 4 | **ITR-3 and ITR-4 JSON generators are stubs** — `generateITR3Json` and `generateITR4Json` produce skeleton JSON without business income schedules, P&L, or balance sheet sections. | 🔴 Critical | Placeholder only |

### Nice-to-Have
- Books of accounts integration
- Depreciation calculator
- Professional tax certificate upload
- TAN-based TDS reconciliation for business

## 1.3 Persona: Crypto/VDA Investors

### Must-Have for Launch
| # | Gap | Severity | Current State |
|---|-----|----------|---------------|
| 1 | **Exchange API integrations are code-only** — `wazirx-api.ts`, `coindcx-api.ts`, `binance-api.ts` exist but are **never called from UI**. The crypto page only uses CSV import. | 🟡 High | Code exists, not wired |
| 2 | **No Schedule VDA JSON output** — The crypto engine calculates gains but doesn't produce the actual ITD-format Schedule VDA structure for the ITR JSON. Only PDF/CSV reports are generated. | 🟡 High | Report ≠ filing-ready |
| 3 | **Trades stored in localStorage only** — `Crypto.tsx` uses `useState`/`useMemo` and Supabase queries but there's no `crypto_trades` table in the deployed schema. | 🔴 Critical | No persistence layer |
| 4 | **FIFO engine works but LIFO/HIFO are untested** — `selectLotIndex` in `crypto-engine.ts` has logic for all three methods but only FIFO is used by default. | 🟢 Low | Code exists |
| 5 | **No INR conversion for foreign exchanges** — Binance trades are in USDT/BTC but there's no FX rate lookup to convert to INR for tax. | 🟡 High | Missing |

### Nice-to-Have
- DeFi protocol support (Uniswap, Aave)
- NFT transaction handling
- Blockchain address import
- Tax-loss harvesting suggestions
- Multi-year portfolio tracking

## 1.4 Cross-Cutting Gaps

| # | Gap | Severity |
|---|-----|----------|
| 1 | **No plan/subscription enforcement** — Pricing tiers exist on landing page but zero feature-flag logic. Free users can access everything. | 🔴 Critical |
| 2 | **No KYC/PAN validation** — PAN format (ABCDE1234F) is not validated. No Aadhaar linking flow. | 🟡 High |
| 3 | **AI chatbot has no user context** — `ai-service.ts` sends question to Mistral-7B raw, with no user income/filing data injected. | 🟡 High |
| 4 | **No CA workflow** — "Expert Assisted" plan is listed but zero backend for CA assignment, review, comments, or approval. | 🟡 High |
| 5 | **Auth is email+password only** — No OTP, no Google/OAuth, despite being mentioned in marketing. | 🟡 High |
| 6 | **No data export/download** — Users can't download their filing data or computation sheet beyond ITR JSON. | 🟢 Low |
| 7 | **No filing history** — No `itr_filings` table to track submission snapshots per AY. | 🟡 High |
| 8 | **Landing page stats section is commented out** — Stats (₹350Cr+, 99.9%, etc.) are HTML-commented. Inconsistent user counts (75K in meta, 85K in hero). | 🟢 Low |

---

# 2. FEATURE IMPLEMENTATION BLUEPRINT

## Feature 1: Auth & Onboarding

### Current State
- Supabase email+password auth via `useAuth.tsx`
- Basic login/signup in `Auth.tsx`
- Profile table has only `full_name`, `email`, `pan_number`

### Data Model (Enhanced)
```sql
-- Extend profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
  date_of_birth date,
  gender text CHECK (gender IN ('M', 'F', 'O')),
  father_name text,
  mobile text,
  aadhaar_last4 text,
  flat_no text,
  building text,
  street text,
  locality text,
  city text,
  state text,
  pincode text,
  country text DEFAULT 'India',
  resident_status text DEFAULT 'RES' CHECK (resident_status IN ('RES', 'NRI', 'RNOR')),
  filing_status_type text DEFAULT 'INDIVIDUAL' CHECK (filing_status_type IN ('INDIVIDUAL', 'HUF')),
  current_plan text DEFAULT 'free' CHECK (current_plan IN ('free', 'pro', 'expert')),
  plan_valid_until timestamptz,
  onboarding_completed boolean DEFAULT false;

-- Tax profiles (self, spouse, HUF)
CREATE TABLE public.tax_profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_name text NOT NULL,
  relation text DEFAULT 'self',
  pan_number text NOT NULL,
  full_name text NOT NULL,
  date_of_birth date,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### API Endpoints
| Method | Path | Input | Output |
|--------|------|-------|--------|
| POST | `/auth/signup` | email, password, fullName | session |
| POST | `/auth/login` | email, password | session |
| POST | `/auth/otp/send` | mobile | otpId |
| POST | `/auth/otp/verify` | mobile, otp | session |
| POST | `/auth/google` | googleToken | session |
| GET | `/profile` | — | profile object |
| PUT | `/profile` | all KYC fields | updated profile |
| POST | `/tax-profiles` | name, PAN, DOB, relation | tax_profile |
| GET | `/tax-profiles` | — | tax_profile[] |

### Frontend Flows
1. **Sign Up** → email/password or Google OAuth → Email verification
2. **Onboarding Wizard** (if `onboarding_completed = false`):
   - Step 1: PAN + Name (validate PAN format: `[A-Z]{5}[0-9]{4}[A-Z]`)
   - Step 2: DOB + Gender + Father's Name
   - Step 3: Address + Mobile
   - Step 4: Select AY + Regime preference
   - Step 5: Choose plan (Free/Pro/Expert)
3. **Dashboard redirect** after onboarding

### Key Validations
- PAN: regex `^[A-Z]{5}[0-9]{4}[A-Z]$`
- Mobile: 10-digit Indian number
- DOB: must be ≥ 18 years ago
- Pincode: 6-digit Indian postal code
- State: from official list of 28 states + 8 UTs

---

## Feature 2: Auto Form 16 Import

### Current State
- `form16-parser.ts` has comprehensive regex patterns for Part A and Part B
- `convertForm16ToFilingData()` maps to ITR schema
- **Missing:** PDF-to-text extraction, no `pdfjs-dist` or similar library

### Implementation Plan

#### Add PDF Library
```bash
npm install pdfjs-dist@4.0.379
```

#### New Service: `src/lib/pdf-extractor.ts`
```typescript
import * as pdfjsLib from 'pdfjs-dist';

export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((item: any) => item.str).join(' ') + '\n';
  }
  return fullText;
}
```

#### Data Model
```sql
CREATE TABLE public.form16_data (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_year text NOT NULL,
  employer_name text,
  employer_tan text,
  employer_pan text,
  gross_salary numeric(15,2) DEFAULT 0,
  exemptions jsonb DEFAULT '{}',
  deductions jsonb DEFAULT '{}',
  tds_deducted numeric(15,2) DEFAULT 0,
  parse_confidence numeric(3,2) DEFAULT 0,
  raw_text text,
  file_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, assessment_year, employer_tan)
);
```

#### Frontend Flow
1. Upload PDF → show loading spinner "Extracting data..."
2. Extract text → parse with `parseForm16()`
3. Show parsed results in editable form with confidence indicator
4. User reviews/corrects → Save to `form16_data` table
5. Auto-populate salary fields in filing wizard
6. **Fallback:** If confidence < 0.5, show manual entry form with helper prompts

#### Edge Cases
- Image-based PDFs: Show alert "This PDF appears to be scanned. Please enter details manually."
- Password-protected PDFs: Prompt for password
- Multi-employer: Support uploading multiple Form 16s per AY
- Part A only (no Part B): Partial extraction with warning

---

## Feature 3: Smart Regime Comparison (Old vs New)

### Current State
- `tax-calculation.ts` has `calculateTax()` and `compareRegimes()` — **functional**
- `RegimeComparison.tsx` renders side-by-side comparison — **functional**
- `tax-config.ts` has slab configurations per AY

### Must-Fix: AY 2026-27 Slabs (Union Budget 2025)
```typescript
// CORRECTED new regime slabs for AY 2026-27 (FY 2025-26)
"2026-27": {
    ay: "2026-27",
    fy: "2025-26",
    standardDeductionOld: 50000,
    standardDeductionNew: 75000,
    oldSlabs: [
        { min: 0, max: 250000, rate: 0 },
        { min: 250000, max: 500000, rate: 5 },
        { min: 500000, max: 1000000, rate: 20 },
        { min: 1000000, max: Infinity, rate: 30 },
    ],
    newSlabs: [
        { min: 0, max: 400000, rate: 0 },
        { min: 400000, max: 800000, rate: 5 },
        { min: 800000, max: 1200000, rate: 10 },
        { min: 1200000, max: 1600000, rate: 15 },
        { min: 1600000, max: 2000000, rate: 20 },
        { min: 2000000, max: 2400000, rate: 25 },
        { min: 2400000, max: Infinity, rate: 30 },
    ],
    rebate87ANewRegimeLimit: 1200000,  // New: full rebate if income ≤ ₹12L
    rebate87ANewRegimeAmount: 60000,   // Max rebate amount
    rebate87AOldRegimeLimit: 500000,
    rebate87AOldRegimeAmount: 12500,
}
```

### Enhanced Tax Engine Additions
```typescript
// Add to calculateTax():
// 1. Marginal relief when income marginally exceeds rebate threshold
// 2. Surcharge: 10% (50L-1Cr), 15% (1-2Cr), 25% (2-5Cr), 37% (>5Cr)
//    New regime cap: 25% max surcharge
// 3. Special rates: LTCG @12.5%, STCG @20%, VDA @30%
// 4. Section 111A, 112, 112A handling
```

### API
| Method | Path | Input | Output |
|--------|------|-------|--------|
| POST | `/api/tax/compare` | all income + deductions | `{ oldRegime, newRegime, recommendation, savings, reasons }` |

---

## Feature 4: AIS/TIS Reconciliation

### Current State
- `ais-parser.ts` has comprehensive parsing for 16+ AIS categories
- `reconcileWithITR()` compares AIS vs user data
- `AISReconciler.tsx` page exists with UI
- **Missing:** PDF upload, conflict resolution workflow

### Implementation Plan

#### Data Model (Extend existing `ais_records`)
```sql
ALTER TABLE public.ais_records ADD COLUMN IF NOT EXISTS
  sub_category text,
  transaction_date date,
  modified_value numeric(20,2),
  user_resolution text CHECK (user_resolution IN ('accepted', 'modified', 'disputed')),
  resolution_notes text,
  quarterly_breakup jsonb,
  assessment_year text DEFAULT '2026-27';
```

#### Frontend Flow
1. **Upload AIS** → PDF or JSON file
2. **Parse & Display** → Categorized income table (salary, interest, dividends, securities, VDA, etc.)
3. **Auto-Match** → Compare with user-entered data from income module
4. **Mismatch Dashboard:**
   - 🟢 Matched items (AIS ≈ ITR within 5%)
   - 🟡 Minor discrepancy (5-20% difference)
   - 🔴 Major mismatch or missing income
5. **Resolution Flow:** For each mismatch:
   - "Accept AIS value" → updates income data
   - "Keep my value" → user adds explanation
   - "File feedback" → generates AIS feedback data
6. **Re-calculate tax** after all resolutions

---

## Feature 5: Crypto Tax Engine (Schedule VDA)

### Current State — STRONG FOUNDATION
- `crypto-engine.ts` (1079 lines): FIFO/LIFO/HIFO, validation, audit trail, CSV parsing for WazirX/CoinDCX/Binance/generic
- `Crypto.tsx` (1316 lines): Full UI with dashboard, trade management, portfolio analytics
- `pdf-report-generator.ts`: Schedule VDA PDF + complete tax report
- Exchange API files: `wazirx-api.ts`, `coindcx-api.ts`, `binance-api.ts`

### Missing Pieces

#### 1. Database Tables (Deploy These)
```sql
CREATE TABLE public.crypto_trades (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_symbol text NOT NULL,
  trade_type text NOT NULL, -- 'buy','sell','swap_in','swap_out','airdrop','staking','mining','gift_received','gift_sent'
  quantity numeric(20,8) NOT NULL,
  price_per_unit numeric(20,2) NOT NULL,
  fee numeric(20,8) DEFAULT 0,
  fee_currency text DEFAULT 'INR',
  tds_deducted numeric(15,2) DEFAULT 0,
  trade_date timestamptz NOT NULL,
  exchange text,
  assessment_year text,
  tx_hash text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.crypto_exchange_connections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange text NOT NULL,
  api_key_encrypted text,
  api_secret_encrypted text,
  status text DEFAULT 'active',
  last_sync timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, exchange)
);

-- RLS
ALTER TABLE public.crypto_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_exchange_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trades" ON public.crypto_trades FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own connections" ON public.crypto_exchange_connections FOR ALL USING (auth.uid() = user_id);
```

#### 2. Schedule VDA JSON Output (for ITR)
```typescript
// Add to itr-json-generator.ts
function generateScheduleVDA(trades: CryptoTrade[], ay: string) {
  const engine = calculateDetailedPortfolio(trades, settings);
  return {
    ScheduleVDA: {
      TotalConsideration: engine.totalTaxableGains + totalCostBasis,
      TotalCostOfAcquisition: totalCostBasis,
      TotalIncome: engine.totalTaxableGains,
      TDSu194S: engine.totalTDSPaid,
      Details: engine.breakdown.map(token => ({
        TokenName: token.token,
        DateOfTransfer: "various",
        SaleConsideration: token.totalReceived,
        CostOfAcquisition: token.totalInvested,
        Income: token.taxableGain
      }))
    }
  };
}
```

#### 3. INR Conversion Service
```typescript
// src/lib/fx-rates.ts
export async function getINRRate(currency: string, date: Date): Promise<number> {
  // Use SBI reference rate (legally required for tax calculations)
  // Fallback: CoinGecko/ExchangeRate API
  const response = await fetch(
    `https://api.exchangerate.host/convert?from=${currency}&to=INR&date=${date.toISOString().split('T')[0]}`
  );
  const data = await response.json();
  return data.result || 0;
}
```

#### Frontend Flow
1. **Dashboard** → Portfolio overview, total gains/losses, tax due
2. **Import Tab:**
   - CSV upload (WazirX, CoinDCX, Binance, Generic)
   - API connection (OAuth flow per exchange)
   - Manual trade entry
3. **Trades Tab** → All transactions with filters (exchange, token, date range, type)
4. **Tax Summary Tab:**
   - Per-token gains/losses table
   - Schedule VDA preview
   - FIFO lot matching detail
   - TDS summary (1% under 194S)
5. **Reports Tab** → Download Schedule VDA PDF, CSV, or push to ITR preparation

---

## Feature 6: ITR Preparation (Forms 1-4)

### Current State
- `itr-json-generator.ts` has generators for all 4 forms
- `itr-form-detector.ts` auto-detects correct form
- ITR-1 generator is fairly complete
- ITR-2/3/4 generators are skeletal

### Unified Internal Schema
```typescript
interface UserTaxReturn {
  // Metadata
  assessmentYear: string;
  formType: 'ITR-1' | 'ITR-2' | 'ITR-3' | 'ITR-4';
  regime: 'OLD' | 'NEW';
  filingType: 'ORIGINAL' | 'REVISED' | 'BELATED';
  
  // Personal
  personal: ITRPersonalInfo;
  
  // Income Heads
  salary: {
    employers: SalaryEmployer[];
    totalGross: number;
    exemptAllowances: number;
    standardDeduction: number;
    professionalTax: number;
    netTaxable: number;
  };
  houseProperty: {
    properties: HousePropertyDetail[];
    netIncome: number;
  };
  capitalGains: {
    stcg15: number;      // Equity (STT paid) @15%
    stcgOther: number;   // Other STCG @slab
    ltcg10: number;      // Equity (STT paid) @10% above ₹1L
    ltcg20: number;      // With indexation @20%
    ltcgWithout: number; // Without indexation
    vdaGains: number;    // Crypto @30%
  };
  businessIncome: {
    type: 'presumptive_44AD' | 'presumptive_44ADA' | 'regular';
    turnover: number;
    presumptiveIncome: number;
    regularPL?: ProfitAndLoss;
    balanceSheet?: BalanceSheet;
  };
  otherSources: {
    savingsInterest: number;
    fdInterest: number;
    dividends: number;
    misc: number;
  };
  
  // Deductions & Exemptions
  deductions: ITRDeductions;
  
  // Taxes
  taxesPaid: ITRTaxesPaid;
  scheduleVDA: ScheduleVDAEntry[];
  
  // Bank & Verification
  bankDetails: ITRBankDetails[];
  verification: ITRVerification;
}
```

### Form-to-Module Mapping
| Module | ITR-1 | ITR-2 | ITR-3 | ITR-4 |
|--------|:-----:|:-----:|:-----:|:-----:|
| Salary | ✅ | ✅ | ✅ | ✅ |
| House Property (1) | ✅ | ✅ | ✅ | ✅ |
| House Property (multiple) | ❌ | ✅ | ✅ | ❌ |
| Capital Gains (Equity/MF) | ❌ | ✅ | ✅ | ❌ |
| Capital Gains (Property) | ❌ | ✅ | ✅ | ❌ |
| Crypto/VDA (Sch VDA) | ❌ | ✅ | ✅ | ❌ |
| Business (Regular) | ❌ | ❌ | ✅ | ❌ |
| Presumptive (44AD/ADA) | ❌ | ❌ | ❌ | ✅ |
| Foreign Assets (Sch FA) | ❌ | ✅ | ✅ | ❌ |
| Other Sources | ✅ | ✅ | ✅ | ✅ |
| All Deductions (VI-A) | ✅* | ✅ | ✅ | ✅* |

*Limited deductions in new regime

### Database Table for Filing History
```sql
CREATE TABLE public.itr_filings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_year text NOT NULL,
  form_type text NOT NULL,
  regime text NOT NULL,
  filing_type text DEFAULT 'ORIGINAL',
  status text DEFAULT 'draft',
  filing_data jsonb NOT NULL,
  tax_computation jsonb,
  json_snapshot jsonb,
  ack_number text,
  filed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Validation Rules (Per Form)
```typescript
const ITR1_VALIDATIONS = [
  { field: 'totalIncome', rule: 'max', value: 5000000, msg: 'ITR-1 not applicable if income > ₹50L' },
  { field: 'houseProperty', rule: 'maxCount', value: 1, msg: 'ITR-1 allows only 1 house property' },
  { field: 'capitalGains', rule: 'absent', msg: 'ITR-1 cannot have capital gains' },
  { field: 'businessIncome', rule: 'absent', msg: 'ITR-1 cannot have business income' },
  { field: 'foreignAssets', rule: 'absent', msg: 'ITR-1 not for those with foreign assets' },
  { field: 'crypto', rule: 'absent', msg: 'ITR-1 cannot report VDA income' },
  { field: 'pan', rule: 'required', msg: 'PAN is mandatory' },
  { field: 'bankDetails', rule: 'minCount', value: 1, msg: 'At least one bank account required' },
];
```

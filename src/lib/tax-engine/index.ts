/**
 * EasyITR Tax Engine — Module Entry Point
 * 
 * This is the new, correct tax calculation engine for Indian Income Tax.
 * It replaces the buggy calculation in src/lib/tax-calculation.ts.
 * 
 * Usage:
 *   import { calculateTaxV2, compareRegimesV2, calculateTaxCompat } from '@/lib/tax-engine';
 */

export { calculateTaxV2, compareRegimesV2, calculateTaxCompat } from './calculator';
export { getConfig, TAX_CONFIGS, DEFAULT_AY } from './tax-rates';
export type { YearTaxConfig, TaxSlab } from './tax-rates';
export {
    IncomeHead,
    type TaxProfile,
    type TaxCalculationResult,
    type RegimeComparisonResult,
    type SalaryIncome,
    type HousePropertyIncome,
    type BusinessIncome,
    type CapitalGainsInput,
    type CryptoVDAInput,
    type OtherSourcesInput,
    type TDSBySource,
    type DeductionsInput,
    type IncomeBreakdown,
    type SlabDetail,
    type SpecialRateTaxDetail,
    type TaxRegime,
    type AssessmentYear,
    type ITRFormType,
    type BusinessSection,
} from './types';


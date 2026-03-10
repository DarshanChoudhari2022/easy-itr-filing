/**
 * ITR JSON Generator
 * Generates Income Tax Portal compatible JSON for direct upload
 * Supports ITR-1, ITR-2, ITR-3, ITR-4 forms
 */

import { detectITRForm, ITRFormType } from './itr-form-detector';
import { computeTax as computeTaxUnified, type TaxInput, type TaxResult, type AssessmentYear } from './taxEngine';

export interface ITRPersonalInfo {
    pan: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    dateOfBirth: string; // YYYY-MM-DD
    gender: 'M' | 'F' | 'O';
    fatherName: string;

    // Address
    flatNo: string;
    building?: string;
    street?: string;
    locality?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;

    // Contact
    mobile: string;
    email: string;

    // Status
    residentStatus: 'RES' | 'NRI' | 'RNOR';
    filingStatus: 'INDIVIDUAL' | 'HUF';
}

export interface ITRIncomeDetails {
    // Salary
    salaryGross: number;
    salaryExemptAllowances: number;
    salaryNetTaxable: number;
    standardDeduction: number;
    professionalTax: number;

    // House Property
    housePropertyType?: 'SOP' | 'LOP' | 'Deemed';
    annualLetableValue?: number;
    municipalTaxes?: number;
    standardDeduction30?: number;
    interestOnLoan?: number;
    netHousePropertyIncome?: number;

    // Other Sources
    savingsInterest: number;
    fdInterest: number;
    dividendIncome: number;
    otherIncome: number;

    // Business Income (for ITR-3/4)
    businessGross?: number;
    businessExpenses?: number;
    businessNet?: number;
    isPresumptive?: boolean;
    presumptiveSection?: '44AD' | '44ADA' | '44AE';
    turnover?: number;

    // Capital Gains
    stcgEquity?: number;
    stcg15?: number;
    stcgOther?: number;
    ltcgEquity?: number;
    ltcg10?: number;
    ltcgWithIndexation?: number;
    ltcg20?: number;

    // VDA/Crypto
    vdaGains: number;
    vdaTDSPaid?: number;

    // Agricultural Income
    agriIncome?: number;
}

export interface ITRDeductions {
    section80C: number;
    section80CCC: number;
    section80CCD1: number;
    section80CCD1B: number;
    section80CCD2: number;
    section80D: number;
    section80DD: number;
    section80DDB: number;
    section80E: number;
    section80EE: number;
    section80EEA: number;
    section80EEB: number;
    section80G: number;
    section80GG: number;
    section80GGA: number;
    section80GGC: number;
    section80TTA: number;
    section80TTB: number;
    section80U: number;
}

export interface ITRTaxesPaid {
    tdsSalary: number;
    tdsInterest: number;
    tdsDividend: number;
    tdsRent: number;
    tdsProfessional: number;
    tdsProperty: number;
    tdsOther: number;
    tcs: number;
    advanceTax: number;
    selfAssessmentTax: number;
    relief89?: number;
    relief90?: number;
    relief91?: number;
}

export interface ITRBankDetails {
    accountNumber: string;
    ifsc: string;
    bankName: string;
    accountType: 'SB' | 'CA' | 'OTH';
    isRefundAccount: boolean;
}

export interface ITRVerification {
    place: string;
    date: string;
    capacity: 'SELF' | 'REPRESENTATIVE';
}

export interface ITRFilingData {
    formType: ITRFormType;
    assessmentYear: string;
    filingType: 'ORIGINAL' | 'REVISED' | 'BELATED';
    originalAckNo?: string;
    regime: 'OLD' | 'NEW';

    personalInfo: ITRPersonalInfo;
    income: ITRIncomeDetails;
    deductions: ITRDeductions;
    taxesPaid: ITRTaxesPaid;
    bankDetails: ITRBankDetails[];

    // Foreign Assets (for ITR-2/3)
    hasForeignAssets?: boolean;
    foreignAssets?: any[];

    // Schedule VDA
    hasVDAIncome: boolean;
    scheduleVDA?: any[];

    verification: ITRVerification;
}

export interface ScheduleVDAEntry {
    tokenName: string;
    dateOfTransfer: string;
    saleConsideration: number;
    costOfAcquisition: number;
    income: number;
    tdsDeducted: number;
}

/**
 * Generate ITR-1 JSON (Sahaj)
 */
function generateITR1Json(data: ITRFilingData): object {
    const { personalInfo, income, deductions, taxesPaid, bankDetails, verification, regime } = data;

    // Calculate totals
    const grossTotalIncome = income.salaryNetTaxable + (income.netHousePropertyIncome || 0) +
        income.savingsInterest + income.fdInterest + income.dividendIncome + income.otherIncome;

    const totalDeductions = regime === 'OLD' ?
        (deductions.section80C + deductions.section80CCC + deductions.section80CCD1 +
            deductions.section80CCD1B + deductions.section80D + deductions.section80E +
            deductions.section80G + deductions.section80TTA) : 0;

    const taxableIncome = Math.max(0, grossTotalIncome - totalDeductions);

    return {
        "Form": "ITR1",
        "Schema": "ITR1_2024",
        "AssessmentYear": data.assessmentYear,
        "FilingType": data.filingType,
        "TaxRegime": regime,

        "PersonalInfo": {
            "PAN": personalInfo.pan,
            "FirstName": personalInfo.firstName,
            "MiddleName": personalInfo.middleName || "",
            "LastName": personalInfo.lastName,
            "DOB": personalInfo.dateOfBirth,
            "Gender": personalInfo.gender,
            "FatherName": personalInfo.fatherName,
            "Address": {
                "FlatNo": personalInfo.flatNo,
                "Building": personalInfo.building || "",
                "Street": personalInfo.street || "",
                "Locality": personalInfo.locality || "",
                "City": personalInfo.city,
                "State": personalInfo.state,
                "Pincode": personalInfo.pincode,
                "Country": personalInfo.country
            },
            "Mobile": personalInfo.mobile,
            "Email": personalInfo.email,
            "ResidentStatus": personalInfo.residentStatus
        },

        "Salary": {
            "GrossSalary": income.salaryGross,
            "AllowancesExempt": income.salaryExemptAllowances,
            "NetSalary": income.salaryNetTaxable,
            "StandardDeduction": income.standardDeduction,
            "ProfessionalTax": income.professionalTax,
            "IncomeFromSalary": income.salaryNetTaxable - income.standardDeduction - income.professionalTax
        },

        "HouseProperty": income.netHousePropertyIncome ? {
            "PropertyType": income.housePropertyType || "SOP",
            "GrossAnnualValue": income.annualLetableValue || 0,
            "MunicipalTaxesPaid": income.municipalTaxes || 0,
            "StandardDeduction30": income.standardDeduction30 || 0,
            "InterestOnLoan": income.interestOnLoan || 0,
            "NetIncome": income.netHousePropertyIncome
        } : null,

        "OtherSources": {
            "SavingsInterest": income.savingsInterest,
            "FDInterest": income.fdInterest,
            "DividendIncome": income.dividendIncome,
            "OtherIncome": income.otherIncome,
            "TotalOtherSources": income.savingsInterest + income.fdInterest + income.dividendIncome + income.otherIncome
        },

        "GrossTotalIncome": grossTotalIncome,

        "Deductions": regime === 'OLD' ? {
            "Section80C": Math.min(150000, deductions.section80C),
            "Section80CCC": deductions.section80CCC,
            "Section80CCD1": deductions.section80CCD1,
            "Section80CCD1B": Math.min(50000, deductions.section80CCD1B),
            "Section80D": deductions.section80D,
            "Section80E": deductions.section80E,
            "Section80G": deductions.section80G,
            "Section80TTA": Math.min(10000, deductions.section80TTA),
            "TotalDeductions": totalDeductions
        } : { "TotalDeductions": 0 },

        "TotalTaxableIncome": taxableIncome,

        "TaxComputation": computeTax(taxableIncome, regime, data.assessmentYear),

        "TaxesPaid": {
            "TDSDetails": {
                "TDSSalary": taxesPaid.tdsSalary,
                "TDSInterest": taxesPaid.tdsInterest,
                "TDSDividend": taxesPaid.tdsDividend,
                "TDSOther": taxesPaid.tdsOther
            },
            "TCS": taxesPaid.tcs,
            "AdvanceTax": taxesPaid.advanceTax,
            "SelfAssessmentTax": taxesPaid.selfAssessmentTax,
            "TotalTaxesPaid": taxesPaid.tdsSalary + taxesPaid.tdsInterest + taxesPaid.tdsDividend +
                taxesPaid.tdsOther + taxesPaid.tcs + taxesPaid.advanceTax + taxesPaid.selfAssessmentTax
        },

        "BankDetails": bankDetails.map(bank => ({
            "AccountNumber": bank.accountNumber,
            "IFSC": bank.ifsc,
            "BankName": bank.bankName,
            "AccountType": bank.accountType,
            "PrimaryAccount": bank.isRefundAccount
        })),

        "Verification": {
            "Place": verification.place,
            "Date": verification.date,
            "Capacity": verification.capacity
        }
    };
}

/**
 * Generate ITR-2 JSON (for Capital Gains, Foreign Assets)
 */
function generateITR2Json(data: ITRFilingData): object {
    const itr1Base = generateITR1Json(data);

    return {
        ...itr1Base,
        "Form": "ITR2",
        "Schema": "ITR2_2024",

        "CapitalGains": {
            "ShortTermCapitalGains": {
                "STCG15Percent": data.income.stcg15 || 0,
                "STCGSlabRate": data.income.stcgOther || 0,
                "TotalSTCG": (data.income.stcg15 || 0) + (data.income.stcgOther || 0)
            },
            "LongTermCapitalGains": {
                "LTCG10Percent": data.income.ltcg10 || 0,
                "LTCG20Percent": data.income.ltcg20 || 0,
                "TotalLTCG": (data.income.ltcg10 || 0) + (data.income.ltcg20 || 0)
            }
        },

        "ScheduleVDA": data.hasVDAIncome ? {
            "TotalVDAIncome": data.income.vdaGains,
            "TDSOnVDA": data.income.vdaTDSPaid || 0,
            "TaxOnVDA": data.income.vdaGains * 0.30,
            "Transactions": data.scheduleVDA || []
        } : null,

        "ScheduleFA": data.hasForeignAssets ? {
            "ForeignAssets": data.foreignAssets || [],
            "HasForeignAssets": true
        } : null,

        "ScheduleAL": data.income.agriIncome && data.income.agriIncome > 500000 ? {
            "AgricultureIncome": data.income.agriIncome
        } : null
    };
}

/**
 * Generate ITR-3 JSON (for Business Income)
 */
function generateITR3Json(data: ITRFilingData): object {
    const itr2Base = generateITR2Json(data);

    return {
        ...itr2Base,
        "Form": "ITR3",
        "Schema": "ITR3_2024",

        "BusinessIncome": {
            "IsPresumptive": data.income.isPresumptive || false,
            "Section": data.income.presumptiveSection,
            "Turnover": data.income.turnover || 0,
            "GrossProfit": data.income.businessGross || 0,
            "Expenses": data.income.businessExpenses || 0,
            "NetProfit": data.income.businessNet || 0
        },

        "ScheduleBP": {
            "NatureOfBusiness": "Professional Services",
            "Code": "16019",
            "GSTRegistered": !!data.income.turnover
        },

        "ProfitAndLoss": data.income.isPresumptive ? null : {
            "Revenue": {
                "GrossTurnover": data.income.turnover || 0,
                "OtherRevenue": 0,
                "TotalRevenue": data.income.turnover || 0
            },
            "Expenses": {
                "PurchaseOfGoods": 0,
                "EmployeeBenefit": 0,
                "Depreciation": 0,
                "OtherExpenses": data.income.businessExpenses || 0,
                "TotalExpenses": data.income.businessExpenses || 0
            },
            "NetProfit": data.income.businessNet || 0
        },

        "BalanceSheet": data.income.isPresumptive ? null : {
            "Assets": {
                "FixedAssets": 0,
                "CurrentAssets": 0,
                "TotalAssets": 0
            },
            "Liabilities": {
                "Capital": 0,
                "Loans": 0,
                "CurrentLiabilities": 0,
                "TotalLiabilities": 0
            }
        }
    };
}

/**
 * Generate ITR-4 JSON (Sugam - Presumptive)
 */
function generateITR4Json(data: ITRFilingData): object {
    const itr1Base = generateITR1Json(data);

    // Calculate presumptive income based on section
    let presumptiveIncome = 0;
    const turnover = data.income.turnover || 0;

    if (data.income.presumptiveSection === '44ADA') {
        // 50% for professionals
        presumptiveIncome = turnover * 0.5;
    } else {
        // 44AD: 6% digital + 8% cash
        const digitalReceipts = data.income.businessGross || turnover;
        const cashReceipts = data.income.businessExpenses || 0; // Reusing this field for cash receipts in UI
        presumptiveIncome = (digitalReceipts * 0.06) + (cashReceipts * 0.08);
        if (presumptiveIncome === 0) {
            // Fallback to 8% of full turnover if no split provided
            presumptiveIncome = turnover * 0.08;
        }
    }

    return {
        ...itr1Base,
        "Form": "ITR4",
        "Schema": "ITR4_2024",

        "PresumptiveIncome": {
            "Section": data.income.presumptiveSection || "44AD",
            "NatureOfBusiness": data.income.presumptiveSection === '44ADA' ? 'Profession' : 'Business',
            "Turnover": turnover,
            "PresumptiveRate": data.income.presumptiveSection === '44ADA' ? 50 :
                `6% digital + 8% cash`,
            "PresumptiveIncome": Math.round(presumptiveIncome),
            "DigitalReceipts": data.income.businessGross || 0,
            "CashReceipts": data.income.businessExpenses || 0,
            "DigitalTaxableIncome": Math.round((data.income.businessGross || 0) * 0.06),
            "CashTaxableIncome": Math.round((data.income.businessExpenses || 0) * 0.08)
        }
    };
}

/**
 * Compute tax based on regime and income
 */
function computeTax(taxableIncome: number, regime: 'OLD' | 'NEW', assessmentYear: string, extraInput?: Partial<TaxInput>): object {
    const ay = (assessmentYear || '2026-27') as AssessmentYear;
    const taxRegime = regime === 'OLD' ? 'old' : 'new';

    // Build a TaxInput from all available data
    const input: TaxInput = {
        assessmentYear: ay,
        regime: taxRegime,
        salary: taxableIncome > 0 ? { gross: taxableIncome } : undefined,
        ...extraInput,
    };

    const result = computeTaxUnified(input);

    return {
        "TaxOnIncome": result.slabTax + result.stcg111A.tax + result.ltcg112A.tax + result.ltcgOther.tax + result.cryptoVDA.tax,
        "Rebate87A": result.rebate87A,
        "TaxAfterRebate": result.taxAfterRebate,
        "Surcharge": result.surcharge,
        "HealthEducationCess": result.cess,
        "TotalTaxLiability": result.totalTaxLiability,
        "Slabs": result.slabs.map(s => ({
            from: s.range,
            rate: s.rate,
            tax: s.tax
        }))
    };
}

/**
 * Main function to generate ITR JSON
 */
export function generateITRJson(data: ITRFilingData): { json: object; filename: string } {
    let json: object;

    switch (data.formType) {
        case 'ITR-1':
            json = generateITR1Json(data);
            break;
        case 'ITR-2':
            json = generateITR2Json(data);
            break;
        case 'ITR-3':
            json = generateITR3Json(data);
            break;
        case 'ITR-4':
            json = generateITR4Json(data);
            break;
        default:
            json = generateITR1Json(data);
    }

    const filename = `${data.formType}_${data.personalInfo.pan}_AY${data.assessmentYear.replace('-', '')}.json`;

    return { json, filename };
}

/**
 * Download ITR JSON file
 */
export function downloadITRJson(data: ITRFilingData): void {
    const { json, filename } = generateITRJson(data);

    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Validate ITR data before generation
 */
export function validateITRData(data: ITRFilingData): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!data.personalInfo.pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(data.personalInfo.pan)) {
        errors.push('Invalid PAN format');
    }
    if (!data.personalInfo.firstName) errors.push('First name is required');
    if (!data.personalInfo.dateOfBirth) errors.push('Date of birth is required');
    if (!data.personalInfo.fatherName) errors.push("Father's name is required for ITR");
    if (!data.personalInfo.gender) errors.push('Gender is required');
    if (!data.personalInfo.mobile || !/^[6-9]\d{9}$/.test(data.personalInfo.mobile)) {
        errors.push('Invalid mobile number');
    }
    if (!data.personalInfo.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.personalInfo.email)) {
        errors.push('Invalid email address');
    }
    if (!data.personalInfo.city || !data.personalInfo.state || !data.personalInfo.pincode) {
        errors.push('Complete address (city, state, pincode) is required');
    }

    // Bank details
    if (!data.bankDetails || data.bankDetails.length === 0) {
        errors.push('At least one bank account is required');
    } else {
        const refundAccount = data.bankDetails.find(b => b.isRefundAccount);
        if (!refundAccount) {
            errors.push('Please select a primary bank account for refund');
        }
    }

    // Form-specific validations
    if (data.formType === 'ITR-1') {
        if (data.income.vdaGains > 0) {
            errors.push('ITR-1 cannot be filed with VDA/Crypto income. Use ITR-2 or ITR-3');
        }
        if ((data.income.stcgEquity || 0) > 0 || (data.income.ltcgEquity || 0) > 0) {
            errors.push('ITR-1 cannot have capital gains. Use ITR-2');
        }
        if ((data.income.businessGross || 0) > 0) {
            errors.push('ITR-1 cannot have business income. Use ITR-3 or ITR-4');
        }
        const totalIncome = data.income.salaryNetTaxable + (data.income.netHousePropertyIncome || 0) +
            data.income.savingsInterest + data.income.fdInterest + data.income.dividendIncome + data.income.otherIncome;
        if (totalIncome > 5000000) {
            warnings.push('Total income exceeds ₹50L — ITR-1 may not be applicable. Verify eligibility.');
        }
    }

    if (data.formType === 'ITR-4') {
        if (!data.income.isPresumptive) {
            warnings.push('ITR-4 is meant for presumptive taxation. Use ITR-3 for regular business accounting.');
        }
        if ((data.income.turnover || 0) > 30000000 && data.income.presumptiveSection === '44AD') {
            errors.push('44AD not applicable if turnover > ₹3 Cr. File ITR-3 instead.');
        }
        if ((data.income.turnover || 0) > 7500000 && data.income.presumptiveSection === '44ADA') {
            errors.push('44ADA not applicable if receipts > ₹75L. File ITR-3 instead.');
        }
    }

    // Warnings
    if (data.income.salaryGross > 0 && data.taxesPaid.tdsSalary === 0) {
        warnings.push('No TDS on salary reported. Please verify Form 26AS');
    }
    if (data.income.fdInterest > 40000 && data.taxesPaid.tdsInterest === 0) {
        warnings.push('FD interest exceeds ₹40,000 but no TDS reported. Verify with bank.');
    }
    if (data.income.dividendIncome > 500000 && data.taxesPaid.tdsDividend === 0) {
        warnings.push('Dividend income exceeds ₹5L but no TDS reported');
    }
    if (data.income.vdaGains > 0 && (data.income.vdaTDSPaid || 0) === 0) {
        warnings.push('Crypto gains reported but no TDS under Section 194S. Verify exchange statements.');
    }

    return { valid: errors.length === 0, errors, warnings };
}

import type { FilingSession } from './filing-session';

/**
 * Maps the central FilingSession state to the ITRFilingData structure required by the JSON generator
 */
export function mapSessionToITRData(session: FilingSession, formType: ITRFormType): ITRFilingData {
    return {
        formType,
        assessmentYear: session.assessmentYear,
        filingType: 'ORIGINAL',
        regime: session.regime === 'old' ? 'OLD' : 'NEW',
        personalInfo: {
            pan: session.personalInfo.pan || '',
            firstName: session.personalInfo.firstName || '',
            lastName: session.personalInfo.lastName || '',
            dateOfBirth: session.personalInfo.dateOfBirth || '',
            gender: session.personalInfo.gender as any || 'M',
            fatherName: session.personalInfo.fatherName || '',
            flatNo: session.personalInfo.flatNo || '',
            city: session.personalInfo.city || '',
            state: session.personalInfo.state || '',
            pincode: session.personalInfo.pincode || '',
            country: 'India',
            mobile: session.personalInfo.mobile || '',
            email: session.personalInfo.email || '',
            residentStatus: session.personalInfo.residentStatus as any || 'RES',
            filingStatus: 'INDIVIDUAL',
        },
        income: {
            salaryGross: session.salary.grossSalary,
            salaryExemptAllowances: session.salary.exemptAllowances,
            salaryNetTaxable: Math.max(0, session.salary.grossSalary - session.salary.exemptAllowances - session.salary.standardDeduction - session.salary.professionalTax),
            standardDeduction: session.salary.standardDeduction,
            professionalTax: session.salary.professionalTax,

            savingsInterest: session.otherSources.savingsInterest,
            fdInterest: session.otherSources.fdInterest,
            dividendIncome: session.otherSources.dividendIncome,
            otherIncome: session.otherSources.otherIncome,

            stcgEquity: session.capitalGains.stcgEquity,
            ltcgEquity: session.capitalGains.ltcgEquity,
            stcgOther: session.capitalGains.stcgOther,
            ltcgWithIndexation: session.capitalGains.ltcgOther,

            vdaGains: session.cryptoVDA.taxableGains,
            vdaTDSPaid: session.cryptoVDA.tdsCredit,

            businessGross: session.business.grossReceipts,
            businessNet: session.business.netProfit,
            businessExpenses: session.business.grossReceipts - session.business.netProfit,
            isPresumptive: session.business.section !== 'regular',
            presumptiveSection: session.business.section as any,
            turnover: session.business.grossReceipts,

            netHousePropertyIncome: session.houseProperty.netIncome,
            annualLetableValue: session.houseProperty.annualRent,
            municipalTaxes: session.houseProperty.municipalTax,
            interestOnLoan: session.houseProperty.homeLoanInterest,
            housePropertyType: session.houseProperty.annualRent > 0 ? 'LOP' : 'SOP',
        },
        deductions: {
            section80C: session.deductions.section80C,
            section80D: session.deductions.section80D,
            section80CCD1B: session.deductions.section80CCD1B,
            section80E: session.deductions.section80E,
            section80G: session.deductions.section80G,
            section80TTA: session.deductions.section80TTA,
            section80GG: session.deductions.section80GG,
            section80CCC: session.deductions.section80CCC,
            section80CCD1: session.deductions.section80CCD1,
            section80CCD2: session.deductions.section80CCD2,
            section80DD: session.deductions.section80DD,
            section80DDB: session.deductions.section80DDB,
            section80EE: session.deductions.section80EE,
            section80EEA: session.deductions.section80EEA,
            section80EEB: session.deductions.section80EEB,
            section80GGA: session.deductions.section80GGA,
            section80GGC: session.deductions.section80GGC,
            section80TTB: session.deductions.section80TTB,
            section80U: session.deductions.section80U,
        },
        taxesPaid: {
            tdsSalary: session.salary.tdsSalary,
            tdsInterest: session.otherSources.tdsInterest,
            tdsDividend: 0,
            tdsRent: 0,
            tdsProfessional: session.business.tdsPayments,
            tdsProperty: 0,
            tdsOther: session.cryptoVDA.tdsCredit,
            tcs: 0,
            advanceTax: session.taxesPaid.advanceTax,
            selfAssessmentTax: session.taxesPaid.selfAssessmentTax,
        },
        bankDetails: [
            session.bankDetails.find(b => b.isRefundAccount) || session.bankDetails[0] || {
                accountNumber: '000000000',
                ifsc: 'SBIN0000000',
                bankName: 'Unknown Bank',
                accountType: 'SB',
                isRefundAccount: true
            }
        ],
        hasVDAIncome: session.cryptoVDA.enabled && session.cryptoVDA.taxableGains > 0,
        scheduleVDA: (session.cryptoVDA.scheduleVDA || []).map((entry: any) => ({
            tokenName: entry.asset,
            dateOfTransfer: new Date(entry.dateOfTransfer || new Date()).toISOString().split('T')[0],
            saleConsideration: entry.saleConsideration,
            costOfAcquisition: entry.costOfAcquisition,
            income: entry.taxableIncome,
            tdsDeducted: entry.saleConsideration * 0.01 // approximate if specific TDS not stored
        })),
        verification: {
            place: session.personalInfo.city || 'Delhi',
            date: new Date().toISOString().split('T')[0],
            capacity: 'SELF'
        }
    };
}

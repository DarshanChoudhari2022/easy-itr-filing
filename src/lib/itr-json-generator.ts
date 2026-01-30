/**
 * ITR JSON Generator
 * Generates Income Tax Portal compatible JSON for direct upload
 * Supports ITR-1, ITR-2, ITR-3, ITR-4 forms
 */

import { detectITRForm, ITRFormType } from './itr-form-detector';

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
            "GSTRegistered": false
        }
    };
}

/**
 * Generate ITR-4 JSON (Sugam - Presumptive)
 */
function generateITR4Json(data: ITRFilingData): object {
    const itr1Base = generateITR1Json(data);

    const presumptiveIncome = data.income.isPresumptive && data.income.turnover ?
        (data.income.presumptiveSection === '44ADA' ? data.income.turnover * 0.5 : data.income.turnover * 0.08) : 0;

    return {
        ...itr1Base,
        "Form": "ITR4",
        "Schema": "ITR4_2024",

        "PresumptiveIncome": {
            "Section": data.income.presumptiveSection || "44AD",
            "Turnover": data.income.turnover || 0,
            "PresumptiveRate": data.income.presumptiveSection === '44ADA' ? 50 : 8,
            "PresumptiveIncome": presumptiveIncome,
            "DigitalReceipts": data.income.turnover || 0,
            "CashReceipts": 0
        }
    };
}

/**
 * Compute tax based on regime and income
 */
function computeTax(taxableIncome: number, regime: 'OLD' | 'NEW', assessmentYear: string): object {
    let tax = 0;
    const slabs: { from: number; to: number; rate: number; tax: number }[] = [];

    if (regime === 'NEW') {
        // New regime slabs (FY 2024-25)
        const newSlabs = [
            { min: 0, max: 300000, rate: 0 },
            { min: 300000, max: 700000, rate: 5 },
            { min: 700000, max: 1000000, rate: 10 },
            { min: 1000000, max: 1200000, rate: 15 },
            { min: 1200000, max: 1500000, rate: 20 },
            { min: 1500000, max: Infinity, rate: 30 }
        ];

        let remaining = taxableIncome;
        for (const slab of newSlabs) {
            if (remaining <= 0) break;
            const taxable = Math.min(remaining, slab.max - slab.min);
            const slabTax = taxable * (slab.rate / 100);
            tax += slabTax;
            if (taxable > 0) {
                slabs.push({ from: slab.min, to: Math.min(slab.max, taxableIncome), rate: slab.rate, tax: slabTax });
            }
            remaining -= taxable;
        }

        // 87A Rebate (up to 7L)
        if (taxableIncome <= 700000) {
            tax = 0;
        }
    } else {
        // Old regime slabs
        const oldSlabs = [
            { min: 0, max: 250000, rate: 0 },
            { min: 250000, max: 500000, rate: 5 },
            { min: 500000, max: 1000000, rate: 20 },
            { min: 1000000, max: Infinity, rate: 30 }
        ];

        let remaining = taxableIncome;
        for (const slab of oldSlabs) {
            if (remaining <= 0) break;
            const taxable = Math.min(remaining, slab.max - slab.min);
            const slabTax = taxable * (slab.rate / 100);
            tax += slabTax;
            if (taxable > 0) {
                slabs.push({ from: slab.min, to: Math.min(slab.max, taxableIncome), rate: slab.rate, tax: slabTax });
            }
            remaining -= taxable;
        }

        // 87A Rebate (up to 5L)
        if (taxableIncome <= 500000) {
            tax = 0;
        }
    }

    // Surcharge
    let surcharge = 0;
    if (taxableIncome > 5000000 && taxableIncome <= 10000000) surcharge = tax * 0.10;
    else if (taxableIncome > 10000000 && taxableIncome <= 20000000) surcharge = tax * 0.15;
    else if (taxableIncome > 20000000 && taxableIncome <= 50000000) surcharge = tax * 0.25;
    else if (taxableIncome > 50000000) surcharge = tax * 0.37;

    // Cess
    const cess = (tax + surcharge) * 0.04;

    return {
        "TaxOnIncome": tax,
        "Rebate87A": taxableIncome <= (regime === 'NEW' ? 700000 : 500000) ? tax : 0,
        "TaxAfterRebate": taxableIncome <= (regime === 'NEW' ? 700000 : 500000) ? 0 : tax,
        "Surcharge": surcharge,
        "HealthEducationCess": cess,
        "TotalTaxLiability": tax + surcharge + cess,
        "Slabs": slabs
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
    if (!data.personalInfo.mobile || !/^[6-9]\d{9}$/.test(data.personalInfo.mobile)) {
        errors.push('Invalid mobile number');
    }
    if (!data.personalInfo.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.personalInfo.email)) {
        errors.push('Invalid email address');
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

    // Income validation
    if (data.income.vdaGains > 0 && data.formType === 'ITR-1') {
        errors.push('ITR-1 cannot be filed with VDA/Crypto income. Use ITR-2');
    }

    // Warnings
    if (data.income.salaryGross > 0 && data.taxesPaid.tdsSalary === 0) {
        warnings.push('No TDS on salary reported. Please verify Form 26AS');
    }
    if (data.income.fdInterest > 40000 && data.taxesPaid.tdsInterest === 0) {
        warnings.push('FD interest exceeds ₹40,000 but no TDS reported');
    }

    return { valid: errors.length === 0, errors, warnings };
}

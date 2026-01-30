/**
 * Form 16 PDF Parser
 * Automatically extracts salary details, TDS, and employer info from Form 16 PDF
 * Uses pattern matching to identify key fields
 */

export interface Form16Data {
    // Part A - TDS Certificate
    employerName: string;
    employerTAN: string;
    employerPAN: string;
    employeeName: string;
    employeePAN: string;
    assessmentYear: string;
    periodFrom: string;
    periodTo: string;

    // TDS Details
    totalTDSDeducted: number;
    totalTDSDeposited: number;
    quarterlyTDS: {
        quarter: string;
        taxDeducted: number;
        taxDeposited: number;
        challanDate: string;
    }[];

    // Part B - Salary Breakup
    salaryBreakup: {
        basicSalary: number;
        hra: number;
        specialAllowance: number;
        lta: number;
        bonus: number;
        otherAllowances: number;
        perquisites: number;
        profitsInLieu: number;
    };

    // Gross Salary
    grossSalary: number;

    // Exemptions under Section 10
    exemptions: {
        hraExemption: number;
        ltaExemption: number;
        otherExemptions: number;
    };

    // Deductions
    standardDeduction: number;
    entertainmentAllowance: number;
    professionalTax: number;

    // Income from Salary
    incomeFromSalary: number;

    // Other Income (if reported)
    otherIncome: number;

    // Chapter VI-A Deductions
    deductions: {
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
        section80G: number;
        section80GG: number;
        section80GGA: number;
        section80GGC: number;
        section80TTA: number;
        section80TTB: number;
        section80U: number;
    };

    totalChapterVIADeductions: number;

    // Tax Computation
    taxComputation: {
        grossTotalIncome: number;
        totalDeductions: number;
        totalTaxableIncome: number;
        taxOnTotalIncome: number;
        rebate87A: number;
        surcharge: number;
        healthEducationCess: number;
        totalTaxPayable: number;
        relief89: number;
        netTaxPayable: number;
    };

    // Metadata
    parseConfidence: number;
    warnings: string[];
    rawText?: string;
}

/**
 * Parse Form 16 PDF text content
 */
export function parseForm16(textContent: string): Form16Data {
    const warnings: string[] = [];
    let parseConfidence = 100;

    // Helper functions
    const extractAmount = (pattern: RegExp, text: string): number => {
        const match = text.match(pattern);
        if (match) {
            const value = parseFloat(match[1].replace(/,/g, ''));
            return isNaN(value) ? 0 : value;
        }
        return 0;
    };

    const extractText = (pattern: RegExp, text: string): string => {
        const match = text.match(pattern);
        return match ? match[1].trim() : '';
    };

    // Extract employer details
    const employerName = extractText(/Employer\s*(?:Name)?[:\s]+([A-Z][A-Za-z\s&.,]+?)(?:\n|TAN)/i, textContent)
        || extractText(/Name\s+of\s+(?:the\s+)?Deductor[:\s]+(.+?)(?:\n|TAN)/i, textContent);

    const employerTAN = extractText(/TAN\s*(?:of\s+(?:the\s+)?(?:Deductor|Employer))?[:\s]+([A-Z]{4}[0-9]{5}[A-Z])/i, textContent);
    const employerPAN = extractText(/PAN\s+of\s+(?:the\s+)?(?:Deductor|Employer)[:\s]+([A-Z]{5}[0-9]{4}[A-Z])/i, textContent);

    // Extract employee details
    const employeeName = extractText(/Employee\s*(?:Name)?[:\s]+([A-Z][A-Za-z\s]+?)(?:\n|PAN)/i, textContent)
        || extractText(/Name\s+of\s+(?:the\s+)?(?:Deductee|Employee)[:\s]+(.+?)(?:\n|PAN)/i, textContent);

    const employeePAN = extractText(/PAN\s+of\s+(?:the\s+)?(?:Deductee|Employee)[:\s]+([A-Z]{5}[0-9]{4}[A-Z])/i, textContent);

    // Extract assessment year
    const assessmentYear = extractText(/Assessment\s+Year[:\s]+(\d{4}-\d{2,4})/i, textContent);

    // Extract period
    const periodFrom = extractText(/Period\s+(?:From|with\s+the\s+Employer\s+From)[:\s]+(\d{2}[-/]\d{2}[-/]\d{4})/i, textContent);
    const periodTo = extractText(/(?:Period\s+)?To[:\s]+(\d{2}[-/]\d{2}[-/]\d{4})/i, textContent);

    // Extract TDS amounts
    const totalTDSDeducted = extractAmount(/Total\s+(?:Tax\s+)?(?:TDS\s+)?Deducted[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const totalTDSDeposited = extractAmount(/Total\s+(?:Tax\s+)?(?:TDS\s+)?Deposited[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);

    // Extract salary components
    const grossSalary = extractAmount(/Gross\s+Salary[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent)
        || extractAmount(/1\.\s*(?:a\))?\s*Salary\s+as\s+per[^0-9]+([0-9,]+)/i, textContent);

    const basicSalary = extractAmount(/Basic\s+(?:Salary|Pay)[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const hra = extractAmount(/(?:House\s+Rent\s+Allowance|HRA)[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const specialAllowance = extractAmount(/Special\s+Allowance[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const lta = extractAmount(/(?:Leave\s+Travel\s+(?:Allowance|Concession)|LTA)[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const bonus = extractAmount(/Bonus[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);

    // Extract exemptions
    const hraExemption = extractAmount(/(?:HRA|House\s+Rent)\s+(?:Exemption|u\/s\s*10)[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const ltaExemption = extractAmount(/(?:LTA|Leave\s+Travel)\s+(?:Exemption|u\/s\s*10)[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);

    // Extract standard deduction
    const standardDeduction = extractAmount(/Standard\s+Deduction[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent)
        || 50000; // Default for FY 2024-25

    // Professional tax
    const professionalTax = extractAmount(/Professional\s+Tax[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);

    // Chapter VI-A Deductions
    const section80C = extractAmount(/(?:Section\s+)?80C[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const section80D = extractAmount(/(?:Section\s+)?80D[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const section80CCD1B = extractAmount(/(?:Section\s+)?80CCD\(?1B\)?[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const section80CCD2 = extractAmount(/(?:Section\s+)?80CCD\(?2\)?[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const section80E = extractAmount(/(?:Section\s+)?80E[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const section80G = extractAmount(/(?:Section\s+)?80G[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const section80TTA = extractAmount(/(?:Section\s+)?80TTA[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);

    const totalChapterVIADeductions = extractAmount(/Total\s+(?:Deduction\s+)?(?:under\s+)?Chapter\s+VI[- ]?A[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent)
        || (section80C + section80D + section80CCD1B + section80CCD2 + section80E + section80G + section80TTA);

    // Tax computation
    const grossTotalIncome = extractAmount(/Gross\s+Total\s+Income[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const totalTaxableIncome = extractAmount(/(?:Total\s+)?Taxable\s+Income[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const taxOnIncome = extractAmount(/(?:Tax\s+on\s+(?:Total\s+)?Income|Income\s+Tax)[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const rebate87A = extractAmount(/Rebate\s+(?:u\/s\s+)?87A?[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const surcharge = extractAmount(/Surcharge[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const cess = extractAmount(/(?:Health\s+(?:and\s+)?Education\s+)?Cess[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);
    const totalTaxPayable = extractAmount(/Total\s+Tax\s+Payable[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent);

    // Income from salary
    const incomeFromSalary = extractAmount(/Income\s+(?:chargeable\s+)?(?:under\s+(?:the\s+)?head\s+)?(?:"|")?Salaries(?:"|")?[:\s]+(?:Rs\.?\s*)?([0-9,]+)/i, textContent)
        || grossSalary - standardDeduction - professionalTax - hraExemption - ltaExemption;

    // Validate extraction
    if (!employeePAN) {
        warnings.push('Employee PAN not found');
        parseConfidence -= 10;
    }
    if (grossSalary === 0) {
        warnings.push('Gross salary not detected');
        parseConfidence -= 20;
    }
    if (totalTDSDeducted === 0) {
        warnings.push('TDS amount not detected');
        parseConfidence -= 15;
    }

    return {
        employerName: employerName || 'Not Detected',
        employerTAN: employerTAN || '',
        employerPAN: employerPAN || '',
        employeeName: employeeName || 'Not Detected',
        employeePAN: employeePAN || '',
        assessmentYear: assessmentYear || '2025-26',
        periodFrom: periodFrom || '',
        periodTo: periodTo || '',
        totalTDSDeducted,
        totalTDSDeposited: totalTDSDeposited || totalTDSDeducted,
        quarterlyTDS: [],
        salaryBreakup: {
            basicSalary,
            hra,
            specialAllowance,
            lta,
            bonus,
            otherAllowances: 0,
            perquisites: 0,
            profitsInLieu: 0
        },
        grossSalary,
        exemptions: {
            hraExemption,
            ltaExemption,
            otherExemptions: 0
        },
        standardDeduction,
        entertainmentAllowance: 0,
        professionalTax,
        incomeFromSalary,
        otherIncome: 0,
        deductions: {
            section80C,
            section80CCC: 0,
            section80CCD1: 0,
            section80CCD1B,
            section80CCD2,
            section80D,
            section80DD: 0,
            section80DDB: 0,
            section80E,
            section80EE: 0,
            section80EEA: 0,
            section80G,
            section80GG: 0,
            section80GGA: 0,
            section80GGC: 0,
            section80TTA,
            section80TTB: 0,
            section80U: 0
        },
        totalChapterVIADeductions,
        taxComputation: {
            grossTotalIncome: grossTotalIncome || incomeFromSalary,
            totalDeductions: totalChapterVIADeductions,
            totalTaxableIncome: totalTaxableIncome || (grossTotalIncome - totalChapterVIADeductions),
            taxOnTotalIncome: taxOnIncome,
            rebate87A,
            surcharge,
            healthEducationCess: cess,
            totalTaxPayable,
            relief89: 0,
            netTaxPayable: totalTaxPayable
        },
        parseConfidence: Math.max(0, parseConfidence),
        warnings,
        rawText: textContent
    };
}

/**
 * Convert Form 16 data to ITR filing format
 */
export function convertForm16ToFilingData(form16: Form16Data) {
    return {
        personalInfo: {
            name: form16.employeeName,
            pan: form16.employeePAN,
            assessmentYear: form16.assessmentYear
        },
        employer: {
            name: form16.employerName,
            tan: form16.employerTAN,
            pan: form16.employerPAN
        },
        income: {
            salary: form16.grossSalary,
            standardDeduction: form16.standardDeduction,
            professionalTax: form16.professionalTax,
            netSalary: form16.incomeFromSalary
        },
        exemptions: form16.exemptions,
        deductions: {
            section80C: Math.min(150000, form16.deductions.section80C),
            section80D: form16.deductions.section80D,
            section80CCD1B: Math.min(50000, form16.deductions.section80CCD1B),
            section80E: form16.deductions.section80E,
            section80G: form16.deductions.section80G,
            section80TTA: Math.min(10000, form16.deductions.section80TTA)
        },
        tds: {
            salary: form16.totalTDSDeducted,
            total: form16.totalTDSDeducted
        },
        taxComputation: form16.taxComputation
    };
}

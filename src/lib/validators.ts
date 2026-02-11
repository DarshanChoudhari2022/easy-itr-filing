/**
 * Validation Utilities for Indian Tax Filing
 * PAN, Aadhaar, IFSC, Pincode, GSTIN, TAN validators
 */

// ============ PAN VALIDATION ============
// PAN format: ABCDE1234F
// 4th character denotes entity type: P=Individual, C=Company, H=HUF, F=Firm, A=AOP, T=Trust, etc.
const PAN_REGEX = /^[A-Z]{3}[PCHABGJLFT][A-Z]\d{4}[A-Z]$/;

export function isValidPAN(pan: string): boolean {
    if (!pan || typeof pan !== 'string') return false;
    return PAN_REGEX.test(pan.toUpperCase().trim());
}

export function getPANEntityType(pan: string): string {
    if (!isValidPAN(pan)) return 'Unknown';
    const typeChar = pan.charAt(3);
    const types: Record<string, string> = {
        'P': 'Individual',
        'C': 'Company',
        'H': 'HUF',
        'F': 'Firm',
        'A': 'Association of Persons',
        'B': 'Body of Individuals',
        'G': 'Government',
        'J': 'Artificial Judicial Person',
        'L': 'Local Authority',
        'T': 'Trust',
    };
    return types[typeChar] || 'Unknown';
}

export function maskPAN(pan: string): string {
    if (!pan || pan.length < 10) return pan;
    return pan.substring(0, 3) + '****' + pan.substring(7);
}

// ============ AADHAAR VALIDATION ============
// Aadhaar: 12 digits, doesn't start with 0 or 1
const AADHAAR_REGEX = /^[2-9]\d{11}$/;

export function isValidAadhaar(aadhaar: string): boolean {
    if (!aadhaar || typeof aadhaar !== 'string') return false;
    const cleaned = aadhaar.replace(/[\s-]/g, '');
    return AADHAAR_REGEX.test(cleaned);
}

export function maskAadhaar(aadhaar: string): string {
    const cleaned = aadhaar.replace(/[\s-]/g, '');
    if (cleaned.length < 12) return aadhaar;
    return 'XXXX XXXX ' + cleaned.substring(8);
}

// ============ IFSC VALIDATION ============
// IFSC format: 4 letters (bank) + 0 + 6 alphanumeric characters
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function isValidIFSC(ifsc: string): boolean {
    if (!ifsc || typeof ifsc !== 'string') return false;
    return IFSC_REGEX.test(ifsc.toUpperCase().trim());
}

// ============ MOBILE VALIDATION ============
// Indian mobile: 10 digits starting with 6-9
const MOBILE_REGEX = /^[6-9]\d{9}$/;

export function isValidMobile(mobile: string): boolean {
    if (!mobile || typeof mobile !== 'string') return false;
    const cleaned = mobile.replace(/[\s+\-()]/g, '');
    // Remove +91 prefix if present
    const number = cleaned.startsWith('91') && cleaned.length === 12
        ? cleaned.substring(2)
        : cleaned;
    return MOBILE_REGEX.test(number);
}

// ============ PINCODE VALIDATION ============
// Indian pincode: 6 digits, first digit 1-9
const PINCODE_REGEX = /^[1-9]\d{5}$/;

export function isValidPincode(pincode: string): boolean {
    if (!pincode || typeof pincode !== 'string') return false;
    return PINCODE_REGEX.test(pincode.trim());
}

// ============ GSTIN VALIDATION ============
// GSTIN: 15 chars: 2-digit state code + PAN + 1 entity code + Z + checksum
const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z0-9]Z[A-Z0-9]$/;

export function isValidGSTIN(gstin: string): boolean {
    if (!gstin || typeof gstin !== 'string') return false;
    return GSTIN_REGEX.test(gstin.toUpperCase().trim());
}

// ============ TAN VALIDATION ============
// TAN format: 4 letters + 5 digits + 1 letter
const TAN_REGEX = /^[A-Z]{4}\d{5}[A-Z]$/;

export function isValidTAN(tan: string): boolean {
    if (!tan || typeof tan !== 'string') return false;
    return TAN_REGEX.test(tan.toUpperCase().trim());
}

// ============ EMAIL VALIDATION ============
const EMAIL_REGEX = /^[a-zA-Z0-9._+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

export function isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    return EMAIL_REGEX.test(email.trim());
}

// ============ ACCOUNT NUMBER VALIDATION ============
export function isValidAccountNumber(accountNumber: string): boolean {
    if (!accountNumber || typeof accountNumber !== 'string') return false;
    const cleaned = accountNumber.replace(/\s/g, '');
    // Indian bank accounts are typically 9-18 digits
    return /^\d{9,18}$/.test(cleaned);
}

// ============ INDIAN STATES LIST ============
export const INDIAN_STATES = [
    { code: 'AN', name: 'Andaman and Nicobar Islands' },
    { code: 'AP', name: 'Andhra Pradesh' },
    { code: 'AR', name: 'Arunachal Pradesh' },
    { code: 'AS', name: 'Assam' },
    { code: 'BR', name: 'Bihar' },
    { code: 'CH', name: 'Chandigarh' },
    { code: 'CT', name: 'Chhattisgarh' },
    { code: 'DN', name: 'Dadra & Nagar Haveli and Daman & Diu' },
    { code: 'DL', name: 'Delhi' },
    { code: 'GA', name: 'Goa' },
    { code: 'GJ', name: 'Gujarat' },
    { code: 'HR', name: 'Haryana' },
    { code: 'HP', name: 'Himachal Pradesh' },
    { code: 'JK', name: 'Jammu and Kashmir' },
    { code: 'JH', name: 'Jharkhand' },
    { code: 'KA', name: 'Karnataka' },
    { code: 'KL', name: 'Kerala' },
    { code: 'LA', name: 'Ladakh' },
    { code: 'LD', name: 'Lakshadweep' },
    { code: 'MP', name: 'Madhya Pradesh' },
    { code: 'MH', name: 'Maharashtra' },
    { code: 'MN', name: 'Manipur' },
    { code: 'ML', name: 'Meghalaya' },
    { code: 'MZ', name: 'Mizoram' },
    { code: 'NL', name: 'Nagaland' },
    { code: 'OR', name: 'Odisha' },
    { code: 'PY', name: 'Puducherry' },
    { code: 'PB', name: 'Punjab' },
    { code: 'RJ', name: 'Rajasthan' },
    { code: 'SK', name: 'Sikkim' },
    { code: 'TN', name: 'Tamil Nadu' },
    { code: 'TG', name: 'Telangana' },
    { code: 'TR', name: 'Tripura' },
    { code: 'UP', name: 'Uttar Pradesh' },
    { code: 'UK', name: 'Uttarakhand' },
    { code: 'WB', name: 'West Bengal' },
] as const;

// ============ ASSESSMENT YEAR UTILITIES ============
export function getCurrentAY(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 0-indexed
    // FY starts April 1. If we're past March, the AY is current_year+1
    if (month >= 4) {
        return `${year + 1}-${String(year + 2).slice(2)}`;
    }
    return `${year}-${String(year + 1).slice(2)}`;
}

export function getFYFromAY(ay: string): string {
    const startYear = parseInt(ay.split('-')[0]) - 1;
    return `${startYear}-${String(startYear + 1).slice(2)}`;
}

// ============ AMOUNT FORMATTING ============
export function formatINR(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(amount);
}

export function formatINRCompact(amount: number): string {
    if (amount >= 10000000) {
        return `₹${(amount / 10000000).toFixed(2)} Cr`;
    }
    if (amount >= 100000) {
        return `₹${(amount / 100000).toFixed(2)} L`;
    }
    if (amount >= 1000) {
        return `₹${(amount / 1000).toFixed(1)} K`;
    }
    return `₹${amount}`;
}

// ============ DATE OF BIRTH VALIDATION ============
export function isValidDOB(dob: Date | string): boolean {
    const date = typeof dob === 'string' ? new Date(dob) : dob;
    if (isNaN(date.getTime())) return false;

    const now = new Date();
    const ageInYears = (now.getTime() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

    // Must be between 18 and 120 years old
    return ageInYears >= 18 && ageInYears <= 120;
}

// ============ FORM VALIDATION HELPER ============
export interface ValidationError {
    field: string;
    message: string;
    severity: 'error' | 'warning';
}

export function validateProfileKYC(profile: {
    pan_number?: string;
    full_name?: string;
    date_of_birth?: string;
    gender?: string;
    father_name?: string;
    mobile?: string;
    city?: string;
    state?: string;
    pincode?: string;
}): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!profile.pan_number || !isValidPAN(profile.pan_number)) {
        errors.push({ field: 'pan_number', message: 'Valid PAN is required (e.g., ABCPD1234E)', severity: 'error' });
    }
    if (!profile.full_name || profile.full_name.trim().length < 2) {
        errors.push({ field: 'full_name', message: 'Full name is required (as on PAN card)', severity: 'error' });
    }
    if (!profile.date_of_birth || !isValidDOB(profile.date_of_birth)) {
        errors.push({ field: 'date_of_birth', message: 'Valid date of birth is required (must be 18+)', severity: 'error' });
    }
    if (!profile.gender || !['M', 'F', 'O'].includes(profile.gender)) {
        errors.push({ field: 'gender', message: 'Gender is required for ITR filing', severity: 'error' });
    }
    if (!profile.father_name || profile.father_name.trim().length < 2) {
        errors.push({ field: 'father_name', message: 'Father\'s name is required for ITR', severity: 'error' });
    }
    if (!profile.mobile || !isValidMobile(profile.mobile)) {
        errors.push({ field: 'mobile', message: 'Valid 10-digit mobile number is required', severity: 'warning' });
    }
    if (!profile.city) {
        errors.push({ field: 'city', message: 'City is required for address', severity: 'warning' });
    }
    if (!profile.state) {
        errors.push({ field: 'state', message: 'State is required for ITR filing', severity: 'error' });
    }
    if (!profile.pincode || !isValidPincode(profile.pincode)) {
        errors.push({ field: 'pincode', message: 'Valid 6-digit pincode is required', severity: 'warning' });
    }

    return errors;
}

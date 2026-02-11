import { AISData } from './ais-parser';

export const DEMO_AIS_DATA: AISData = {
    pan: "ABCDE1234F",
    financialYear: "2025-26",
    assessmentYear: "2026-27",
    generatedDate: new Date().toISOString(),
    totalTDSCredited: 151500,
    totalTCSCredited: 0,
    totalIncome: 1240000,

    tdsDetails: {
        salary: 150000,
        interest: 1500,
        dividend: 0,
        rent: 0,
        professional: 0,
        other: 0,
        total: 151500
    },

    incomeDetails: {
        salary: 1200000,
        interest: 35000,
        dividend: 5000,
        rentalIncome: 0,
        capitalGains: 0,
        businessIncome: 0,
        otherSources: 0
    },

    sftTransactions: {
        savingsDeposits: 500000,
        timeDeposits: 0,
        creditCardPayments: 120000,
        mutualFundPurchases: 50000,
        shareTransactions: 250000,
        propertyTransactions: 0,
        foreignRemittances: 0
    },

    records: [
        {
            id: "TDS_SAL_001",
            category: "TDS_SALARY",
            subCategory: "Salary from Employer",
            informationSource: "MUM1234567",
            sourceName: "TECH SOLUTIONS PVT LTD",
            transactionDate: "2025-26",
            reportedValue: 1200000,
            status: "accepted"
        },
        {
            id: "TDS_INT_001",
            category: "TDS_INTEREST",
            subCategory: "Interest from Savings",
            informationSource: "HDFC0001234",
            sourceName: "HDFC BANK LTD",
            transactionDate: "2025-06-30",
            reportedValue: 15000,
            status: "accepted"
        },
        {
            id: "SFT_MF_001",
            category: "SFT_MUTUAL_FUND",
            subCategory: "Purchase of Units",
            informationSource: "FOLIO12345",
            sourceName: "SBI MUTUAL FUND",
            transactionDate: "2025-08-15",
            reportedValue: 25000,
            status: "accepted"
        },
        {
            id: "SFT_ST_001",
            category: "SFT_SHARES",
            subCategory: "Sale of Securities",
            informationSource: "CDSL123456",
            sourceName: "HDFC SECURITIES",
            transactionDate: "2025-11-20",
            reportedValue: 150000,
            status: "accepted"
        }
    ],

    warnings: [],
    lastUpdated: new Date()
};

import { computeVdaTaxForFinancialYear } from "./src/lib/taxmitra/tax-computation-engine";
import { NormalizedTransaction } from "./src/lib/taxmitra/coindcx-ingestion";

const txs: NormalizedTransaction[] = [
    {
        externalId: "test1",
        exchange: "CoinDCX",
        transactionType: "buy",
        isTaxableEvent: false,
        assetSymbol: "BTC",
        quoteAsset: "INR",
        pair: "BTC/INR",
        quantity: 1,
        pricePerUnit: 5000000,
        priceInr: 5000000,
        grossAmountQuote: 5000000,
        grossAmountInr: 5000000,
        feeAmount: 5000,
        feeAsset: "INR",
        feeInr: 5000,
        tdsAmount: 0,
        tdsRate: 0,
        tradeTimestamp: new Date("2024-05-15T10:00:00Z"),
        financialYear: "2024-25",
        assessmentYear: "2025-26",
        description: "BUY BTC",
        contentHash: "h1"
    },
    {
        externalId: "test2",
        exchange: "CoinDCX",
        transactionType: "sell",
        isTaxableEvent: true,
        assetSymbol: "BTC",
        quoteAsset: "INR",
        pair: "BTC/INR",
        quantity: 1,
        pricePerUnit: 6000000,
        priceInr: 6000000,
        grossAmountQuote: 6000000,
        grossAmountInr: 6000000,
        feeAmount: 6000,
        feeAsset: "INR",
        feeInr: 6000,
        tdsAmount: 60000,
        tdsRate: 0.01,
        tradeTimestamp: new Date("2024-06-15T10:00:00Z"),
        financialYear: "2024-25",
        assessmentYear: "2025-26",
        description: "SELL BTC",
        contentHash: "h2"
    }
];

const result = computeVdaTaxForFinancialYear(txs, [], "2024-25");
console.log(JSON.stringify(result, null, 2));

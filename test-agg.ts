import { isValidTrade } from "./src/lib/taxmitra/order-aggregator";
const tx: any = {
    priceInr: 0,
    pricePerUnit: Number.NaN,
    grossAmountInr: 0,
    transactionType: "buy",
    assetSymbol: "ADA",
    quantity: 10
};
console.log(isValidTrade(tx));

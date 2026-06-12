export const PRICE_PER_100KB = "$0.003";
export const FREE_TIER = "50 MB / month free";
export const FREE_UNITS = 500;

export const competitors = [
  { name: "Canonizr", price: "$0.003 / 100 KB", captioning: true },
  { name: "LlamaParse", price: "$0.003\u2013$0.14 / page", captioning: false },
  { name: "Unstructured", price: "$0.03 / page", captioning: true },
  { name: "Google Document AI", price: "$0.01\u2013$0.065 / page", captioning: false },
  { name: "AWS Textract", price: "~$0.015 / page", captioning: false },
] as const;

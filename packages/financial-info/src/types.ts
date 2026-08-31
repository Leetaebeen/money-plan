export type FinlifeProductKind = "DEPOSIT" | "SAVING";

export interface FinancialProductOption {
  termMonths: number;
  rateTypeCode: string;
  rateTypeName: string;
  savingTypeCode: string | null;
  savingTypeName: string | null;
  baseRatePct: number | null;
  maximumRatePct: number | null;
}

export interface OfficialFactSource {
  providerCode: "FSS_FINLIFE";
  providerName: "금융감독원 금융상품통합비교공시 금융상품한눈에";
  endpoint: string;
  disclosedMonth: string;
  submittedAtKst: string | null;
  collectedAt: string;
}

export interface FinancialProductFact {
  id: string;
  kind: FinlifeProductKind;
  institutionCode: string;
  institutionName: string;
  productCode: string;
  productName: string;
  joinWay: string | null;
  maturityInterest: string | null;
  specialConditions: string | null;
  joinRestrictionCode: string | null;
  eligibleCustomers: string | null;
  notes: string | null;
  maximumLimitWon: number | null;
  options: readonly FinancialProductOption[];
  source: OfficialFactSource;
}

export interface FinancialProductCollection {
  schemaVersion: "financial-product-facts-v1";
  query: {
    kind: FinlifeProductKind;
    financialGroupCode: string;
    financeCompany: string | null;
  };
  collectedAt: string;
  products: readonly FinancialProductFact[];
}

import assert from "node:assert/strict";
import test from "node:test";
import type { FinancialProductFact } from "@money-plan/financial-info";
import {
  filterProductFacts,
  loadFinancialProductCatalog,
  productInstitutions,
  productTerms,
} from "../src/features/products/product-facts.ts";

function product(overrides: Partial<FinancialProductFact> = {}): FinancialProductFact {
  return {
    id: "DEPOSIT:001:D001",
    kind: "DEPOSIT",
    institutionCode: "001",
    institutionName: "가나다은행",
    productCode: "D001",
    productName: "기본 예금",
    joinWay: null,
    maturityInterest: null,
    specialConditions: null,
    joinRestrictionCode: null,
    eligibleCustomers: null,
    notes: null,
    maximumLimitWon: null,
    options: [{
      termMonths: 12,
      rateTypeCode: "S",
      rateTypeName: "단리",
      savingTypeCode: null,
      savingTypeName: null,
      baseRatePct: 3,
      maximumRatePct: 3.5,
    }],
    source: {
      providerCode: "FSS_FINLIFE",
      providerName: "금융감독원 금융상품통합비교공시 금융상품한눈에",
      endpoint: "https://finlife.fss.or.kr/finlifeapi/depositProductsSearch.json",
      disclosedMonth: "2026-08",
      submittedAtKst: null,
      collectedAt: "2026-08-31T01:00:00.000Z",
    },
    ...overrides,
  };
}

test("fact filters use conditions without ranking products by rates", () => {
  const products = [
    product({ id: "DEPOSIT:002:D002", institutionCode: "002", institutionName: "하나은행", productName: "높은 금리", options: [{ ...product().options[0]!, maximumRatePct: 9 }] }),
    product({ productName: "생활 예금" }),
  ];

  const all = filterProductFacts(products, { query: "", kind: "ALL", institutionCode: "", termMonths: null });
  assert.deepEqual(all.map((item) => item.institutionName), ["가나다은행", "하나은행"]);

  const searched = filterProductFacts(products, { query: "생활", kind: "DEPOSIT", institutionCode: "001", termMonths: 12 });
  assert.deepEqual(searched.map((item) => item.productName), ["생활 예금"]);
});

test("fact filters derive unique institutions and terms", () => {
  const products = [
    product(),
    product({ id: "SAVING:002:S001", kind: "SAVING", institutionCode: "002", institutionName: "라마은행", productCode: "S001", options: [{ ...product().options[0]!, termMonths: 24 }] }),
    product({ id: "DEPOSIT:001:D003", productCode: "D003", productName: "두번째 예금" }),
  ];

  assert.deepEqual(productInstitutions(products), [
    { code: "001", name: "가나다은행" },
    { code: "002", name: "라마은행" },
  ]);
  assert.deepEqual(productTerms(products), [12, 24]);
});

test("catalog loader validates the local snapshot response", async () => {
  const fetchImplementation: typeof fetch = async () => Response.json({
    schemaVersion: "financial-product-catalog-v1",
    generatedAt: null,
    collections: [],
  });

  const catalog = await loadFinancialProductCatalog("/data/financial-products.json", fetchImplementation);
  assert.deepEqual(catalog.collections, []);
});

test("catalog loader reports HTTP and schema errors", async () => {
  await assert.rejects(
    loadFinancialProductCatalog("/missing.json", async () => new Response("", { status: 404 })),
    /HTTP 404/u,
  );
  await assert.rejects(
    loadFinancialProductCatalog("/invalid.json", async () => Response.json({ schemaVersion: "unknown" })),
    /스냅샷 형식 오류/u,
  );
});

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createFinancialProductCatalog,
  parseFinancialProductCatalog,
} from "../src/catalog.ts";
import { writeFinancialProductCatalogFile } from "../src/catalog-file.ts";
import type { FinancialProductCollection } from "../src/types.ts";

const COLLECTED_AT = "2026-08-31T01:00:00.000Z";

function collection(): FinancialProductCollection {
  return {
    schemaVersion: "financial-product-facts-v1",
    query: { kind: "DEPOSIT", financialGroupCode: "020000", financeCompany: null },
    collectedAt: COLLECTED_AT,
    products: [{
      id: "DEPOSIT:001:D001",
      kind: "DEPOSIT",
      institutionCode: "001",
      institutionName: "테스트은행",
      productCode: "D001",
      productName: "테스트예금",
      joinWay: "인터넷",
      maturityInterest: null,
      specialConditions: null,
      joinRestrictionCode: "1",
      eligibleCustomers: "제한없음",
      notes: null,
      maximumLimitWon: 100_000_000,
      options: [{
        termMonths: 12,
        rateTypeCode: "S",
        rateTypeName: "단리",
        savingTypeCode: null,
        savingTypeName: null,
        baseRatePct: 3.1,
        maximumRatePct: 3.4,
      }],
      source: {
        providerCode: "FSS_FINLIFE",
        providerName: "금융감독원 금융상품통합비교공시 금융상품한눈에",
        endpoint: "https://finlife.fss.or.kr/finlifeapi/depositProductsSearch.json",
        disclosedMonth: "2026-08",
        submittedAtKst: "202608311000",
        collectedAt: COLLECTED_AT,
      },
    }],
  };
}

test("catalog preserves validated official facts and generation time", () => {
  const catalog = createFinancialProductCatalog([collection()], COLLECTED_AT);

  assert.equal(catalog.schemaVersion, "financial-product-catalog-v1");
  assert.equal(catalog.generatedAt, COLLECTED_AT);
  assert.equal(catalog.collections[0]?.products[0]?.source.disclosedMonth, "2026-08");
});

test("empty catalog may explicitly represent data that has not been synced", () => {
  const catalog = parseFinancialProductCatalog({
    schemaVersion: "financial-product-catalog-v1",
    generatedAt: null,
    collections: [],
  });

  assert.equal(catalog.generatedAt, null);
  assert.deepEqual(catalog.collections, []);
});

test("catalog rejects non-official endpoints and inconsistent source times", () => {
  const invalidEndpoint = structuredClone(collection());
  invalidEndpoint.products[0]!.source.endpoint = "https://example.com/products.json";
  assert.throws(
    () => createFinancialProductCatalog([invalidEndpoint], COLLECTED_AT),
    /공식 HTTPS 주소/u,
  );

  const invalidTime = structuredClone(collection());
  invalidTime.products[0]!.source.collectedAt = "2026-08-31T02:00:00.000Z";
  assert.throws(
    () => createFinancialProductCatalog([invalidTime], COLLECTED_AT),
    /수집시각/u,
  );
});

test("catalog rejects duplicate products across collections", () => {
  assert.throws(
    () => createFinancialProductCatalog([collection(), collection()], COLLECTED_AT),
    /중복 상품/u,
  );
});

test("catalog file writer replaces the target only after validation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "money-plan-catalog-"));
  const targetPath = join(directory, "financial-products.json");
  try {
    await writeFile(targetPath, "previous snapshot\n", "utf8");
    const catalog = createFinancialProductCatalog([collection()], COLLECTED_AT);

    const writtenPath = await writeFinancialProductCatalogFile(targetPath, catalog);
    const written = await readFile(targetPath, "utf8");

    assert.equal(writtenPath, targetPath);
    assert.deepEqual(JSON.parse(written), catalog);
    assert.ok(written.endsWith("\n"));

    await assert.rejects(
      writeFinancialProductCatalogFile(targetPath, {
        schemaVersion: "unsupported",
        collections: [],
      }),
      /schemaVersion/u,
    );
    assert.equal(await readFile(targetPath, "utf8"), written);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

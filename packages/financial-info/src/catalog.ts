import type {
  FinancialProductCollection,
  FinancialProductFact,
  FinancialProductOption,
  FinlifeProductKind,
  OfficialFactSource,
} from "./types.ts";

export interface FinancialProductCatalog {
  schemaVersion: "financial-product-catalog-v1";
  generatedAt: string | null;
  collections: readonly FinancialProductCollection[];
}

type JsonObject = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`금융상품 스냅샷 형식 오류: ${message}`);
}

function objectValue(value: unknown, path: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${path} 객체가 없습니다.`);
  }
  return value as JsonObject;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${path} 문자열이 없습니다.`);
  return value;
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return stringValue(value, path);
}

function isoDateTime(value: unknown, path: string): string {
  const text = stringValue(value, path);
  if (Number.isNaN(Date.parse(text))) fail(`${path} 날짜가 올바르지 않습니다.`);
  return text;
}

function nonNegativeNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(`${path} 숫자가 올바르지 않습니다.`);
  }
  return value;
}

function nullableNumber(value: unknown, path: string): number | null {
  return value === null ? null : nonNegativeNumber(value, path);
}

function kindValue(value: unknown, path: string): FinlifeProductKind {
  if (value !== "DEPOSIT" && value !== "SAVING") fail(`${path} 상품 종류가 올바르지 않습니다.`);
  return value;
}

function parseOption(value: unknown, path: string): FinancialProductOption {
  const option = objectValue(value, path);
  const termMonths = nonNegativeNumber(option.termMonths, `${path}.termMonths`);
  if (!Number.isInteger(termMonths) || termMonths < 1) fail(`${path}.termMonths 기간이 올바르지 않습니다.`);
  return {
    termMonths,
    rateTypeCode: stringValue(option.rateTypeCode, `${path}.rateTypeCode`),
    rateTypeName: stringValue(option.rateTypeName, `${path}.rateTypeName`),
    savingTypeCode: nullableString(option.savingTypeCode, `${path}.savingTypeCode`),
    savingTypeName: nullableString(option.savingTypeName, `${path}.savingTypeName`),
    baseRatePct: nullableNumber(option.baseRatePct, `${path}.baseRatePct`),
    maximumRatePct: nullableNumber(option.maximumRatePct, `${path}.maximumRatePct`),
  };
}

function parseSource(value: unknown, path: string): OfficialFactSource {
  const source = objectValue(value, path);
  if (source.providerCode !== "FSS_FINLIFE") fail(`${path}.providerCode가 올바르지 않습니다.`);
  if (source.providerName !== "금융감독원 금융상품통합비교공시 금융상품한눈에") {
    fail(`${path}.providerName이 올바르지 않습니다.`);
  }
  const endpoint = stringValue(source.endpoint, `${path}.endpoint`);
  if (!endpoint.startsWith("https://finlife.fss.or.kr/finlifeapi/")) {
    fail(`${path}.endpoint가 공식 HTTPS 주소가 아닙니다.`);
  }
  const disclosedMonth = stringValue(source.disclosedMonth, `${path}.disclosedMonth`);
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(disclosedMonth)) {
    fail(`${path}.disclosedMonth가 YYYY-MM 형식이 아닙니다.`);
  }
  return {
    providerCode: "FSS_FINLIFE",
    providerName: "금융감독원 금융상품통합비교공시 금융상품한눈에",
    endpoint,
    disclosedMonth,
    submittedAtKst: nullableString(source.submittedAtKst, `${path}.submittedAtKst`),
    collectedAt: isoDateTime(source.collectedAt, `${path}.collectedAt`),
  };
}

function parseProduct(value: unknown, path: string): FinancialProductFact {
  const product = objectValue(value, path);
  const kind = kindValue(product.kind, `${path}.kind`);
  const institutionCode = stringValue(product.institutionCode, `${path}.institutionCode`);
  const productCode = stringValue(product.productCode, `${path}.productCode`);
  const id = stringValue(product.id, `${path}.id`);
  if (id !== `${kind}:${institutionCode}:${productCode}`) fail(`${path}.id 조합이 올바르지 않습니다.`);
  if (!Array.isArray(product.options)) fail(`${path}.options 목록이 없습니다.`);
  const maximumLimitWon = nullableNumber(product.maximumLimitWon, `${path}.maximumLimitWon`);
  if (maximumLimitWon !== null && !Number.isSafeInteger(maximumLimitWon)) {
    fail(`${path}.maximumLimitWon이 원 단위 정수가 아닙니다.`);
  }
  return {
    id,
    kind,
    institutionCode,
    institutionName: stringValue(product.institutionName, `${path}.institutionName`),
    productCode,
    productName: stringValue(product.productName, `${path}.productName`),
    joinWay: nullableString(product.joinWay, `${path}.joinWay`),
    maturityInterest: nullableString(product.maturityInterest, `${path}.maturityInterest`),
    specialConditions: nullableString(product.specialConditions, `${path}.specialConditions`),
    joinRestrictionCode: nullableString(product.joinRestrictionCode, `${path}.joinRestrictionCode`),
    eligibleCustomers: nullableString(product.eligibleCustomers, `${path}.eligibleCustomers`),
    notes: nullableString(product.notes, `${path}.notes`),
    maximumLimitWon,
    options: product.options.map((option, index) => parseOption(option, `${path}.options[${index}]`)),
    source: parseSource(product.source, `${path}.source`),
  };
}

function parseCollection(value: unknown, path: string): FinancialProductCollection {
  const collection = objectValue(value, path);
  if (collection.schemaVersion !== "financial-product-facts-v1") {
    fail(`${path}.schemaVersion이 지원되지 않습니다.`);
  }
  const query = objectValue(collection.query, `${path}.query`);
  const kind = kindValue(query.kind, `${path}.query.kind`);
  const financialGroupCode = stringValue(query.financialGroupCode, `${path}.query.financialGroupCode`);
  if (!/^\d{6}$/u.test(financialGroupCode)) fail(`${path}.query.financialGroupCode가 올바르지 않습니다.`);
  const collectedAt = isoDateTime(collection.collectedAt, `${path}.collectedAt`);
  if (!Array.isArray(collection.products)) fail(`${path}.products 목록이 없습니다.`);
  const products = collection.products.map((product, index) => parseProduct(product, `${path}.products[${index}]`));
  for (const product of products) {
    if (product.kind !== kind) fail(`${path}의 상품 종류가 조회 조건과 다릅니다.`);
    if (product.source.collectedAt !== collectedAt) fail(`${path}의 상품 수집시각이 일치하지 않습니다.`);
  }
  return {
    schemaVersion: "financial-product-facts-v1",
    query: {
      kind,
      financialGroupCode,
      financeCompany: nullableString(query.financeCompany, `${path}.query.financeCompany`),
    },
    collectedAt,
    products,
  };
}

export function createFinancialProductCatalog(
  collections: readonly FinancialProductCollection[],
  generatedAt = new Date().toISOString(),
): FinancialProductCatalog {
  return parseFinancialProductCatalog({
    schemaVersion: "financial-product-catalog-v1",
    generatedAt,
    collections,
  });
}

export function parseFinancialProductCatalog(value: unknown): FinancialProductCatalog {
  const catalog = objectValue(value, "catalog");
  if (catalog.schemaVersion !== "financial-product-catalog-v1") {
    fail("schemaVersion이 지원되지 않습니다.");
  }
  if (!Array.isArray(catalog.collections)) fail("collections 목록이 없습니다.");
  const generatedAt = catalog.generatedAt === null
    ? null
    : isoDateTime(catalog.generatedAt, "catalog.generatedAt");
  const collections = catalog.collections.map((collection, index) => (
    parseCollection(collection, `catalog.collections[${index}]`)
  ));
  if (collections.length > 0 && generatedAt === null) fail("데이터가 있는 스냅샷에 생성시각이 없습니다.");
  const ids = new Set<string>();
  for (const product of collections.flatMap((collection) => collection.products)) {
    if (ids.has(product.id)) fail(`중복 상품이 있습니다: ${product.id}`);
    ids.add(product.id);
  }
  return {
    schemaVersion: "financial-product-catalog-v1",
    generatedAt,
    collections,
  };
}

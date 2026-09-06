import {
  parseFinancialProductCatalog,
  type FinancialProductCatalog,
} from "./catalog.ts";

export interface FinancialProductCatalogSummary {
  generatedAt: string | null;
  ageHours: number | null;
  collectionCount: number;
  productCount: number;
  depositCount: number;
  savingCount: number;
  institutionCount: number;
  disclosedMonths: readonly string[];
}

export interface CatalogDeploymentRequirements {
  requireProducts?: boolean;
  maxAgeHours?: number;
}

export function summarizeFinancialProductCatalog(
  value: unknown,
  now = new Date(),
): FinancialProductCatalogSummary {
  const catalog: FinancialProductCatalog = parseFinancialProductCatalog(value);
  const products = catalog.collections.flatMap((collection) => collection.products);
  const generatedAtMs = catalog.generatedAt === null ? null : Date.parse(catalog.generatedAt);
  const disclosedMonths = Array.from(new Set(
    products.map((product) => product.source.disclosedMonth),
  )).sort();

  return {
    generatedAt: catalog.generatedAt,
    ageHours: generatedAtMs === null ? null : (now.getTime() - generatedAtMs) / 3_600_000,
    collectionCount: catalog.collections.length,
    productCount: products.length,
    depositCount: products.filter((product) => product.kind === "DEPOSIT").length,
    savingCount: products.filter((product) => product.kind === "SAVING").length,
    institutionCount: new Set(products.map((product) => product.institutionCode)).size,
    disclosedMonths,
  };
}

export function assertFinancialProductCatalogDeployable(
  summary: FinancialProductCatalogSummary,
  requirements: CatalogDeploymentRequirements = {},
): void {
  if (requirements.requireProducts && summary.productCount === 0) {
    throw new Error("금융상품 스냅샷에 배포할 상품이 없습니다.");
  }
  if (requirements.requireProducts && summary.generatedAt === null) {
    throw new Error("금융상품 스냅샷 생성시각이 없습니다.");
  }
  if (summary.ageHours !== null && summary.ageHours < -1) {
    throw new Error("금융상품 스냅샷 생성시각이 현재보다 미래입니다.");
  }
  if (
    requirements.maxAgeHours !== undefined &&
    (summary.ageHours === null || summary.ageHours > requirements.maxAgeHours)
  ) {
    throw new Error(`금융상품 스냅샷이 ${requirements.maxAgeHours}시간보다 오래됐습니다.`);
  }
}

export function formatFinancialProductCatalogSummary(
  summary: FinancialProductCatalogSummary,
): string {
  const generatedAt = summary.generatedAt ?? "미연결";
  const age = summary.ageHours === null ? "미확인" : `${summary.ageHours.toFixed(1)}시간`;
  const disclosedMonths = summary.disclosedMonths.length > 0
    ? summary.disclosedMonths.join(", ")
    : "없음";

  return [
    "## 금융상품 스냅샷",
    "",
    "| 항목 | 값 |",
    "| --- | ---: |",
    `| 생성시각(UTC) | ${generatedAt} |`,
    `| 경과시간 | ${age} |`,
    `| 수집 묶음 | ${summary.collectionCount}개 |`,
    `| 전체 상품 | ${summary.productCount}개 |`,
    `| 정기예금 | ${summary.depositCount}개 |`,
    `| 적금 | ${summary.savingCount}개 |`,
    `| 금융회사 | ${summary.institutionCount}곳 |`,
    `| 공시월 | ${disclosedMonths} |`,
    "",
  ].join("\n");
}

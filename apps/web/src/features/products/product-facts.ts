import {
  parseFinancialProductCatalog,
  type FinancialProductCatalog,
} from "@money-plan/financial-info/catalog";
import type {
  FinancialProductFact,
  FinlifeProductKind,
} from "@money-plan/financial-info";

export interface ProductFactFilters {
  query: string;
  kind: FinlifeProductKind | "ALL";
  institutionCode: string;
  termMonths: number | null;
}

export const emptyProductFactFilters: ProductFactFilters = {
  query: "",
  kind: "ALL",
  institutionCode: "",
  termMonths: null,
};

export async function loadFinancialProductCatalog(
  url: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<FinancialProductCatalog> {
  let response: Response;
  try {
    response = await fetchImplementation(url, { headers: { accept: "application/json" } });
  } catch {
    throw new Error("금융상품 스냅샷을 불러오지 못했습니다.");
  }
  if (!response.ok) {
    throw new Error(`금융상품 스냅샷을 불러오지 못했습니다. HTTP ${response.status}`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("금융상품 스냅샷이 JSON 형식이 아닙니다.");
  }
  return parseFinancialProductCatalog(payload);
}

export function catalogProducts(catalog: FinancialProductCatalog): FinancialProductFact[] {
  return catalog.collections.flatMap((collection) => collection.products).slice();
}

export function productInstitutions(products: readonly FinancialProductFact[]) {
  return Array.from(new Map(
    products.map((product) => [product.institutionCode, product.institutionName]),
  ).entries())
    .map(([code, name]) => ({ code, name }))
    .sort((left, right) => left.name.localeCompare(right.name, "ko") || left.code.localeCompare(right.code));
}

export function productTerms(products: readonly FinancialProductFact[]): number[] {
  return Array.from(new Set(
    products.flatMap((product) => product.options.map((option) => option.termMonths)),
  )).sort((left, right) => left - right);
}

export function filterProductFacts(
  products: readonly FinancialProductFact[],
  filters: ProductFactFilters,
): FinancialProductFact[] {
  const query = filters.query.trim().toLocaleLowerCase("ko-KR");
  return products.filter((product) => {
    if (filters.kind !== "ALL" && product.kind !== filters.kind) return false;
    if (filters.institutionCode && product.institutionCode !== filters.institutionCode) return false;
    if (
      filters.termMonths !== null &&
      !product.options.some((option) => option.termMonths === filters.termMonths)
    ) return false;
    if (!query) return true;
    return `${product.institutionName} ${product.productName}`
      .toLocaleLowerCase("ko-KR")
      .includes(query);
  }).sort((left, right) =>
    left.institutionName.localeCompare(right.institutionName, "ko") ||
    left.productName.localeCompare(right.productName, "ko") ||
    left.productCode.localeCompare(right.productCode));
}

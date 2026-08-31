import type {
  FinancialProductCollection,
  FinancialProductFact,
  FinancialProductOption,
  FinlifeProductKind,
} from "./types.ts";

const PROVIDER_NAME = "금융감독원 금융상품통합비교공시 금융상품한눈에" as const;

export const FINLIFE_ENDPOINTS = {
  DEPOSIT: "https://finlife.fss.or.kr/finlifeapi/depositProductsSearch.json",
  SAVING: "https://finlife.fss.or.kr/finlifeapi/savingProductsSearch.json",
} as const satisfies Record<FinlifeProductKind, string>;

type FetchImplementation = typeof fetch;

export interface CollectFinlifeProductsOptions {
  authKey: string;
  kind: FinlifeProductKind;
  financialGroupCode: string;
  financeCompany?: string;
  fetchImplementation?: FetchImplementation;
  now?: () => Date;
  maxPages?: number;
}

export class FinlifeCollectionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FinlifeCollectionError";
    this.code = code;
  }
}

type JsonObject = Record<string, unknown>;

interface ParsedPage {
  maxPageNo: number;
  baseList: JsonObject[];
  optionList: JsonObject[];
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(object: JsonObject, key: string): string {
  const value = object[key];
  if (typeof value !== "string" && typeof value !== "number") {
    throw new FinlifeCollectionError("INVALID_RESPONSE", `공식 응답의 ${key} 값이 없습니다.`);
  }
  const text = String(value).trim();
  if (!text) {
    throw new FinlifeCollectionError("INVALID_RESPONSE", `공식 응답의 ${key} 값이 비어 있습니다.`);
  }
  return text;
}

function optionalText(object: JsonObject, key: string): string | null {
  const value = object[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new FinlifeCollectionError("INVALID_RESPONSE", `공식 응답의 ${key} 형식이 올바르지 않습니다.`);
  }
  const text = String(value).trim();
  return text || null;
}

function integerText(value: unknown, key: string, minimum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new FinlifeCollectionError("INVALID_RESPONSE", `공식 응답의 ${key} 값이 올바르지 않습니다.`);
  }
  return parsed;
}

function optionalNumber(object: JsonObject, key: string): number | null {
  const value = object[key];
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new FinlifeCollectionError("INVALID_RESPONSE", `공식 응답의 ${key} 값이 올바르지 않습니다.`);
  }
  return parsed;
}

function optionalWon(object: JsonObject, key: string): number | null {
  const parsed = optionalNumber(object, key);
  if (parsed === null) return null;
  if (!Number.isSafeInteger(parsed)) {
    throw new FinlifeCollectionError("INVALID_RESPONSE", `공식 응답의 ${key} 값이 원 단위 정수가 아닙니다.`);
  }
  return parsed;
}

function arrayOfObjects(value: unknown, key: string): JsonObject[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => !isObject(item))) {
    throw new FinlifeCollectionError("INVALID_RESPONSE", `공식 응답의 ${key} 목록 형식이 올바르지 않습니다.`);
  }
  return value;
}

function parsePage(payload: unknown): ParsedPage {
  if (!isObject(payload) || !isObject(payload.result)) {
    throw new FinlifeCollectionError("INVALID_RESPONSE", "공식 응답에 result 객체가 없습니다.");
  }
  const result = payload.result;
  const errorCode = requiredText(result, "err_cd");
  const errorMessage = optionalText(result, "err_msg") ?? "알 수 없는 오류";

  if (errorCode !== "000") {
    throw new FinlifeCollectionError(errorCode, `금융감독원 API 오류: ${errorMessage}`);
  }

  return {
    maxPageNo: Math.max(1, integerText(result.max_page_no ?? 1, "max_page_no", 0)),
    baseList: arrayOfObjects(result.baseList, "baseList"),
    optionList: arrayOfObjects(result.optionList, "optionList"),
  };
}

function productKey(object: JsonObject): string {
  return `${requiredText(object, "fin_co_no")}:${requiredText(object, "fin_prdt_cd")}`;
}

function normalizeDisclosedMonth(raw: string): string {
  if (!/^\d{6}$/u.test(raw)) {
    throw new FinlifeCollectionError("INVALID_RESPONSE", "공시 제출월 형식이 YYYYMM이 아닙니다.");
  }
  const month = Number(raw.slice(4));
  if (month < 1 || month > 12) {
    throw new FinlifeCollectionError("INVALID_RESPONSE", "공시 제출월의 월 값이 올바르지 않습니다.");
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function normalizeOption(option: JsonObject): FinancialProductOption {
  return {
    termMonths: integerText(option.save_trm, "save_trm", 1),
    rateTypeCode: requiredText(option, "intr_rate_type"),
    rateTypeName: requiredText(option, "intr_rate_type_nm"),
    savingTypeCode: optionalText(option, "rsrv_type"),
    savingTypeName: optionalText(option, "rsrv_type_nm"),
    baseRatePct: optionalNumber(option, "intr_rate"),
    maximumRatePct: optionalNumber(option, "intr_rate2"),
  };
}

function optionSort(left: FinancialProductOption, right: FinancialProductOption): number {
  return left.termMonths - right.termMonths ||
    left.rateTypeCode.localeCompare(right.rateTypeCode) ||
    (left.savingTypeCode ?? "").localeCompare(right.savingTypeCode ?? "");
}

function normalizeProduct(
  kind: FinlifeProductKind,
  base: JsonObject,
  options: readonly JsonObject[],
  endpoint: string,
  collectedAt: string,
): FinancialProductFact {
  const institutionCode = requiredText(base, "fin_co_no");
  const productCode = requiredText(base, "fin_prdt_cd");
  return {
    id: `${kind}:${institutionCode}:${productCode}`,
    kind,
    institutionCode,
    institutionName: requiredText(base, "kor_co_nm"),
    productCode,
    productName: requiredText(base, "fin_prdt_nm"),
    joinWay: optionalText(base, "join_way"),
    maturityInterest: optionalText(base, "mtrt_int"),
    specialConditions: optionalText(base, "spcl_cnd"),
    joinRestrictionCode: optionalText(base, "join_deny"),
    eligibleCustomers: optionalText(base, "join_member"),
    notes: optionalText(base, "etc_note"),
    maximumLimitWon: optionalWon(base, "max_limit"),
    options: options.map(normalizeOption).sort(optionSort),
    source: {
      providerCode: "FSS_FINLIFE",
      providerName: PROVIDER_NAME,
      endpoint,
      disclosedMonth: normalizeDisclosedMonth(requiredText(base, "dcls_month")),
      submittedAtKst: optionalText(base, "fin_co_subm_day"),
      collectedAt,
    },
  };
}

function validateOptions(options: CollectFinlifeProductsOptions): void {
  if (!options.authKey.trim()) {
    throw new FinlifeCollectionError("AUTH_REQUIRED", "FINLIFE API 인증키가 필요합니다.");
  }
  if (!/^\d{6}$/u.test(options.financialGroupCode)) {
    throw new FinlifeCollectionError("INVALID_QUERY", "금융회사 권역 코드는 숫자 6자리여야 합니다.");
  }
  if (options.maxPages !== undefined && (!Number.isInteger(options.maxPages) || options.maxPages < 1)) {
    throw new FinlifeCollectionError("INVALID_QUERY", "최대 페이지 수는 1 이상의 정수여야 합니다.");
  }
}

export async function collectFinlifeProducts(
  options: CollectFinlifeProductsOptions,
): Promise<FinancialProductCollection> {
  validateOptions(options);
  const endpoint = FINLIFE_ENDPOINTS[options.kind];
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const collectedAt = (options.now ?? (() => new Date()))().toISOString();
  const maxPages = options.maxPages ?? 100;
  const bases: JsonObject[] = [];
  const productOptions: JsonObject[] = [];
  let expectedPages = 1;

  for (let pageNo = 1; pageNo <= expectedPages; pageNo += 1) {
    if (pageNo > maxPages) {
      throw new FinlifeCollectionError("PAGE_LIMIT", `공식 응답 페이지가 설정한 한도 ${maxPages}개를 초과했습니다.`);
    }
    const url = new URL(endpoint);
    url.searchParams.set("auth", options.authKey);
    url.searchParams.set("topFinGrpNo", options.financialGroupCode);
    url.searchParams.set("pageNo", String(pageNo));
    if (options.financeCompany?.trim()) {
      url.searchParams.set("financeCd", options.financeCompany.trim());
    }

    let response: Response;
    try {
      response = await fetchImplementation(url);
    } catch {
      throw new FinlifeCollectionError("NETWORK_ERROR", "금융감독원 API에 연결하지 못했습니다.");
    }
    if (!response.ok) {
      throw new FinlifeCollectionError("HTTP_ERROR", `금융감독원 API가 HTTP ${response.status}로 응답했습니다.`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FinlifeCollectionError("INVALID_JSON", "금융감독원 API 응답이 JSON 형식이 아닙니다.");
    }
    const parsed = parsePage(payload);
    if (pageNo === 1) expectedPages = parsed.maxPageNo;
    bases.push(...parsed.baseList);
    productOptions.push(...parsed.optionList);
  }

  const optionsByProduct = new Map<string, JsonObject[]>();
  for (const option of productOptions) {
    const key = productKey(option);
    const current = optionsByProduct.get(key) ?? [];
    current.push(option);
    optionsByProduct.set(key, current);
  }

  const seen = new Set<string>();
  const products = bases.map((base) => {
    const key = productKey(base);
    if (seen.has(key)) {
      throw new FinlifeCollectionError("DUPLICATE_PRODUCT", `공식 응답에 중복 상품이 있습니다: ${key}`);
    }
    seen.add(key);
    return normalizeProduct(
      options.kind,
      base,
      optionsByProduct.get(key) ?? [],
      endpoint,
      collectedAt,
    );
  }).sort((left, right) =>
    left.institutionName.localeCompare(right.institutionName, "ko") ||
    left.productName.localeCompare(right.productName, "ko") ||
    left.productCode.localeCompare(right.productCode));

  for (const key of optionsByProduct.keys()) {
    if (!seen.has(key)) {
      throw new FinlifeCollectionError(
        "ORPHAN_OPTION",
        `공식 응답의 금리 옵션에 대응하는 상품 기본정보가 없습니다: ${key}`,
      );
    }
  }

  return {
    schemaVersion: "financial-product-facts-v1",
    query: {
      kind: options.kind,
      financialGroupCode: options.financialGroupCode,
      financeCompany: options.financeCompany?.trim() || null,
    },
    collectedAt,
    products,
  };
}

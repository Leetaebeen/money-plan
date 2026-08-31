import assert from "node:assert/strict";
import test from "node:test";
import {
  collectFinlifeProducts,
  FinlifeCollectionError,
} from "../src/index.ts";

const AUTH_PLACEHOLDER = "placeholder";
const COLLECTED_AT = "2026-08-30T08:00:00.000Z";

function baseProduct(overrides: Record<string, unknown> = {}) {
  return {
    dcls_month: "202608",
    fin_co_no: "0010001",
    kor_co_nm: "테스트은행",
    fin_prdt_cd: "D001",
    fin_prdt_nm: "테스트 정기예금",
    join_way: "인터넷,스마트폰",
    mtrt_int: "만기 후 별도 금리",
    spcl_cnd: "조건 없음",
    join_deny: "1",
    join_member: "제한 없음",
    etc_note: "공시 유의사항",
    max_limit: "100000000",
    fin_co_subm_day: "202608301200",
    ...overrides,
  };
}

function productOption(overrides: Record<string, unknown> = {}) {
  return {
    fin_co_no: "0010001",
    fin_prdt_cd: "D001",
    intr_rate_type: "S",
    intr_rate_type_nm: "단리",
    save_trm: "12",
    intr_rate: "3.10",
    intr_rate2: "3.40",
    ...overrides,
  };
}

function successResponse(
  baseList: unknown[],
  optionList: unknown[],
  page = 1,
  maxPage = 1,
): Response {
  return Response.json({
    result: {
      err_cd: "000",
      err_msg: "정상",
      total_count: String(baseList.length),
      max_page_no: String(maxPage),
      now_page_no: String(page),
      baseList,
      optionList,
    },
  });
}

test("collector combines official base and option facts without exposing the credential", async () => {
  const requestedUrls: string[] = [];
  const fetchImplementation: typeof fetch = async (input) => {
    requestedUrls.push(String(input));
    return successResponse([baseProduct()], [productOption()]);
  };

  const collection = await collectFinlifeProducts({
    authKey: AUTH_PLACEHOLDER,
    kind: "DEPOSIT",
    financialGroupCode: "020000",
    fetchImplementation,
    now: () => new Date(COLLECTED_AT),
  });

  assert.match(requestedUrls[0] ?? "", /auth=placeholder/u);
  assert.match(requestedUrls[0] ?? "", /topFinGrpNo=020000/u);
  assert.equal(collection.products[0]?.productName, "테스트 정기예금");
  assert.equal(collection.products[0]?.options[0]?.termMonths, 12);
  assert.equal(collection.products[0]?.options[0]?.maximumRatePct, 3.4);
  assert.equal(collection.products[0]?.source.disclosedMonth, "2026-08");
  assert.equal(collection.products[0]?.source.collectedAt, COLLECTED_AT);
  assert.doesNotMatch(JSON.stringify(collection), new RegExp(AUTH_PLACEHOLDER, "u"));
});

test("collector follows every reported page and keeps a stable product order", async () => {
  const requestedPages: string[] = [];
  const fetchImplementation: typeof fetch = async (input) => {
    const page = new URL(String(input)).searchParams.get("pageNo") ?? "";
    requestedPages.push(page);
    if (page === "1") {
      return successResponse([
        baseProduct({ fin_co_no: "002", fin_prdt_cd: "B", kor_co_nm: "하나은행" }),
      ], [
        productOption({ fin_co_no: "002", fin_prdt_cd: "B" }),
      ], 1, 2);
    }
    return successResponse([
      baseProduct({ fin_co_no: "001", fin_prdt_cd: "A", kor_co_nm: "가나다은행" }),
    ], [
      productOption({ fin_co_no: "001", fin_prdt_cd: "A" }),
    ], 2, 2);
  };

  const collection = await collectFinlifeProducts({
    authKey: AUTH_PLACEHOLDER,
    kind: "DEPOSIT",
    financialGroupCode: "020000",
    fetchImplementation,
    now: () => new Date(COLLECTED_AT),
  });

  assert.deepEqual(requestedPages, ["1", "2"]);
  assert.deepEqual(collection.products.map((product) => product.institutionName), ["가나다은행", "하나은행"]);
});

test("collector preserves saving-specific option facts", async () => {
  const fetchImplementation: typeof fetch = async () => successResponse(
    [baseProduct({ fin_prdt_cd: "S001", fin_prdt_nm: "테스트 적금" })],
    [productOption({
      fin_prdt_cd: "S001",
      rsrv_type: "F",
      rsrv_type_nm: "정액적립식",
    })],
  );

  const collection = await collectFinlifeProducts({
    authKey: AUTH_PLACEHOLDER,
    kind: "SAVING",
    financialGroupCode: "020000",
    fetchImplementation,
    now: () => new Date(COLLECTED_AT),
  });

  assert.equal(collection.products[0]?.kind, "SAVING");
  assert.equal(collection.products[0]?.options[0]?.savingTypeName, "정액적립식");
});

test("collector surfaces official error codes without leaking the credential", async () => {
  const fetchImplementation: typeof fetch = async () => Response.json({
    result: { err_cd: "010", err_msg: "미등록 인증키", total_count: "0" },
  });

  await assert.rejects(
    collectFinlifeProducts({
      authKey: AUTH_PLACEHOLDER,
      kind: "DEPOSIT",
      financialGroupCode: "020000",
      fetchImplementation,
    }),
    (error: unknown) => {
      assert.ok(error instanceof FinlifeCollectionError);
      assert.equal(error.code, "010");
      assert.match(error.message, /미등록 인증키/u);
      assert.doesNotMatch(error.message, new RegExp(AUTH_PLACEHOLDER, "u"));
      return true;
    },
  );
});

test("collector rejects malformed official facts instead of silently omitting them", async () => {
  const fetchImplementation: typeof fetch = async () => successResponse(
    [baseProduct({ dcls_month: "202613" })],
    [productOption()],
  );

  await assert.rejects(
    collectFinlifeProducts({
      authKey: AUTH_PLACEHOLDER,
      kind: "DEPOSIT",
      financialGroupCode: "020000",
      fetchImplementation,
    }),
    (error: unknown) => error instanceof FinlifeCollectionError && error.code === "INVALID_RESPONSE",
  );
});

test("collector rejects rate options that have no matching product fact", async () => {
  const fetchImplementation: typeof fetch = async () => successResponse(
    [baseProduct()],
    [productOption({ fin_prdt_cd: "UNKNOWN" })],
  );

  await assert.rejects(
    collectFinlifeProducts({
      authKey: AUTH_PLACEHOLDER,
      kind: "DEPOSIT",
      financialGroupCode: "020000",
      fetchImplementation,
    }),
    (error: unknown) => (
      error instanceof FinlifeCollectionError && error.code === "ORPHAN_OPTION"
    ),
  );
});

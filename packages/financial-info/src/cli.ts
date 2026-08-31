import { createFinancialProductCatalog } from "./catalog.ts";
import { writeFinancialProductCatalogFile } from "./catalog-file.ts";
import { collectFinlifeProducts, FinlifeCollectionError } from "./finlife.ts";
import type { FinlifeProductKind } from "./types.ts";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requestedKinds(raw: string | undefined): FinlifeProductKind[] {
  if (!raw || raw === "all") return ["DEPOSIT", "SAVING"];
  if (raw === "deposit") return ["DEPOSIT"];
  if (raw === "saving") return ["SAVING"];
  throw new FinlifeCollectionError("INVALID_QUERY", "--kind는 deposit, saving, all 중 하나여야 합니다.");
}

async function main(): Promise<void> {
  const authKey = process.env.FINLIFE_API_KEY;
  if (!authKey) {
    throw new FinlifeCollectionError(
      "AUTH_REQUIRED",
      "FINLIFE_API_KEY 환경변수에 금융상품 한눈에 인증키를 설정해 주세요.",
    );
  }
  const financialGroupCode = argumentValue("--group") ?? "020000";
  const financeCompany = argumentValue("--finance");
  const kinds = requestedKinds(argumentValue("--kind"));
  const collections = [];

  for (const kind of kinds) {
    collections.push(await collectFinlifeProducts({
      authKey,
      kind,
      financialGroupCode,
      financeCompany,
    }));
  }

  const catalog = createFinancialProductCatalog(collections);
  const outputRequested = process.argv.includes("--output");
  const outputPath = argumentValue("--output");
  if (outputRequested && (!outputPath || outputPath.startsWith("--"))) {
    throw new FinlifeCollectionError(
      "INVALID_QUERY",
      "--output 다음에 저장할 JSON 파일 경로를 입력해 주세요.",
    );
  }
  if (outputPath) {
    const writtenPath = await writeFinancialProductCatalogFile(outputPath, catalog);
    process.stderr.write(`금융상품 스냅샷을 저장했습니다: ${writtenPath}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "금융상품 정보를 수집하지 못했습니다.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

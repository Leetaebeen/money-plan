import { appendFile, readFile } from "node:fs/promises";
import {
  assertFinancialProductCatalogDeployable,
  formatFinancialProductCatalogSummary,
  summarizeFinancialProductCatalog,
} from "./catalog-report.ts";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} 다음에 값을 입력해 주세요.`);
  }
  return value;
}

function positiveNumber(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name}에는 0보다 큰 숫자를 입력해 주세요.`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const inputPath = argumentValue("--input");
  if (!inputPath || inputPath.startsWith("--")) {
    throw new Error("--input 다음에 금융상품 스냅샷 JSON 경로를 입력해 주세요.");
  }
  const payload = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const summary = summarizeFinancialProductCatalog(payload);
  assertFinancialProductCatalogDeployable(summary, {
    requireProducts: process.argv.includes("--require-products"),
    maxAgeHours: positiveNumber(argumentValue("--max-age-hours"), "--max-age-hours"),
  });
  const markdown = formatFinancialProductCatalogSummary(summary);

  if (process.argv.includes("--github-summary")) {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryPath) throw new Error("GITHUB_STEP_SUMMARY 환경변수가 없습니다.");
    await appendFile(summaryPath, markdown, "utf8");
  }
  process.stdout.write(markdown);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "금융상품 스냅샷 보고서를 만들지 못했습니다.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

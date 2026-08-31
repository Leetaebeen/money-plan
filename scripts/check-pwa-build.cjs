const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const outputDirectory = path.resolve(__dirname, "../apps/web/dist");

function readOutput(relativePath) {
  const absolutePath = path.join(outputDirectory, relativePath);
  assert.ok(fs.existsSync(absolutePath), `PWA 산출물이 없습니다: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

const indexHtml = readOutput("index.html");
const calculatorHtml = readOutput("calculator/index.html");
const manifest = JSON.parse(readOutput("manifest.webmanifest"));
const financialProductCatalog = JSON.parse(readOutput("data/financial-products.json"));
const serviceWorker = readOutput("sw.js");

assert.match(indexHtml, /<html\s+lang=["']ko["']/i, "문서 기본 언어가 한국어가 아닙니다.");
assert.match(indexHtml, /name=["']viewport["']/i, "모바일 viewport 메타데이터가 없습니다.");
assert.match(indexHtml, /name=["']theme-color["']/i, "브라우저 테마 색상 메타데이터가 없습니다.");
assert.match(indexHtml, /name=["']description["']/i, "검색·설치 설명 메타데이터가 없습니다.");
assert.match(indexHtml, /rel=["']manifest["']/i, "웹 앱 manifest 연결이 없습니다.");
assert.match(calculatorHtml, /<html\s+lang=["']ko["']/i, "공개 계산기 문서 기본 언어가 한국어가 아닙니다.");
assert.match(calculatorHtml, /name=["']viewport["']/i, "공개 계산기 모바일 viewport가 없습니다.");
assert.match(calculatorHtml, /name=["']description["']/i, "공개 계산기 검색 설명이 없습니다.");
assert.equal(financialProductCatalog.schemaVersion, "financial-product-catalog-v1");
assert.ok(
  Array.isArray(financialProductCatalog.collections),
  "금융상품 사실조회 스냅샷의 collections가 배열이 아닙니다.",
);

assert.equal(manifest.lang, "ko-KR");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.equal(manifest.id, "./");
assert.ok(manifest.name && manifest.short_name && manifest.description, "설치 화면용 앱 이름과 설명이 없습니다.");
assert.ok(manifest.theme_color && manifest.background_color, "PWA 시작 화면 색상이 없습니다.");
assert.ok(
  manifest.icons?.some((icon) => icon.src && icon.purpose?.includes("any")),
  "일반 용도의 PWA 아이콘이 없습니다.",
);
assert.ok(
  manifest.icons?.some((icon) => icon.src && icon.purpose?.includes("maskable")),
  "마스커블 PWA 아이콘이 없습니다.",
);

for (const precachedPath of ["index.html", "calculator/index.html", "data/financial-products.json", "manifest.webmanifest", "money-plan-icon.svg"]) {
  assert.ok(
    serviceWorker.includes(`url:"${precachedPath}"`),
    `서비스 워커가 핵심 파일을 미리 저장하지 않습니다: ${precachedPath}`,
  );
}

const css = fs.readdirSync(path.join(outputDirectory, "assets"))
  .filter((fileName) => fileName.endsWith(".css"))
  .map((fileName) => readOutput(path.join("assets", fileName)))
  .join("\n");
assert.match(css, /prefers-reduced-motion:\s*reduce/, "동작 줄이기 설정 대응 스타일이 없습니다.");
assert.match(css, /\.skip-link/, "키보드 사용자를 위한 본문 건너뛰기 스타일이 없습니다.");
assert.match(css, /:focus-visible/, "키보드 포커스 표시 스타일이 없습니다.");

console.log("PWA 설치·오프라인·기본 접근성 산출물 검사를 통과했습니다.");

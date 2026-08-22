const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryBase = "/money-plan/";
const outputDirectory = path.resolve(__dirname, "../apps/web/dist");

function readOutput(relativePath) {
  const absolutePath = path.join(outputDirectory, relativePath);
  assert.ok(fs.existsSync(absolutePath), `배포 산출물이 없습니다: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

const indexHtml = readOutput("index.html");
const manifest = JSON.parse(readOutput("manifest.webmanifest"));
const serviceWorker = readOutput("sw.js");
const iconPath = path.join(outputDirectory, "money-plan-icon.svg");
const localAssetUrls = [...indexHtml.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)]
  .map((match) => match[1])
  .filter((url) => url.startsWith("/"));

assert.ok(localAssetUrls.length > 0, "index.html에서 로컬 자산 경로를 찾지 못했습니다.");
for (const assetUrl of localAssetUrls) {
  assert.ok(
    assetUrl.startsWith(repositoryBase),
    `Pages 기준 경로 밖을 가리키는 자산이 있습니다: ${assetUrl}`,
  );

  const relativeAssetPath = decodeURIComponent(
    assetUrl.slice(repositoryBase.length).split(/[?#]/, 1)[0],
  );
  assert.ok(
    fs.existsSync(path.join(outputDirectory, relativeAssetPath)),
    `index.html이 존재하지 않는 자산을 가리킵니다: ${assetUrl}`,
  );
}
assert.ok(
  !indexHtml.includes('href="/money-plan-icon.svg"') &&
    !indexHtml.includes('src="/money-plan-icon.svg"'),
  "Pages 하위 경로를 무시하는 루트 아이콘 경로가 남아 있습니다.",
);
assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.ok(
  manifest.icons?.some((icon) => icon.src === "money-plan-icon.svg"),
  "PWA manifest 아이콘 경로가 상대 경로가 아닙니다.",
);
assert.ok(fs.existsSync(iconPath), "PWA 아이콘 파일이 배포 산출물에 없습니다.");
assert.ok(serviceWorker.length > 0, "서비스 워커가 비어 있습니다.");
for (const precachedPath of ["index.html", "manifest.webmanifest", "money-plan-icon.svg"]) {
  assert.ok(
    serviceWorker.includes(`url:"${precachedPath}"`),
    `서비스 워커가 핵심 파일을 미리 저장하지 않습니다: ${precachedPath}`,
  );
}

const clientBundles = fs
  .readdirSync(path.join(outputDirectory, "assets"))
  .filter((fileName) => fileName.endsWith(".js"))
  .map((fileName) => fs.readFileSync(path.join(outputDirectory, "assets", fileName), "utf8"))
  .join("\n");
assert.ok(
  clientBundles.includes(`${repositoryBase}sw.js`) && clientBundles.includes(repositoryBase),
  "클라이언트의 서비스 워커 등록 경로가 Pages 기준 경로를 사용하지 않습니다.",
);

console.log("GitHub Pages 배포 산출물 경로와 PWA 파일을 확인했습니다.");

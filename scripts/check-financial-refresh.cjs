#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.resolve(__dirname, '../.github/workflows/ci.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

const secretName = 'FINLIFE_API' + '_KEY';
assert.match(
  workflow,
  /schedule:\s*\n\s*- cron: ["']15 0 \* \* 1["']/u,
  '금융상품 스냅샷 주간 갱신 일정이 없습니다.',
);
assert.ok(
  workflow.includes(`${secretName}: \${{ secrets.${secretName} }}`),
  '금융상품 인증키가 GitHub Actions 비밀 저장소에서 전달되지 않습니다.',
);
assert.match(
  workflow,
  /npm run collect:finlife -- --kind all --group 020000 --output apps\/web\/public\/data\/financial-products\.json/u,
  '공식 금융상품 스냅샷 출력 명령이 배포 워크플로에 없습니다.',
);
assert.ok(
  workflow.indexOf('Refresh official financial product snapshot') <
    workflow.indexOf('Build for GitHub Pages'),
  '금융상품 스냅샷은 Pages 빌드보다 먼저 갱신해야 합니다.',
);

assert.ok(workflow.includes('--require-products --max-age-hours 1'), '수집 후 상품 수·최신성 검사가 없습니다.');
assert.ok(workflow.includes('--github-summary'), 'Actions 요약이 없습니다.');
assert.ok(workflow.includes('retention-days: 30'), '스냅샷 이력 보관 설정이 없습니다.');
assert.ok(workflow.includes("steps.refresh.outcome == 'failure'"), '수집 실패 진단 조건이 없습니다.');
assert.ok(workflow.includes('github.run_attempt'), '재실행별 이력 이름이 없습니다.');

console.log('금융상품 스냅샷 정기 갱신 워크플로 구성을 확인했습니다.');

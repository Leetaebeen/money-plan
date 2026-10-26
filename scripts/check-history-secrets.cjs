#!/usr/bin/env node
'use strict';
const { execFileSync } = require('node:child_process');
const { scanText, forbiddenPathReason, isBinary, MAX_TEXT_FILE_BYTES } = require('./security-check.cjs');
function git(args) {
  return execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
function checkSecretRange(before, after = 'HEAD') {
  if (!/^(?:HEAD|[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(after) ||
      (before && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(before)))
    throw new Error('검사할 커밋 범위를 확인해 주세요.');
  const revision = before && !/^0+$/u.test(before) ? `${before}..${after}` : after;
  const commits = git(['rev-list', '--reverse', revision]).toString('utf8').trim().split(/\r?\n/u).filter(Boolean);
  const inspected = new Set();
  let failures = 0;
  for (const commit of commits) {
    const report = (label, rules) => {
      if (!rules.length) return;
      failures++;
      console.error(`커밋 ${commit.slice(0, 8)} ${JSON.stringify(label)}: ${[...new Set(rules)].join(', ')}`);
    };
    report('커밋 메시지', scanText('', git(['show', '-s', '--format=%B', commit]).toString('utf8')).map(f => f.rule));
    for (const record of git(['ls-tree', '-r', '-z', commit]).toString('utf8').split('\0').filter(Boolean)) {
      const match = /^\d+ (\w+) ([a-f0-9]+)\t([\s\S]+)$/u.exec(record);
      if (!match) throw new Error('커밋 파일 목록을 읽지 못했습니다.');
      const [, type, oid, file] = match;
      const identity = `${oid}:${file}`;
      if (inspected.has(identity)) continue;
      inspected.add(identity);
      const forbidden = forbiddenPathReason(file);
      if (forbidden) { report(file, [forbidden]); continue; }
      if (type !== 'blob') continue;
      const size = Number(git(['cat-file', '-s', oid]).toString('utf8').trim());
      if (!Number.isSafeInteger(size) || size > MAX_TEXT_FILE_BYTES) {
        report(file, ['file-too-large-to-scan']); continue;
      }
      const bytes = git(['cat-file', 'blob', oid]);
      if (!isBinary(bytes)) report(file, scanText(file, bytes.toString('utf8')).map(f => f.rule));
    }
  }
  if (failures) throw new Error('과거 커밋에 비밀정보 또는 금지 파일이 있습니다. 값은 출력하지 않았습니다. 이력을 수정한 뒤 다시 검사하세요.');
  console.log(`커밋 ${commits.length}개의 파일·메시지 비밀정보 검사를 통과했습니다.`);
}
if (require.main === module) {
  try { checkSecretRange(process.argv[2] || '', process.argv[3] || 'HEAD'); }
  catch (error) {
    console.error(error.status ? '커밋 범위를 읽지 못했습니다. fetch 후 다시 검사하세요.' : error.message);
    process.exitCode = 1;
  }
}
module.exports = { checkSecretRange };

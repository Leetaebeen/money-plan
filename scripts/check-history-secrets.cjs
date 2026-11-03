#!/usr/bin/env node
'use strict';
const { execFileSync } = require('node:child_process');
const { scanText, forbiddenPathReason, isBinary, MAX_TEXT_FILE_BYTES } = require('./security-check.cjs');
const BATCH_BYTES = 8 * 1024 * 1024;
function git(args, input) {
  return execFileSync('git', args, { input, maxBuffer: 32 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
}
// Parse by byte length: binary bytes and embedded newlines cannot split records.
function parseBatch(buffer, expected) {
  const result = [];
  let offset = 0;
  for (const { oid, size } of expected) {
    const newline = buffer.indexOf(10, offset);
    if (newline < offset) throw new Error('Git 파일 응답이 잘렸습니다.');
    if (buffer.subarray(offset, newline).toString('ascii') !== `${oid} blob ${size}`)
      throw new Error('Git 파일 응답이 예상한 객체와 다릅니다.');
    const end = newline + 1 + size;
    if (end >= buffer.length || buffer[end] !== 10) throw new Error('Git 파일 내용이 잘렸습니다.');
    result.push(buffer.subarray(newline + 1, end));
    offset = end + 1;
  }
  if (offset !== buffer.length) throw new Error('Git 파일 응답에 예상하지 못한 내용이 있습니다.');
  return result;
}
function checkSecretRange(before, after = 'HEAD') {
  if (!/^(?:HEAD|[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(after) ||
      (before && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(before)))
    throw new Error('검사할 커밋 범위를 확인해 주세요.');
  const revision = before && !/^0+$/u.test(before) ? `${before}..${after}` : after;
  const commits = git(['rev-list', '--reverse', revision]).toString('utf8').trim().split(/\r?\n/u).filter(Boolean);
  const inspected = new Set();
  const blobs = new Map();
  let failures = 0;
  const report = (commit, label, rules) => {
    if (!rules.length) return;
    failures++;
    console.error(`커밋 ${commit.slice(0, 8)} ${JSON.stringify(label)}: ${[...new Set(rules)].join(', ')}`);
  };
  for (const commit of commits) {
    report(commit, '커밋 메시지', scanText('', git(['show', '-s', '--format=%B', commit]).toString('utf8')).map(f => f.rule));
    // --long includes the object size, avoiding a separate process per file.
    for (const record of git(['ls-tree', '-r', '-l', '-z', commit]).toString('utf8').split('\0').filter(Boolean)) {
      const match = /^\d+ (\w+) ([a-f0-9]+) +([\d-]+)\t([\s\S]+)$/u.exec(record);
      if (!match) throw new Error('커밋 파일 목록을 읽지 못했습니다.');
      const [, type, oid, rawSize, file] = match;
      const identity = `${oid}:${file}`;
      if (inspected.has(identity)) continue;
      inspected.add(identity);
      const forbidden = forbiddenPathReason(file);
      if (forbidden) { report(commit, file, [forbidden]); continue; }
      if (type !== 'blob') continue;
      const size = Number(rawSize);
      if (!Number.isSafeInteger(size) || size < 0 || size > MAX_TEXT_FILE_BYTES) {
        report(commit, file, ['file-too-large-to-scan']); continue;
      }
      const entry = blobs.get(oid) || { oid, size, locations: [] };
      if (entry.size !== size) throw new Error('Git 파일 크기가 일치하지 않습니다.');
      entry.locations.push({ commit, file });
      blobs.set(oid, entry);
    }
  }
  let batch = [], bytes = 0;
  const scanBatch = () => {
    if (!batch.length) return;
    const output = git(['cat-file', '--batch'], batch.map(b => b.oid).join('\n') + '\n');
    const contents = parseBatch(output, batch);
    for (let index = 0; index < batch.length; index++) {
      const content = contents[index];
      if (isBinary(content)) continue;
      const rules = scanText('', content.toString('utf8')).map(f => f.rule);
      for (const location of batch[index].locations) report(location.commit, location.file, rules);
    }
    batch = []; bytes = 0;
  };
  for (const entry of blobs.values()) {
    // Count header overhead too, including for repositories with many empty blobs.
    const recordBytes = entry.size + 128;
    if (bytes + recordBytes > BATCH_BYTES) scanBatch();
    batch.push(entry); bytes += recordBytes;
  }
  scanBatch();
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
module.exports = { checkSecretRange, parseBatch };

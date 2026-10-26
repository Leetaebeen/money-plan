#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const { checkRange } = require('./check-git-privacy.cjs');
const { checkSecretRange } = require('./check-history-secrets.cjs');
try {
  for (const line of fs.readFileSync(0, 'utf8').trim().split(/\r?\n/u).filter(Boolean)) {
    const fields = line.trim().split(/\s+/u);
    if (fields.length !== 4) throw new Error('푸시 참조 형식을 확인해 주세요.');
    const [, local, , remote] = fields;
    if (/^0+$/u.test(local)) continue;
    checkRange(remote, local);
    checkSecretRange(remote, local);
  }
} catch (error) {
  console.error(error.status ? '푸시할 커밋 범위를 읽지 못했습니다. 원격 정보를 fetch한 뒤 다시 시도해 주세요.' : error.message);
  process.exitCode = 1;
}

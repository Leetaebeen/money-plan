#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const { validateMessage } = require('./validate-commit-msg.cjs');

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const before = process.argv[2] || '';
const after = process.argv[3] || 'HEAD';
const hasBefore = before && !/^0+$/u.test(before);
const revision = hasBefore ? `${before}..${after}` : after;
const revListArgs = ['rev-list', '--reverse', '--no-merges'];

if (!hasBefore) {
  revListArgs.push('--max-count=1');
}

revListArgs.push(revision);

let commits;

try {
  const output = git(revListArgs);
  commits = output ? output.split(/\r?\n/u) : [];
} catch (error) {
  console.error('검사할 커밋 범위를 읽지 못했습니다.');
  process.exit(error.status || 1);
}

let failed = false;

for (const commit of commits) {
  const message = execFileSync('git', ['show', '-s', '--format=%B', commit], {
    encoding: 'utf8',
  });
  const errors = validateMessage(message);

  if (errors.length === 0) {
    continue;
  }

  failed = true;
  console.error(`커밋 ${commit.slice(0, 8)}의 메시지 형식이 올바르지 않습니다.`);
  errors.forEach((error) => console.error(`- ${error}`));
}

if (failed) {
  process.exit(1);
}

console.log(`커밋 메시지 ${commits.length}개를 확인했습니다.`);

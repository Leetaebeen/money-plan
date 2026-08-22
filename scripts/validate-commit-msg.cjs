#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const HEADER_PATTERN = /^(feat|fix|security|refactor|perf|test|docs|build|ci|chore|style)(\([a-z0-9][a-z0-9._/-]*\))?!?: (\S.*)$/u;

function normalizeMessage(rawMessage) {
  return rawMessage
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/gu, '\n')
    .replace(/\n+$/u, '');
}

function isGeneratedMessage(subject) {
  return /^Merge\b/u.test(subject) || /^Revert ".+"$/u.test(subject);
}

function validateMessage(rawMessage) {
  const message = normalizeMessage(rawMessage);
  const lines = message.split('\n');
  const subject = lines[0] || '';

  if (isGeneratedMessage(subject)) {
    return [];
  }

  const errors = [];

  if (!HEADER_PATTERN.test(subject)) {
    errors.push('제목은 "type: 요약" 또는 "type(scope): 요약" 형식이어야 합니다.');
  }

  if (lines.length < 3 || lines[1] !== '') {
    errors.push('제목과 본문 사이에 빈 줄 하나가 필요합니다.');
  }

  const body = lines.slice(2);

  if (body.length === 0) {
    errors.push('본문에 최상위 "- 내용" 항목이 최소 하나 필요합니다.');
    return errors;
  }

  let previousLevel = 0;
  let topLevelCount = 0;

  body.forEach((line, index) => {
    const match = /^( *)- (\S.*)$/u.exec(line);

    if (!match) {
      errors.push(`본문 ${index + 1}번째 줄은 "- 내용" 형식으로 작성해야 합니다.`);
      return;
    }

    const spaces = match[1].length;

    if (spaces % 2 !== 0) {
      errors.push(`본문 ${index + 1}번째 줄의 들여쓰기는 공백 두 칸 단위여야 합니다.`);
      return;
    }

    const level = spaces / 2;

    if (level === 0) {
      topLevelCount += 1;
    }

    if (index === 0 && level !== 0) {
      errors.push('첫 번째 본문 항목은 최상위 목록이어야 합니다.');
    } else if (level > previousLevel + 1) {
      errors.push(`본문 ${index + 1}번째 줄에서 목록 단계를 건너뛸 수 없습니다.`);
    }

    previousLevel = level;
  });

  if (topLevelCount === 0) {
    errors.push('본문에 최상위 목록 항목이 최소 하나 필요합니다.');
  }

  return errors;
}

function hasGitState(name) {
  try {
    const statePath = execFileSync('git', ['rev-parse', '--git-path', name], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return Boolean(statePath) && fs.existsSync(statePath);
  } catch {
    return false;
  }
}

function stripGitComments(message) {
  try {
    return execFileSync('git', ['stripspace', '--strip-comments'], {
      input: message,
      encoding: 'utf8',
    });
  } catch {
    return message;
  }
}

function runCli() {
  const messageFile = process.argv[2];

  if (!messageFile) {
    console.error('커밋 메시지 파일 경로가 필요합니다.');
    process.exit(2);
  }

  if (hasGitState('MERGE_HEAD') || hasGitState('REVERT_HEAD')) {
    process.exit(0);
  }

  const message = stripGitComments(fs.readFileSync(messageFile, 'utf8'));
  const errors = validateMessage(message);

  if (errors.length === 0) {
    process.exit(0);
  }

  console.error('\n커밋 메시지 형식 오류:\n');
  errors.forEach((error) => console.error(`- ${error}`));
  console.error('\n예시:\n\nfeat: 기능 요약\n\n- 주요 변경\n  - 세부 변경\n');
  process.exit(1);
}

module.exports = { validateMessage };

if (require.main === module) {
  runCli();
}

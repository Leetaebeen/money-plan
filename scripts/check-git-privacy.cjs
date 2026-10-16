#!/usr/bin/env node
'use strict';
const { execFileSync } = require('node:child_process');

function privateEmailAllowed(email) {
  return /^[a-z0-9+_.\[\]-]+@users\.noreply\.github\.com$/iu.test(email) || email.toLowerCase() === 'noreply@github.com';
}
function emailFromIdentity(identity) {
  return identity.match(/<([^<>\s]+)>/u)?.[1] ?? '';
}
function commitPrivacyErrors(author, committer, message = '') {
  const errors = [];
  if (!privateEmailAllowed(author)) errors.push('작성자 이메일을 GitHub 비공개용 noreply 주소로 설정해 주세요.');
  if (!privateEmailAllowed(committer)) errors.push('커미터 이메일을 GitHub 비공개용 noreply 주소로 설정해 주세요.');
  for (const match of message.matchAll(/^Co-authored-by:\s*(.+)$/gimu)) {
    if (!privateEmailAllowed(emailFromIdentity(match[1]))) {
      errors.push('공동작성자 이메일에도 GitHub 비공개용 noreply 주소를 사용해 주세요.');
      break;
    }
  }
  return errors;
}
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }).trim();
}
function currentErrors(message = '') {
  return commitPrivacyErrors(emailFromIdentity(git(['var', 'GIT_AUTHOR_IDENT'])), emailFromIdentity(git(['var', 'GIT_COMMITTER_IDENT'])), message);
}
function checkRange(before, after = 'HEAD') {
  if (!/^(?:HEAD|[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(after) || (before && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu.test(before)))
    throw new Error('검사할 커밋 범위를 확인해 주세요.');
  const hasBefore = before && !/^0+$/u.test(before);
  const commits = git(['rev-list', '--reverse', hasBefore ? `${before}..${after}` : after]).split(/\r?\n/u).filter(Boolean);
  let failures = 0;
  for (const commit of commits) {
    const [author, committer, ...message] = git(['show', '-s', '--format=%ae%x00%ce%x00%B', commit]).split('\0');
    const errors = commitPrivacyErrors(author, committer, message.join('\0'));
    if (errors.length) {
      failures++;
      console.error(`커밋 ${commit.slice(0, 8)}: ${errors.join(' ')}`);
    }
  }
  if (failures) throw new Error('개인 이메일이 포함된 커밋은 업로드하지 않습니다. 비공개용 주소로 수정 후 재검사하세요.');
  console.log(`커밋 ${commits.length}개의 이메일 비공개 설정을 확인했습니다.`);
}

if (require.main === module) {
  try {
    if (process.argv[2] === '--range') checkRange(process.argv[3] ?? '', process.argv[4] || 'HEAD');
    else {
      const message = process.argv[2] === '--message' ? require('node:fs').readFileSync(process.argv[3], 'utf8') : '';
      const errors = currentErrors(message);
      if (errors.length) throw new Error(errors.join(' '));
      console.log('현재 Git 작성자·커미터 이메일 비공개 설정을 확인했습니다.');
    }
  } catch (error) {
    // Never include subprocess output or the actual email in logs.
    console.error(error.status ? 'Git 이메일을 읽지 못했습니다. Git 설정과 커밋 범위를 확인해 주세요.' : error.message);
    process.exitCode = 1;
  }
}
module.exports = { privateEmailAllowed, emailFromIdentity, commitPrivacyErrors, checkRange };

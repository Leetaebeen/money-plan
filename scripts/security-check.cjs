#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;

const KNOWN_SECRET_PATTERNS = [
  ['private-key-block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/u],
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u],
  ['openai-api-key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/u],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{30,}\b/u],
  ['slack-token', /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/u],
  ['stripe-live-key', /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b/u],
  ['jwt-token', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u],
  ['credential-in-url', /https?:\/\/[^\s/:]+:[^\s/@]+@[^\s/]+/u],
];

const GENERIC_ASSIGNMENT = /["']?([A-Za-z0-9_.-]*(?:api[_-]?key|secret[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|private[_-]?key|service[_-]?key|auth[_-]?secret|password|kis[A-Za-z0-9_.-]*(?:key|secret)|toss[A-Za-z0-9_.-]*(?:key|secret))[A-Za-z0-9_.-]*)["']?\s*[:=]\s*["'`]?([^\s,"'`;#}\]]{4,})/giu;
const BEARER_TOKEN = /authorization\s*[:=]\s*["'`]?bearer\s+([^\s,"'`;#}]{12,})/iu;

function gitBuffer(args) {
  return execFileSync('git', args, {
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function parseNullSeparated(buffer) {
  return buffer
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

function selectedFiles(stagedOnly) {
  if (stagedOnly) {
    return parseNullSeparated(
      gitBuffer(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']),
    );
  }

  return parseNullSeparated(gitBuffer(['ls-files', '-z']));
}

function isAllowedExample(baseName) {
  return baseName === '.env.example' ||
    /^\.env\..+\.example$/u.test(baseName) ||
    baseName === '.dev.vars.example' ||
    baseName === '.npmrc.example';
}

function forbiddenPathReason(filePath) {
  const normalized = filePath.replace(/\\/gu, '/').toLowerCase();
  const baseName = path.posix.basename(normalized);

  if (isAllowedExample(baseName)) {
    return null;
  }

  if (baseName === '.env' || baseName.startsWith('.env.')) {
    return 'environment-file';
  }

  if (baseName === '.dev.vars' || baseName.startsWith('.dev.vars.')) {
    return 'local-worker-secrets';
  }

  if (baseName === '.npmrc') {
    return 'npm-credentials';
  }

  if (/\.(?:pem|key|p8|p12|pfx|jks|keystore)$/u.test(baseName)) {
    return 'private-key-or-certificate';
  }

  if (/^id_(?:rsa|dsa|ecdsa|ed25519)(?:\..+)?$/u.test(baseName)) {
    return 'ssh-private-key';
  }

  if (/^(?:credentials(?:\..+)?|service-account(?:\..+)?|.+-service-account)\.json$/u.test(baseName)) {
    return 'service-account-credentials';
  }

  if (/^secrets?\.(?:json|ya?ml)$/u.test(baseName)) {
    return 'structured-secret-file';
  }

  if (
    normalized.startsWith('secrets/') ||
    normalized.includes('/secrets/') ||
    normalized.startsWith('data/private/') ||
    normalized.startsWith('data/user/') ||
    normalized.startsWith('exports/') ||
    normalized.startsWith('backups/')
  ) {
    return 'private-data-directory';
  }

  if (/\.(?:ofx|qif)$/u.test(baseName)) {
    return 'financial-export';
  }

  return null;
}

function readSelectedFile(filePath, stagedOnly) {
  if (stagedOnly) {
    try {
      return gitBuffer(['show', `:${filePath}`]);
    } catch {
      return null;
    }
  }

  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

function isBinary(buffer) {
  return buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0);
}

function isPlaceholder(rawValue) {
  const value = rawValue.trim();

  return /^(?:null|undefined|true|false|example|dummy|placeholder|changeme|change_me|replace_me|your_.+|<.+>|\$\{.+\}|\{\{.+\}\}|process\.env\..+|import\.meta\.env\..+|deno\.env\..+|env\..+)$/iu.test(value);
}

function scanText(filePath, text) {
  const findings = [];
  const lines = text.replace(/\r\n?/gu, '\n').split('\n');

  lines.forEach((line, index) => {
    for (const [rule, pattern] of KNOWN_SECRET_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({ filePath, line: index + 1, rule });
      }
    }

    const bearerMatch = BEARER_TOKEN.exec(line);

    if (bearerMatch && !isPlaceholder(bearerMatch[1])) {
      findings.push({ filePath, line: index + 1, rule: 'bearer-token' });
    }

    GENERIC_ASSIGNMENT.lastIndex = 0;
    let assignmentMatch;

    while ((assignmentMatch = GENERIC_ASSIGNMENT.exec(line)) !== null) {
      if (!isPlaceholder(assignmentMatch[2])) {
        findings.push({ filePath, line: index + 1, rule: 'credential-assignment' });
        break;
      }
    }
  });

  return findings;
}

const stagedOnly = process.argv.includes('--staged');
const files = selectedFiles(stagedOnly);
const findings = [];

for (const filePath of files) {
  const forbiddenReason = forbiddenPathReason(filePath);

  if (forbiddenReason) {
    findings.push({ filePath, line: null, rule: forbiddenReason });
    continue;
  }

  const content = readSelectedFile(filePath, stagedOnly);

  if (!content || isBinary(content)) {
    continue;
  }

  if (content.length > MAX_TEXT_FILE_BYTES) {
    findings.push({ filePath, line: null, rule: 'text-file-too-large-to-scan' });
    continue;
  }

  findings.push(...scanText(filePath, content.toString('utf8')));
}

const uniqueFindings = Array.from(
  new Map(
    findings.map((finding) => [
      `${finding.filePath}:${finding.line || 0}:${finding.rule}`,
      finding,
    ]),
  ).values(),
);

if (uniqueFindings.length > 0) {
  console.error('비밀정보 또는 추적 금지 파일이 발견되어 검사를 중단합니다.');
  uniqueFindings.forEach(({ filePath, line, rule }) => {
    const location = line ? `${filePath}:${line}` : filePath;
    console.error(`- ${location} [${rule}]`);
  });
  console.error('일치한 값 자체는 안전을 위해 출력하지 않았습니다.');
  process.exit(1);
}

console.log(`${stagedOnly ? '스테이징된' : '추적 중인'} 파일 ${files.length}개의 비밀정보 검사를 통과했습니다.`);

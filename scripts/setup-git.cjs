#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');

execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], {
  stdio: 'inherit',
});
execFileSync('git', ['config', '--local', 'commit.template', '.gitmessage'], {
  stdio: 'inherit',
});

console.log('Git 커밋 훅과 메시지 템플릿을 활성화했습니다.');

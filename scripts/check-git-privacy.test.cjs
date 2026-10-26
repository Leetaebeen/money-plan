const test = require('node:test');
const assert = require('node:assert/strict');
const { privateEmailAllowed, emailFromIdentity, commitPrivacyErrors } = require('./check-git-privacy.cjs');

test('commit identity protection accepts GitHub private addresses and blocks lookalike domains', () => {
  for (const email of ['123+review-user@users.noreply.github.com', 'review-user@users.noreply.github.com', '41898282+github-actions[bot]@users.noreply.github.com', 'noreply@github.com']) assert.equal(privateEmailAllowed(email), true);
  for (const email of ['', 'person@example.invalid', 'review@users.noreply.github.com.example.invalid', 'review@github.com', 'review@usersXnoreplyXgithubXcom']) assert.equal(privateEmailAllowed(email), false);
  assert.equal(emailFromIdentity('Test User <123+test@users.noreply.github.com> 1 +0900'), '123+test@users.noreply.github.com');
});

test('private coauthors are blocked without echoing their email into diagnostics', () => {
  const safe = 'test@users.noreply.github.com';
  const hidden = 'person@example.invalid';
  assert.equal(commitPrivacyErrors(safe, safe, `feat. Test\n\nCo-authored-by: Test <${safe}>`).length, 0);
  const errors = commitPrivacyErrors(hidden, hidden, `feat. Test\n\nCo-authored-by: Test <${hidden}>`);
  assert.equal(errors.length, 3);
  assert.equal(errors.join(' ').includes(hidden), false);
  assert.equal(commitPrivacyErrors(safe, safe, 'Co-authored-by: malformed').length, 1);
});

test('push inspection catches private ancestors even when the newest commit is safe', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync, spawnSync } = require('node:child_process');
  const root = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(root, 'money-plan-privacy-'));
  const hidden = 'synthetic-private@example.invalid';
  const safe = 'test@users.noreply.github.com';
  const env = { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: directory,
    GIT_AUTHOR_NAME: 'Test', GIT_COMMITTER_NAME: 'Test', GIT_AUTHOR_EMAIL: hidden, GIT_COMMITTER_EMAIL: hidden };
  const git = (args) => execFileSync('git', args, { cwd: directory, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git(['init']);
    git(['-c', 'core.hooksPath=', '-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '-m', 'feat. Synthetic private ancestor']);
    const before = git(['rev-parse', 'HEAD']);
    env.GIT_AUTHOR_EMAIL = safe; env.GIT_COMMITTER_EMAIL = safe;
    git(['-c', 'core.hooksPath=', '-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '-m', 'feat. Synthetic safe tip']);
    const after = git(['rev-parse', 'HEAD']);
    const script = path.join(__dirname, 'check-push-privacy.cjs');
    const initial = spawnSync(process.execPath, [script], { cwd: directory, env, encoding: 'utf8', input: `refs/heads/main ${after} refs/heads/main ${'0'.repeat(40)}\n` });
    assert.equal(initial.status, 1);
    assert.ok(initial.stderr.includes(before.slice(0, 8)));
    assert.equal(`${initial.stdout}${initial.stderr}`.includes(hidden), false);
    const incremental = spawnSync(process.execPath, [script], { cwd: directory, env, encoding: 'utf8', input: `refs/heads/main ${after} refs/heads/main ${before}\n` });
    assert.equal(incremental.status, 0);
    const malformed = spawnSync(process.execPath, [script], { cwd: directory, env, encoding: 'utf8', input: 'unexpected input\n' });
    assert.equal(malformed.status, 1);
    // A synthetic token is assembled at runtime; no real credential is used.
    const token = 'gh' + 'p_' + 'X'.repeat(32);
    fs.writeFileSync(path.join(directory, 'example.txt'), token);
    git(['add', 'example.txt']);
    git(['-c', 'core.hooksPath=', '-c', 'commit.gpgSign=false', 'commit', '-m', 'feat. Synthetic secret']);
    fs.unlinkSync(path.join(directory, 'example.txt'));
    git(['add', '-u']);
    git(['-c', 'core.hooksPath=', '-c', 'commit.gpgSign=false', 'commit', '-m', 'feat. Remove synthetic secret']);
    const cleaned = git(['rev-parse', 'HEAD']);
    const invoke = (from, to) => spawnSync(process.execPath, [script], { cwd: directory, env, encoding: 'utf8', input: 'refs/heads/main ' + to + ' refs/heads/main ' + from + '\n' });
    const removedSecret = invoke(after, cleaned);
    assert.equal(removedSecret.status, 1);
    assert.ok(removedSecret.stderr.includes('github-token'));
    assert.equal(removedSecret.stderr.includes(token), false);
    assert.equal(invoke(cleaned, cleaned).status, 0);
    git(['-c', 'core.hooksPath=', '-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '-m', 'feat. ' + token]);
    const messageSecret = invoke(cleaned, git(['rev-parse', 'HEAD']));
    assert.equal(messageSecret.status, 1);
    assert.ok(messageSecret.stderr.includes('github-token'));
    assert.equal(messageSecret.stderr.includes(token), false);
    fs.writeFileSync(path.join(directory, '.env'), 'EXAMPLE=placeholder');
    git(['add', '.env']);
    git(['-c', 'core.hooksPath=', '-c', 'commit.gpgSign=false', 'commit', '-m', 'feat. Forbidden file']);
    const forbiddenHead = git(['rev-parse', 'HEAD']);
    const forbidden = invoke(git(['rev-parse', 'HEAD~1']), forbiddenHead);
    assert.equal(forbidden.status, 1);
    assert.ok(forbidden.stderr.includes('environment-file'));

  } finally {
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved), root);
    assert.ok(path.basename(resolved).startsWith('money-plan-privacy-'));
    // Avoid Node's recursive rm native crash on Windows; never follow symlinks.
    const removeDirectory = (target) => {
      for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
        const child = path.join(target, entry.name);
        if (entry.isDirectory()) removeDirectory(child);
        else {
          if (!entry.isSymbolicLink()) fs.chmodSync(child, 0o600);
          fs.unlinkSync(child);
        }
      }
      fs.rmdirSync(target);
    };
    removeDirectory(resolved);
  }
});

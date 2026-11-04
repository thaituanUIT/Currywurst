const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Capture to files so these checks also work in environments restricting pipes.
function command(root, executable, args) {
  const stdoutPath = path.join(root, 'command.stdout');
  const stderrPath = path.join(root, 'command.stderr');
  const stdout = fs.openSync(stdoutPath, 'w');
  const stderr = fs.openSync(stderrPath, 'w');
  let result;
  try {
    result = spawnSync(executable, args, {
      cwd: root, stdio: ['ignore', stdout, stderr],
      env: { ...process.env, GITHUB_OUTPUT: path.join(root, 'outputs') },
    });
  } finally {
    fs.closeSync(stdout);
    fs.closeSync(stderr);
  }
  if (result.error) throw result.error;
  return { ...result, stdout: fs.readFileSync(stdoutPath, 'utf8'), stderr: fs.readFileSync(stderrPath, 'utf8') };
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'currywurst-release-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of ['manifest.json', 'i18n.js', '_locales', 'background.js', 'parser.js', 'lookup.js', 'saved-words.js', 'meaning.js', 'popup.js', 'popup.html', 'popup.css', 'icon.svg', 'icons', 'docs', 'scripts', 'README.md', 'CHANGELOG.md']) {
    fs.cpSync(name, path.join(root, name), { recursive: true });
  }
  const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'))).version;
  const run = (tag = `v${version}`) => command(root, process.execPath, ['scripts/package-release.mjs', tag]);
  return { root, version, run };
}

test('release ZIP includes runtime files, excludes local files, and has matching notes and checksum', t => {
  const { root, version, run } = fixture(t);
  fs.mkdirSync(path.join(root, '.aws'));
  fs.writeFileSync(path.join(root, '.aws', 'local-secret'), 'not for distribution');
  fs.writeFileSync(path.join(root, 'obsolete.txt'), 'not for distribution');
  let result = run();
  assert.equal(result.status, 0, result.stderr);
  const archive = `dist/Currywurst-${version}.zip`;
  // Simulate stale contents in an earlier build; rebuilding must remove them.
  assert.equal(command(root, 'zip', ['-q', archive, 'obsolete.txt']).status, 0);
  result = run();
  assert.equal(result.status, 0, result.stderr);
  const listing = command(root, 'unzip', ['-Z1', archive]);
  assert.equal(listing.status, 0, listing.stderr);
  const files = listing.stdout.trim().split('\n');
  for (const name of ['manifest.json', 'i18n.js', '_locales/en/messages.json', 'lookup.js', 'saved-words.js', 'meaning.js', 'popup.html', 'icons/icon-128.png', 'README.md', 'CHANGELOG.md']) assert.ok(files.includes(name), name);
  assert.ok(files.every(name => !name.startsWith('.') && !/^(scripts|tests|dist|docs)\//.test(name)));
  assert.ok(!files.includes('obsolete.txt'));
  const manifest = command(root, 'unzip', ['-p', archive, 'manifest.json']);
  assert.equal(manifest.status, 0, manifest.stderr);
  const zipManifest = JSON.parse(manifest.stdout);
  assert.equal(zipManifest.version, version);
  const digest = createHash('sha256').update(fs.readFileSync(path.join(root, archive))).digest('hex');
  assert.equal(fs.readFileSync(path.join(root, `${archive}.sha256`), 'utf8'), `${digest}  Currywurst-${version}.zip\n`);
  const notes = fs.readFileSync(path.join(root, 'dist/release-notes.md'), 'utf8');
  assert.match(notes, /### Install or update/);
  assert.match(notes, /Folder installations do not update automatically/);
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const selected = changelog.split(/^## /m).find(section => section.startsWith(`${version}\n`) || section.startsWith(`${version} `));
  assert.ok(notes.startsWith(selected.slice(selected.indexOf('\n') + 1).trim()));
  assert.match(fs.readFileSync(path.join(root, 'outputs'), 'utf8'), /title=Currywurst /);
});

test('release packaging refuses a tag that differs from the manifest version', t => {
  const { root, run } = fixture(t);
  const result = run('v999.0.0');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /tag must match manifest.json/);
  assert.ok(!fs.existsSync(path.join(root, 'dist')));
});

test('release packaging requires notes for its exact version', t => {
  const { root, version, run } = fixture(t);
  for (const changelog of ['# Changelog\n\n## 999.0.0\n\n- Another version\n', `# Changelog\n\n## ${version}\n\n`, `# Changelog\n\n## ${version}`]) {
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), changelog);
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /nonempty section/);
    assert.ok(!fs.existsSync(path.join(root, 'dist')));
  }
});

test('release packaging fails if a required extension file is missing', t => {
  const { root, run } = fixture(t);
  fs.unlinkSync(path.join(root, 'popup.js'));
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /popup.js/);
  assert.ok(!fs.existsSync(path.join(root, 'dist')));
});

test('release packaging requires the default catalog and includes additional locale catalogs', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, '_locales/de'));
  fs.writeFileSync(path.join(f.root, '_locales/de/messages.json'), JSON.stringify({ ui_locale: { message: 'de' }, ui_direction: { message: 'ltr' }, lookup_button: { message: 'Nachschlagen' } }));
  fs.mkdirSync(path.join(f.root, '_locales/es_419'));
  fs.writeFileSync(path.join(f.root, '_locales/es_419/messages.json'), JSON.stringify({ ui_locale: { message: 'es-419' }, ui_direction: { message: 'ltr' } }));
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const listing = command(f.root, 'unzip', ['-Z1', `dist/Currywurst-${f.version}.zip`]);
  assert.ok(listing.stdout.includes('_locales/en/messages.json'));
  assert.ok(listing.stdout.includes('_locales/de/messages.json'));
  assert.ok(listing.stdout.includes('_locales/es_419/messages.json'));
  fs.rmSync(path.join(f.root, '_locales/en/messages.json'));
  assert.notEqual(f.run().status, 0);
});

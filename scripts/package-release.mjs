import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Run from the repository root. Only these files go into the user download.
const files = [
  'manifest.json', 'i18n.js', 'background.js', 'parser.js', 'lookup.js', 'saved-words.js', 'meaning.js',
  'popup.html', 'popup.css', 'popup.js', 'icon.svg',
  'icons/icon-16.png', 'icons/icon-48.png', 'icons/icon-128.png',
  'README.md', 'CHANGELOG.md',
];

try {
  const { version, default_locale: defaultLocale } = JSON.parse(readFileSync('manifest.json', 'utf8'));
  const localeFiles = readdirSync('_locales', { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^[a-zA-Z]{2,3}(?:_[a-zA-Z0-9]+)*$/.test(entry.name))
    .map(entry => `_locales/${entry.name}/messages.json`).sort();
  if (!defaultLocale || !localeFiles.includes(`_locales/${defaultLocale}/messages.json`)) throw new Error('The default locale needs a messages.json catalog.');
  for (const file of localeFiles) JSON.parse(readFileSync(file, 'utf8'));
  files.push(...localeFiles);
  const tag = process.argv[2];
  if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `v${version}`) {
    throw new Error(`Release tag must match manifest.json: expected v${version}, received ${tag || '(missing)'}.`);
  }
  const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n');
  const section = changelog.split(/^## /m).slice(1).find((entry) => entry.split('\n')[0].match(/^\S+/)?.[0] === version);
  const newline = section?.indexOf('\n') ?? -1;
  if (!section || newline < 0 || !section.slice(newline + 1).trim()) {
    throw new Error(`CHANGELOG.md needs a nonempty section headed "## ${version}".`);
  }
  const title = `Currywurst ${section.slice(0, newline).trim()}`;
  const notes = `${section.slice(newline + 1).trim()}

### Install or update

Download **Currywurst-${version}.zip** under Assets and extract it.

- **Install:** Open \`chrome://extensions\` or \`edge://extensions\`, enable Developer mode, select **Load unpacked**, and choose the extracted folder containing \`manifest.json\`. Keep that folder on your computer.
- **Update:** Replace the files in your existing Currywurst folder with the extracted files, then click **Reload** on its Extensions card and reopen the popup.

Folder installations do not update automatically. The accompanying \`.sha256\` file contains the ZIP's SHA-256 checksum.
`;
  for (const file of files) {
    if (!statSync(file).isFile()) throw new Error(`Missing release file: ${file}`);
  }
  mkdirSync('dist', { recursive: true });
  const archive = `dist/Currywurst-${version}.zip`;
  // Rebuild instead of updating an old ZIP, which could retain obsolete files.
  rmSync(archive, { force: true });
  execFileSync('zip', ['-X', '-q', resolve(archive), ...files], { stdio: 'inherit' });
  execFileSync('unzip', ['-tq', archive], { stdio: 'inherit' });
  const checksum = `${archive}.sha256`;
  const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
  writeFileSync(checksum, `${digest}  Currywurst-${version}.zip\n`);
  const notesFile = 'dist/release-notes.md';
  writeFileSync(notesFile, notes);
  const outputs = { title, archive, checksum, notes: notesFile };
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''));
  }
  console.log(`Prepared ${archive} and ${checksum}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Only compiled runtime assets and explicitly selected static files enter the ZIP.
const files = [
  'manifest.json', 'background.js', 'popup.html', 'icon.svg',
  'icons/icon-16.png', 'icons/icon-48.png', 'icons/icon-128.png',
  'README.md', 'CHANGELOG.md',
];

try {
  const sourceManifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
  const { version, default_locale: defaultLocale } = sourceManifest;
  const tag = process.argv[2];
  if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `v${version}`) {
    throw new Error(`Release tag must match manifest.json: expected v${version}, received ${tag || '(missing)'}.`);
  }
  const distribution = `dist/${version}`;
  const staging = resolve(distribution, 'extension');
  const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n');
  const section = changelog.split(/^## /m).slice(1).find((entry) => entry.split('\n')[0].match(/^\S+/)?.[0] === version);
  const newline = section?.indexOf('\n') ?? -1;
  if (!section || newline < 0 || !section.slice(newline + 1).trim()) {
    throw new Error(`CHANGELOG.md needs a nonempty section headed "## ${version}".`);
  }
  if (!existsSync(resolve(staging, 'manifest.json'))) throw new Error('Run npm run build before packaging the extension.');
  const builtManifest = JSON.parse(readFileSync(resolve(staging, 'manifest.json'), 'utf8'));
  if (JSON.stringify(builtManifest) !== JSON.stringify(sourceManifest)) throw new Error('Built manifest differs from manifest.json. Run npm run build again.');
  const buildInfo = JSON.parse(readFileSync(resolve(staging, '.vite/build-info.json'), 'utf8'));
  if (buildInfo.mode !== 'production' || buildInfo.version !== version) throw new Error('Packaging requires a production build. Run npm run build again.');
  const localeFiles = readdirSync(resolve(staging, '_locales'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^[a-zA-Z]{2,3}(?:_[a-zA-Z0-9]+)*$/.test(entry.name))
    .map(entry => `_locales/${entry.name}/messages.json`).sort();
  if (!defaultLocale || !localeFiles.includes(`_locales/${defaultLocale}/messages.json`)) throw new Error('The default locale needs a messages.json catalog.');
  for (const file of localeFiles) {
    if (!existsSync(resolve(staging, file))) throw new Error('The default locale needs a messages.json catalog.');
    JSON.parse(readFileSync(resolve(staging, file), 'utf8'));
  }
  files.push(...localeFiles);
  const buildManifest = JSON.parse(readFileSync(resolve(staging, '.vite/manifest.json'), 'utf8'));
  const assets = new Set(Object.values(buildManifest).flatMap(entry => [entry.file, ...(entry.css || []), ...(entry.assets || [])]));
  for (const asset of assets) {
    if (!/^assets\/[A-Za-z0-9_./-]+\.(?:js|css)$/.test(asset) || asset.includes('..')) throw new Error(`Invalid build asset: ${asset}`);
    files.push(asset);
  }
  const html = readFileSync(resolve(staging, 'popup.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const file = match[1].replace(/^\.\//, '');
    if (!files.includes(file)) throw new Error(`Unpackaged popup asset: ${file}`);
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
    const path = resolve(staging, file);
    if (!existsSync(path) || !lstatSync(path).isFile()) throw new Error(`Missing release file: ${file}`);
  }
  mkdirSync(distribution, { recursive: true });
  const archive = `${distribution}/Currywurst-${version}.zip`;
  // Rebuild instead of updating an old ZIP, which could retain obsolete files.
  rmSync(archive, { force: true });
  execFileSync('zip', ['-X', '-q', resolve(archive), ...files.sort()], { cwd: staging, stdio: 'inherit' });
  execFileSync('unzip', ['-tq', archive], { stdio: 'inherit' });
  const checksum = `${archive}.sha256`;
  const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
  writeFileSync(checksum, `${digest}  Currywurst-${version}.zip\n`);
  const notesFile = `${distribution}/release-notes.md`;
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

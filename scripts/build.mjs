import { cpSync, mkdirSync, readFileSync, rmSync, watch, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const watching = process.argv.includes('--watch');
const mode = watching ? 'development' : 'production';
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('manifest.json needs a numeric major.minor.patch version.');
const extensionDirectory = `dist/${manifest.version}/extension`;
const output = resolve(root, extensionDirectory);
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
if (manifest.version !== packageJson.version) throw new Error('package.json version must match manifest.json.');

const staticFiles = ['manifest.json', '_locales', 'icons', 'icon.svg', 'README.md', 'CHANGELOG.md'];
const copyStatic = () => {
  for (const file of staticFiles) {
    if (['_locales', 'icons'].includes(file)) rmSync(resolve(output, file), { recursive: true, force: true });
    cpSync(file, resolve(output, file), { recursive: true });
  }
};
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const popupBuild = { configFile: resolve(root, 'vite.config.popup.ts'), mode, define: { 'process.env.NODE_ENV': JSON.stringify(mode) } };
const backgroundBuild = { configFile: resolve(root, 'vite.config.background.ts'), mode };
await build(popupBuild);
await build(backgroundBuild);
copyStatic();
writeFileSync(resolve(output, '.vite/build-info.json'), JSON.stringify({ mode, version: manifest.version }));

if (watching) {
  await build({ ...popupBuild, build: { watch: {}, minify: false, sourcemap: 'inline' } });
  await build({ ...backgroundBuild, build: { watch: {} } });
  for (const file of staticFiles) watch(resolve(root, file), { recursive: true }, copyStatic);
  console.log(`Watching extension sources. Load ${extensionDirectory} and reload the extension after changes.`);
}

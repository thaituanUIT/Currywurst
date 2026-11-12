import { test as base, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const houseHtml = '<main><h1>Declension of German noun Haus</h1><p>A1 · noun · neuter</p><p>das Haus</p><p>Hauses · Häuser</p><p lang="en">house</p><h2>Singular</h2><table><tr><th>Case</th><th>Article</th><th>Form</th></tr><tr><td>Nom.</td><td>das</td><td>Haus</td></tr><tr><td>Gen.</td><td>des</td><td>Hauses</td></tr><tr><td>Dat.</td><td>dem</td><td>Haus</td></tr><tr><td>Acc.</td><td>das</td><td>Haus</td></tr></table></main>';
const kleinHtml = '<main><h1>Declension of German adjective klein</h1><p>A1 · adjective</p><p lang="en">small, little</p><h2>Masculine</h2><table><tr><td>Masculine</td><td>kleiner</td></tr></table></main>';
const englishForm = '<form action="/en-de/" method="GET"><input name="w"><input name="language" value="en"></form>';
const englishResults = '<main>\n<h1>Results</h1>\n<p>A1 · adjective</p>\n<p><a href="/declension/adjectives/klein.htm">klein</a></p>\n<p lang="en">small, little</p>\n</main>';

const test = base.extend<{ extension: BrowserContext; worker: Worker; popup: Page; popupUrl: string }>({
  extension: async ({}, use) => {
    const root = mkdtempSync(resolve(tmpdir(), 'currywurst-browser-'));
    const extensionPath = resolve(root, 'extension');
    execFileSync('unzip', ['-q', resolve(`dist/${manifest.version}/Currywurst-${manifest.version}.zip`), '-d', extensionPath]);
    const context = await chromium.launchPersistentContext(resolve(root, 'profile'), {
      channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    try { await use(context); }
    finally { await context.close(); rmSync(root, { recursive: true, force: true }); }
  },
  worker: async ({ extension }, use) => {
    const worker = extension.serviceWorkers()[0] || await extension.waitForEvent('serviceworker');
    await use(worker);
  },
  popupUrl: async ({ worker }, use) => { await use(`chrome-extension://${new URL(worker.url()).host}/popup.html`); },
  popup: async ({ extension }, use) => {
    const page = await extension.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/Content Security Policy|Refused to/.test(message.text())) errors.push(message.text()); });
    await use(page);
    expect(errors).toEqual([]);
    await page.close();
  },
});

test.beforeAll(() => {
  execFileSync(process.execPath, ['scripts/package-release.mjs', `v${manifest.version}`], { stdio: 'pipe' });
});

test('the extracted ZIP opens offline, restores old saved records, and keeps changes across popup reloads', async ({ popup, popupUrl, worker, extension }) => {
  const requests: string[] = [];
  await extension.route('https://**/*', route => { requests.push(route.request().url()); return route.abort(); });
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ lookupWord: 'Haus', lookupMode: 'de-en', savedWords: [{ id: '["haus","noun","das"]', lemma: 'Haus', meaning: 'house', partOfSpeech: 'noun', article: 'das', sourceUrl: 'https://www.verbformen.com/declension/nouns/Haus.htm', savedAt: 123 }] });
  });
  await popup.goto(popupUrl);
  await expect(popup.locator('#word')).toHaveValue('Haus');
  await expect(popup.locator('#result')).toContainText('Press Look up');
  await expect(popup.locator('#saved-count')).toHaveText('1/100');
  await popup.locator('#saved-tab').click();
  await expect(popup.locator('#saved-list')).toContainText('das Haus');
  await popup.getByRole('button', { name: 'Delete Haus', exact: true }).click();
  await expect(popup.locator('#saved-count')).toHaveText('0/100');
  await popup.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(popup.locator('#saved-count')).toHaveText('1/100');
  await popup.reload();
  await popup.locator('#saved-tab').click();
  await expect(popup.locator('#saved-list')).toContainText('house');
  expect(await worker.evaluate(async () => (await chrome.storage.local.get('savedWords')).savedWords[0].savedAt)).toBe(123);
  expect(requests).toEqual([]);
});

test('dictionary lookup, saving through the worker, and one-use context-menu handoff work', async ({ popup, popupUrl, worker, extension }, testInfo) => {
  const requests: string[] = [];
  await extension.route('https://www.verbformen.com/**', route => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: houseHtml });
  });
  await worker.evaluate(async () => { await chrome.storage.session.set({ pendingLookup: { word: 'Haus', hint: 'de', createdAt: Date.now() } }); });
  await popup.goto(popupUrl);
  await expect(popup.locator('.word-title')).toHaveText('Haus');
  await expect(popup.locator('.gloss')).toHaveText('house');
  await expect(popup.locator('table')).toBeVisible();
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(popup.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
  expect(requests).toHaveLength(1);
  await popup.screenshot({ path: testInfo.outputPath('lookup.png') });
  await popup.reload();
  await expect(popup.locator('#word')).toHaveValue('Haus');
  await expect(popup.locator('#result')).toContainText('Press Look up');
  expect(requests).toHaveLength(1);
  expect(await worker.evaluate(async () => (await chrome.storage.session.get('pendingLookup')).pendingLookup)).toBeUndefined();
  const second = await extension.newPage();
  await second.goto(popupUrl);
  await second.locator('#saved-tab').click();
  await expect(second.locator('#saved-list')).toContainText('house');
  await second.close();
});

test('English lookup opens grammar, goes Back without fetching, and reverses direction', async ({ popup, popupUrl, extension }) => {
  let requests = 0;
  await extension.route('https://www.verbformen.com/**', route => {
    requests++;
    const url = new URL(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: url.pathname.includes('/adjectives/') ? kleinHtml : url.searchParams.has('w') ? englishResults : englishForm });
  });
  await popup.goto(popupUrl);
  await popup.locator('#mode-toggle').click();
  await expect(popup.locator('#word')).toBeFocused();
  await popup.locator('#word').fill('small');
  await popup.locator('#word').press('Enter');
  await expect(popup.locator('.translation-word')).toHaveText('klein');
  await popup.locator('.open-entry').click();
  await expect(popup.locator('.gloss')).toHaveText('small, little');
  await popup.getByRole('button', { name: 'Back to results' }).click();
  await expect(popup.locator('.translation-word')).toHaveText('klein');
  expect(requests).toBe(3);
  await popup.locator('#mode-toggle').click();
  await expect(popup.locator('#word')).toHaveValue('');
  await expect(popup.locator('#mode-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect(requests).toBe(3);
});

test('the worker serializes concurrent mutations from two popups and validates untrusted messages', async ({ popup, popupUrl, extension, worker }) => {
  await popup.goto(popupUrl);
  const second = await extension.newPage();
  await second.goto(popupUrl);
  const addWords = (page: Page, prefix: string) => page.evaluate(async prefix => Promise.all(Array.from({ length: 60 }, (_, index) => chrome.runtime.sendMessage({ type: 'savedWords', action: 'add', entry: { lemma: `${prefix}${index}`, meaning: 'word', partOfSpeech: 'noun', article: 'das' } }))), prefix);
  const responses = (await Promise.all([addWords(popup, 'First'), addWords(second, 'Second')])).flat();
  expect(responses.filter(response => response.ok)).toHaveLength(100);
  expect(responses.filter(response => !response.ok)).toHaveLength(20);
  const words = await worker.evaluate(async () => (await chrome.storage.local.get('savedWords')).savedWords);
  expect(words).toHaveLength(100);
  expect(new Set(words.map((word: { id: string }) => word.id)).size).toBe(100);
  const invalid = await popup.evaluate(async () => Promise.all([
    chrome.runtime.sendMessage({ type: 'savedWords', action: 'constructor' }),
    chrome.runtime.sendMessage({ type: 'savedWords', action: 'remove', id: {} }),
  ]));
  expect(invalid.every(response => response.ok === false)).toBe(true);
  expect(await worker.evaluate(() => chrome.runtime.getManifest().permissions)).toEqual(manifest.permissions);
  await second.close();
});

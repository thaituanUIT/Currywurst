const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ URL, URLSearchParams, TextEncoder, AbortController, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync('meaning.js', 'utf8'), context);

function harness(payload = { responseStatus: 200, responseData: { translatedText: 'French fries' } }, options = {}) {
  const state = {}, calls = [];
  const storage = { get: async () => state, set: async value => Object.assign(state, value) };
  const settings = { storage, fetchImpl: async (url, request) => {
    calls.push({ url, request });
    return { ok: true, url, json: async () => payload };
  }, ...options };
  return { state, calls, settings, translate: context.createBasicTranslationFallback(settings) };
}

test('Pommes uses the documented German-to-English endpoint with only the lookup text', async () => {
  const h = harness();
  const found = await h.translate('Pommes');
  assert.equal(found.meaning, 'French fries');
  assert.equal(found.meaningSource.provider, 'MyMemory');
  const { url, request } = h.calls[0];
  const address = new URL(url);
  assert.equal(address.origin, 'https://api.mymemory.translated.net');
  assert.equal(address.pathname, '/get');
  assert.equal(address.searchParams.get('q'), 'Pommes');
  assert.equal(address.searchParams.get('langpair'), 'de|en');
  assert.deepEqual([...address.searchParams.keys()].sort(), ['langpair', 'q']);
  assert.equal(request.credentials, 'omit');
  assert.equal(request.referrerPolicy, 'no-referrer');
  assert.equal(found.lemma, undefined);
  assert.equal(found.inflectionTables, undefined);
});

test('fallback requests preserve German characters and normalize decomposed input', async () => {
  for (const [word, expected, translation] of [
    ['  Pommes  ', 'Pommes', 'French fries'],
    ['Straße', 'Straße', 'street'],
    ['Fußgänger', 'Fußgänger', 'pedestrian'],
    ['Überraschung', 'Überraschung', 'surprise'],
    ['Café', 'Café', 'coffee shop'],
    ['Erla\u0308uterung', 'Erläuterung', 'explanation'],
  ]) {
    const h = harness({ responseStatus: 200, responseData: { translatedText: translation } });
    const result = await h.translate(word);
    assert.equal(result.meaning, translation);
    assert.equal(new URL(h.calls[0].url).searchParams.get('q'), expected);
    assert.equal(h.calls.length, 1);
  }
});

test('HTTP errors, invalid JSON, and connection failures do not get saved as translations', async () => {
  for (const fetchImpl of [
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } }),
    async () => { throw new TypeError('Failed to fetch'); },
  ]) {
    const h = harness(null, { fetchImpl });
    assert.equal(await h.translate('Pommes'), null);
    assert.equal(h.state.translationCache, undefined);
  }
});

test('translation cache survives reopening during the browser session and stays bounded', async () => {
  const h = harness();
  await h.translate('Pommes');
  await h.translate('Pommes');
  const reopened = context.createBasicTranslationFallback(h.settings);
  assert.equal((await reopened('Pommes')).meaning, 'French fries');
  assert.equal(h.calls.length, 1);
  for (let index = 0; index < 105; index++) await h.translate(`Wort${index}`);
  assert.equal(Object.keys(h.state.translationCache).length, 100);
});

test('unchanged outputs are treated as unavailable and cached briefly', async () => {
  const h = harness({ responseStatus: 200, responseData: { translatedText: 'Pommes' } });
  assert.equal(await h.translate('Pommes'), null);
  assert.equal(await h.translate('Pommes'), null);
  assert.equal(h.calls.length, 1);
  assert.ok(h.state.translationCache.Pommes.expires <= Date.now() + 300000);
});

test('quota notices, provider errors, invalid JSON shape, and redirects cannot become meanings', async () => {
  for (const payload of [
    { responseStatus: 429, responseData: { translatedText: 'quota exceeded' } },
    { responseStatus: 200, quotaFinished: true, responseData: { translatedText: 'quota exceeded' } },
    { responseStatus: 200, responseData: { translatedText: 42 } },
    { responseStatus: 200, responseData: { translatedText: 'a'.repeat(4001) } },
  ]) assert.equal(await harness(payload).translate('Pommes'), null);
  const hostile = harness(null, { fetchImpl: async () => ({ ok: true, url: 'https://evil.example/', json: async () => { throw new Error('must not parse'); } }) });
  assert.equal(await hostile.translate('Pommes'), null);
});

test('a stalled translation times out independently and cancellation rejects late work', async () => {
  let request;
  const h = harness(null, { timeoutMs: 5, fetchImpl: async (url, options) => { request = options; return new Promise(() => {}); } });
  assert.equal(await h.translate('Pommes'), null);
  assert.equal(request.signal.aborted, true);
  const controller = new AbortController();
  const waiting = h.translate('Pommes', controller.signal);
  controller.abort(new Error('New lookup'));
  await assert.rejects(waiting, /New lookup/);
  assert.equal(h.state.translationCache, undefined);
});

test('invalid or oversized input sends no request and entity decoding stays plain text', async () => {
  const h = harness();
  for (const word of ['', ' ', 'x'.repeat(161), '🍟'.repeat(150), 'word\nother']) assert.equal(await h.translate(word), null);
  assert.equal(h.calls.length, 0);
  assert.equal(context.decodeTranslationText('Fish &amp; chips &#x1f35f;'), 'Fish & chips 🍟');
  assert.equal(context.decodeTranslationText('&lt;img src=x onerror=alert(1)&gt;'), '<img src=x onerror=alert(1)>');
  assert.equal(context.decodeTranslationText('&#x110000; &#xD800;'), '&#x110000; &#xD800;');
});

test('a decomposed German echo is not presented as an English translation', async () => {
  const word = 'Unverhältnismäßigkeit';
  const h = harness({ responseStatus: 200, responseData: { translatedText: word.normalize('NFD') } });
  assert.equal(await h.translate(word), null);
  assert.equal(h.calls.length, 1);
});

test('a malformed stored translation cache does not block a fresh translation', async () => {
  const h = harness({ responseStatus: 200, responseData: { translatedText: 'fear of missed opportunities' } });
  h.state.translationCache = null;
  assert.equal((await h.translate('Torschlusspanik'))?.meaning, 'fear of missed opportunities');
  assert.equal(h.calls.length, 1);
});

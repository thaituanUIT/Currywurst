const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const context = vm.createContext({ URL, URLSearchParams, AbortController, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync('meaning.js', 'utf8'), context);
const noun = { lemma: 'Lernende', partOfSpeech: 'noun', article: 'der', meaning: '' };

function harness(pages = {}, options = {}) {
  const calls = [];
  const state = {};
  const storage = { get: async () => state, set: async value => Object.assign(state, value) };
  const fetchImpl = async (url, request) => {
    const title = new URL(url).searchParams.get('page');
    calls.push({ title, url, request });
    if (options.fetch) return options.fetch(url, request);
    return { ok: true, url, json: async () => ({ parse: { title, revid: 123, text: '' }, result: pages[title] || { meaning: '', related: [] } }) };
  };
  const settings = { fetchImpl, parsePage: payload => payload.result, storage, ...options };
  return { calls, state, settings, find: context.createEnglishMeaningFallback(settings) };
}

test('only a missing English gloss triggers fallback and requests are limited to attested links', async () => {
  const h = harness({ Lernende: { meaning: '', related: ['Lernender'] }, Lernender: { meaning: 'learner; student', related: [] } });
  assert.equal(await h.find({ ...noun, meaning: 'existing English' }), null);
  assert.equal(h.calls.length, 0);
  const found = await h.find(noun);
  assert.equal(found.meaning, 'learner; student');
  assert.equal(found.meaningSource.provider, 'Wiktionary');
  assert.equal(found.meaningSource.license, 'CC BY-SA 4.0');
  assert.match(found.meaningSource.url, /title=Lernender&oldid=123/);
  assert.deepEqual(h.calls.map(call => call.title), ['Lernende', 'Lernender']);
  assert.ok(h.calls.every(call => call.request.credentials === 'omit' && call.request.referrerPolicy === 'no-referrer' && new URL(call.url).origin === 'https://en.wiktionary.org'));
});

test('cycles and longer reference chains never exceed two requests', async () => {
  const h = harness({ Lernende: { meaning: '', related: ['Lernender'] }, Lernender: { meaning: '', related: ['Lernende', 'Third'] } });
  assert.equal(await h.find(noun), null);
  assert.equal(h.calls.length, 2);
});

test('cached meanings persist across popup instances and stay separate by gender', async () => {
  const h = harness({ Lernende: { meaning: 'learner', related: [] } });
  await h.find(noun);
  await h.find(noun);
  assert.equal(h.calls.length, 1);
  const reopened = context.createEnglishMeaningFallback(h.settings);
  assert.equal((await reopened(noun)).meaning, 'learner');
  assert.equal(h.calls.length, 1);
  await reopened({ ...noun, article: 'die' });
  assert.equal(h.calls.length, 2);
});

test('missing definitions are cached briefly without failing the grammar lookup', async () => {
  const h = harness();
  assert.equal(await h.find(noun), null);
  assert.equal(await h.find(noun), null);
  assert.equal(h.calls.length, 1);
});

test('a meaning timeout aborts the request and returns without waiting for the network', async () => {
  const h = harness({}, { timeoutMs: 5, fetch: () => new Promise(() => {}) });
  assert.equal(await h.find(noun), null);
  assert.equal(h.calls[0].request.signal.aborted, true);
});

test('caller cancellation and unexpected redirects cannot produce a definition', async () => {
  const h = harness({}, { fetch: () => new Promise(() => {}) });
  const controller = new AbortController();
  const pending = h.find(noun, controller.signal);
  controller.abort(new Error('Cancelled'));
  await assert.rejects(pending, /Cancelled/);
  const hostile = harness({}, { fetch: async () => ({ ok: true, url: 'https://evil.example/', json: async () => { throw new Error('must not parse'); } }) });
  assert.equal(await hostile.find(noun), null);
});

test('Wiktionary title links reject foreign hosts and non-entry namespaces', () => {
  assert.equal(context.wiktionaryTitle('/wiki/Lernender#German'), 'Lernender');
  assert.equal(context.wiktionaryTitle('https://evil.example/wiki/Lernender'), null);
  assert.equal(context.wiktionaryTitle('/wiki/Category:German'), null);
  assert.equal(context.wiktionaryTitle('javascript:alert(1)'), null);
});

test('temporary Wiktionary HTTP and API errors can be retried without a poisoned negative cache', async () => {
  const entry = { lemma: 'Unwägbarkeit', partOfSpeech: 'noun', article: 'die', meaning: '' };
  for (const first of [
    { ok: false, status: 429 }, { ok: false, status: 503 },
    { ok: true, json: async () => ({ error: { code: 'ratelimited', info: 'Try again later' } }) },
    { ok: true, json: async () => null },
  ]) {
    let attempts = 0;
    const h = harness({}, { fetch: async () => ++attempts === 1 ? first : { ok: true, json: async () => ({ parse: { title: entry.lemma, revid: 456, text: '' }, result: { meaning: 'uncertainty; imponderability', related: [] } }) }, parsePage: payload => payload?.result || { meaning: '', related: [] } });
    assert.equal(await h.find(entry), null);
    assert.equal(h.state.meaningCache, undefined);
    assert.equal((await h.find(entry)).meaning, 'uncertainty; imponderability');
    assert.equal(attempts, 2);
  }
});

test('a malformed stored meaning cache does not block an online definition', async () => {
  const h = harness({ Unwägbarkeit: { meaning: 'uncertainty', related: [] } });
  h.state.meaningCache = null;
  assert.equal((await h.find({ lemma: 'Unwägbarkeit', partOfSpeech: 'noun', article: 'die' }))?.meaning, 'uncertainty');
  assert.equal(h.calls.length, 1);
});

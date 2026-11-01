const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const parserContext = vm.createContext({ URL });
vm.runInContext(fs.readFileSync('parser.js', 'utf8'), parserContext);

function makeElement(dataset = {}) {
  return { dataset, value: '', innerHTML: '', listeners: {}, focus() { this.focused = true; }, getAttribute(name) { return this[name] ?? null; }, setAttribute(name, value) { this[name] = value; }, addEventListener(type, fn) { this.listeners[type] = fn; }, querySelectorAll() { return []; } };
}
function harness(savedState = {}, sessionState = {}) {
  const elements = Object.fromEntries(['#word', '#result', '#source', '#search-form', '#mode-toggle', '.search-label', '#back-results', '#retry'].map(id => [id, makeElement()]));
  const entries = [{ lemma: 'klein', label: 'klein', partOfSpeech: 'adjective', meaning: 'small, little', url: 'https://www.verbformen.com/declension/adjectives/klein.htm' }];
  const entryButton = makeElement({ entry: '0' });
  const variantButton = makeElement({ nounVariant: '1' });
  elements['#result'].querySelectorAll = selector => selector === '[data-entry]' ? [entryButton] : selector === '[data-noun-variant]' && elements['#result'].innerHTML.includes('data-noun-variant') ? [variantButton] : [];
  const requests = [], saved = [];
  const context = vm.createContext({
    document: { documentElement: { dataset: {} }, querySelector: id => elements[id] }, window: {},
    chrome: { storage: {
      local: { get: async () => savedState, set: async value => saved.push(value) },
      session: {
        get: async () => ({ ...sessionState }),
        set: async value => Object.assign(sessionState, value),
        remove: async key => { delete sessionState[key]; },
      },
    } },
    AbortController, URL, URLSearchParams, setTimeout, clearTimeout,
    fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })),
    parseEnglishSearchForm: () => ({ action: 'https://www.verbformen.com/en-de/', method: 'GET', fields: [['language', 'en']] }),
    parseEnglishResults: () => entries,
    isGermanEntryMatch: parserContext.isGermanEntryMatch,
    dictionaryEntryUrl: parserContext.dictionaryEntryUrl,
    parseGermanSearchEntries: () => [],
    parseVerbformen: (_, word) => ({ word, lemma: word, title: `Noun ${word}`, ipa: [], audio: [], inflectionTables: [], meaning: word }),
  });
  vm.runInContext(fs.readFileSync('lookup.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('popup.js', 'utf8'), context);
  const respond = (index) => requests[index].resolve({ ok: true, text: async () => '', url: requests[index].url });
  return { context, elements, requests, saved, respond, entryButton, variantButton, sessionState };
}

test('latest search wins and manual searches persist', async () => {
  const h = harness();
  await tick();
  const first = h.context.runLookup('alt');
  const second = h.context.runLookup('neu');
  assert.equal(h.requests[0].options.signal.aborted, true);
  h.respond(1);
  await second;
  const latest = h.elements['#result'].innerHTML;
  h.respond(0);
  await first;
  assert.equal(h.elements['#result'].innerHTML, latest);
  assert.match(latest, /neu/);
  assert.equal(h.saved.at(-1).lookupWord, 'neu');
});

test('mode switch clears the old word and waits for a new explicit search', async () => {
  const h = harness();
  await tick();
  const old = h.context.runLookup('alt');
  h.elements['#word'].value = 'small';
  h.elements['#mode-toggle'].listeners.click();
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.match(h.elements['#mode-toggle'].textContent, /EN → DE/);
  assert.equal(h.elements['#word'].value, '');
  assert.equal(h.elements['#word'].focused, true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.saved.at(-1).lookupWord, '');
  h.elements['#word'].value = 'small';
  const search = h.context.runLookup('small');
  assert.match(h.elements['#result'].innerHTML, /Finding translations for small/);
  h.respond(1); // English search form
  await tick();
  const url = new URL(h.requests[2].url);
  assert.equal(url.searchParams.get('language'), 'en');
  assert.equal(url.searchParams.get('w'), 'small');
  h.respond(2);
  await search;
  assert.match(h.elements['#result'].innerHTML, /klein/);
  assert.match(h.elements['#result'].innerHTML, /data-language="en-GB"/);
  assert.match(h.elements['#result'].innerHTML, /data-language="de-DE"/);
  const latest = h.elements['#result'].innerHTML;
  h.respond(0);
  await old;
  assert.equal(h.elements['#result'].innerHTML, latest);
  assert.equal(h.saved.at(-1).lookupMode, 'en-de');
});

test('opening grammar and returning uses the English result list without refetching', async () => {
  const h = harness();
  await tick();
  h.context.setMode('en-de');
  const search = h.context.runLookup('small');
  h.respond(0);
  await tick();
  h.respond(1);
  await search;
  h.entryButton.listeners.click();
  assert.match(h.elements['#result'].innerHTML, /Loading grammar for klein/);
  assert.equal(h.requests[2].url, 'https://www.verbformen.com/declension/adjectives/klein.htm');
  h.respond(2);
  await tick();
  assert.match(h.elements['#result'].innerHTML, /Back to results/);
  h.elements['#back-results'].listeners.click();
  assert.equal(h.requests.length, 3);
  assert.match(h.elements['#result'].innerHTML, /German match/);
  assert.equal(h.saved.at(-1).lookupWord, 'small');
});

test('browser restart restores the saved word and mode without replaying a lookup', async () => {
  const h = harness({ lookupMode: 'en-de', lookupWord: 'small', lookupAuto: true, lookupHint: 'en' });
  await tick();
  assert.equal(h.elements['#word'].value, 'small');
  assert.match(h.elements['#mode-toggle'].textContent, /EN → DE/);
  assert.equal(h.requests.length, 0);
  assert.match(h.elements['#result'].innerHTML, /Press Look up/);
  h.elements['#search-form'].listeners.submit({ preventDefault() {} });
  // Submission starts a fresh lookup in the restored direction.
  assert.equal(h.requests[0].url, 'https://www.verbformen.com/en-de/');
  h.respond(0);
  await tick();
  h.respond(1);
  await tick();
  assert.match(h.elements['#result'].innerHTML, /klein/);
});

test('a fresh right-click request is consumed once and does not replay on reopening', async () => {
  const session = { pendingLookup: { word: 'Bruder', hint: 'de', createdAt: Date.now() } };
  const h = harness({ lookupWord: 'old', lookupMode: 'en-de' }, session);
  await tick();
  assert.equal(h.elements['#word'].value, 'Bruder');
  assert.equal(session.pendingLookup, undefined);
  assert.equal(h.requests.length, 1);
  h.respond(0);
  await tick();
  assert.match(h.elements['#result'].innerHTML, /Bruder/);
  const reopened = harness({ lookupWord: 'Bruder', lookupMode: 'de-en', lookupAuto: true }, session);
  await tick();
  assert.equal(reopened.requests.length, 0);
  assert.equal(reopened.elements['#word'].value, 'Bruder');
});

test('expired and malformed right-click requests cannot trigger automatic network requests', async () => {
  for (const request of [
    { word: 'old', hint: 'de', createdAt: Date.now() - 120000 },
    { word: 'old', hint: 'de' },
    { word: 'old', createdAt: Date.now() + 120000 },
    { word: '', createdAt: Date.now() },
  ]) {
    const h = harness({ lookupWord: 'Bruder' }, { pendingLookup: request });
    await tick();
    assert.equal(h.requests.length, 0);
    assert.equal(h.sessionState.pendingLookup, undefined);
    assert.equal(h.elements['#word'].value, 'Bruder');
  }
});

test('typing before storage restoration finishes discards the pending lookup', async () => {
  const h = harness({ lookupWord: 'old' }, { pendingLookup: { word: 'Bruder', hint: 'de', createdAt: Date.now() } });
  h.elements['#word'].value = 'new word';
  h.elements['#word'].listeners.input();
  await tick();
  assert.equal(h.elements['#word'].value, 'new word');
  assert.equal(h.requests.length, 0);
  assert.equal(h.sessionState.pendingLookup, undefined);
});

test('right-click exposes one automatic lookup and keeps manual direction unchanged', async () => {
  const installed = [], clicked = [], menus = [], saved = [], session = [];
  let opened = 0;
  const context = vm.createContext({ chrome: {
    runtime: { onInstalled: { addListener: fn => installed.push(fn) } },
    contextMenus: { removeAll: fn => fn(), create: menu => menus.push(menu), onClicked: { addListener: fn => clicked.push(fn) } },
    storage: {
      local: { set: async value => saved.push(value) },
      session: { set: async value => session.push(value) },
    },
    scripting: { executeScript: async options => { assert.equal(options.target.tabId, 7); return [{ result: 'en' }]; } },
    action: { openPopup: async () => { opened++; } },
  } });
  vm.runInContext(fs.readFileSync('background.js', 'utf8'), context);
  installed[0]();
  assert.equal(menus.length, 1);
  assert.match(menus[0].title, /Look up with Currywurst/);
  await clicked[0]({ menuItemId: 'german-word-lookup', selectionText: '“make for”' }, { id: 7 });
  assert.equal(saved[0].lookupWord, 'make for');
  assert.equal(saved[0].lookupMode, undefined);
  assert.equal(session[0].pendingLookup.word, 'make for');
  assert.equal(session[0].pendingLookup.hint, 'en');
  assert.ok(Number.isFinite(session[0].pendingLookup.createdAt));
  await clicked[0]({ menuItemId: 'german-word-lookup', selectionText: 'machst' });
  assert.equal(session[1].pendingLookup.hint, '');
  assert.equal(opened, 2);
});

test('automatic English selection uses page hint and saves the detected direction', async () => {
  const h = harness();
  await tick();
  const lookup = h.context.runLookup('small', null, { automatic: true, hint: 'en' });
  assert.equal(h.requests[0].url, 'https://www.verbformen.com/en-de/');
  h.respond(0);
  await tick();
  h.respond(1);
  await lookup;
  assert.match(h.elements['#mode-toggle'].textContent, /EN → DE/);
  assert.match(h.elements['#result'].innerHTML, /klein/);
  assert.equal(h.saved.at(-1).lookupMode, 'en-de');
  assert.ok(h.saved.every(value => !('lookupAuto' in value) && !('lookupHint' in value)));
});

test('German selection on an English page falls back to a German entry', async () => {
  const h = harness();
  await tick();
  h.context.parseEnglishResults = () => [];
  const lookup = h.context.runLookup('Bruder', null, { automatic: true, hint: 'en' });
  h.respond(0);
  await tick();
  h.respond(1);
  await tick();
  assert.match(h.requests[2].url, /w=Bruder/);
  h.respond(2);
  await lookup;
  assert.match(h.elements['#mode-toggle'].textContent, /DE → EN/);
  assert.match(h.elements['#result'].innerHTML, /Bruder/);
});

test('an unrelated German redirect is rejected before English fallback', async () => {
  const h = harness();
  await tick();
  h.context.parseVerbformen = () => ({ title: 'Noun Abend', lemma: 'Abend', meaning: 'evening', inflectionTables: [] });
  const lookup = h.context.runLookup('small', null, { automatic: true });
  h.respond(0);
  await tick();
  assert.equal(h.requests[1].url, 'https://www.verbformen.com/en-de/');
  h.respond(1);
  await tick();
  h.respond(2);
  await lookup;
  assert.match(h.elements['#result'].innerHTML, /klein/);
});

test('German detection accepts inflected verbs but rejects an English synonym', () => {
  const entry = { title: 'Conjugation of German verb machen', lemma: 'machen', meaning: 'make, do', inflectionTables: [{ rows: [['ich', 'mache'], ['du', 'machst']] }] };
  assert.equal(parserContext.isGermanEntryMatch(entry, 'machst'), true);
  assert.equal(parserContext.isGermanEntryMatch(entry, 'machen'), true);
  assert.equal(parserContext.isGermanEntryMatch(entry, 'make'), false);
  assert.equal(parserContext.isGermanEntryMatch({ ...entry, title: 'Dictionary German-English', lemma: 'make' }, 'make'), false);
});

test('manual direction change prevents an automatic fallback from overwriting results', async () => {
  const h = harness();
  await tick();
  h.context.parseEnglishResults = () => [];
  const automatic = h.context.runLookup('small', null, { automatic: true, hint: 'en' });
  h.respond(0);
  await tick();
  h.elements['#word'].value = 'Bruder';
  h.elements['#mode-toggle'].listeners.click();
  assert.equal(h.elements['#word'].value, '');
  assert.equal(h.requests.length, 2);
  await tick();
  const displayed = h.elements['#result'].innerHTML;
  h.respond(1); // obsolete automatic English request must not try German next
  await automatic;
  assert.equal(h.requests.length, 2);
  assert.equal(h.elements['#result'].innerHTML, displayed);
  assert.equal(h.saved.at(-1).lookupWord, '');
});


test('switching back to German also clears the saved query without sending a lookup', async () => {
  const h = harness();
  await tick();
  h.context.setMode('en-de');
  h.elements['#word'].value = 'brother';
  h.elements['#mode-toggle'].listeners.click();
  assert.equal(h.elements['#word'].value, '');
  assert.equal(h.saved.at(-1).lookupWord, '');
  assert.equal(h.saved.at(-1).lookupMode, 'de-en');
  assert.equal(h.requests.length, 0);
  assert.match(h.elements['#result'].innerHTML, /Type a word/);
});


test('switching a noun gender loads the chosen entry and preserves the original plural', async () => {
  const h = harness();
  await tick();
  const variants = [
    { article: 'die', lemma: 'Vokabel', label: 'die Vokabel', url: 'https://www.verbformen.com/declension/nouns/Vokabel.htm' },
    { article: 'das', lemma: 'Vokabel', label: 'das Vokabel', url: 'https://www.verbformen.com/declension/nouns/Vokabel_neut.htm' },
  ];
  const data = { word: 'Vokabeln', lemma: 'Vokabel', article: 'die', meaning: 'word', variants, ipa: [], audio: [], inflectionTables: [], sourceUrl: variants[0].url };
  h.context.renderGermanEntry(data);
  assert.match(h.elements['#result'].innerHTML, /die Vokabel/);
  assert.match(h.elements['#result'].innerHTML, /das Vokabel/);
  assert.equal(h.requests.length, 0);
  h.context.parseVerbformen = (_, word) => ({ ...data, word, article: 'das', sourceUrl: variants[1].url, usageNotes: ['Southern Germany, Austria, Switzerland'] });
  h.variantButton.listeners.click();
  assert.match(h.elements['#result'].innerHTML, /Loading das Vokabel/);
  assert.equal(h.requests[0].url, variants[1].url);
  h.respond(0);
  await tick();
  assert.match(h.elements['#result'].innerHTML, /data-noun-variant="1" aria-pressed="true"/);
  assert.match(h.elements['#result'].innerHTML, /Southern Germany, Austria, Switzerland/);
  assert.match(h.elements['#result'].innerHTML, /data-speak="Vokabeln"/);
  assert.equal(h.saved.length, 0);
});

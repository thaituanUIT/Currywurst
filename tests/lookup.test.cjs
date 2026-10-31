const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const tick = () => new Promise(resolve => setImmediate(resolve));

function makeElement(dataset = {}) {
  return { dataset, value: '', innerHTML: '', listeners: {}, setAttribute(name, value) { this[name] = value; }, addEventListener(type, fn) { this.listeners[type] = fn; }, querySelectorAll() { return []; } };
}
function harness(savedState = {}) {
  const elements = Object.fromEntries(['#word', '#result', '#source', '#search-form', '#mode-toggle', '.search-label', '#back-results', '#retry'].map(id => [id, makeElement()]));
  const entries = [{ lemma: 'klein', label: 'klein', partOfSpeech: 'adjective', meaning: 'small, little', url: 'https://www.verbformen.com/declension/adjectives/klein.htm' }];
  const entryButton = makeElement({ entry: '0' });
  elements['#result'].querySelectorAll = selector => selector === '[data-entry]' ? [entryButton] : [];
  const requests = [], saved = [];
  const context = vm.createContext({
    document: { documentElement: { dataset: {} }, querySelector: id => elements[id] }, window: {},
    chrome: { storage: { local: { get: async () => savedState, set: async value => saved.push(value) } } },
    AbortController, URL, URLSearchParams, setTimeout, clearTimeout,
    fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })),
    parseEnglishSearchForm: () => ({ action: 'https://www.verbformen.com/en-de/', method: 'GET', fields: [['language', 'en']] }),
    parseEnglishResults: () => entries,
    parseVerbformen: (_, word) => ({ word, lemma: word, ipa: [], audio: [], inflectionTables: [], meaning: word }),
  });
  vm.runInContext(fs.readFileSync('popup.js', 'utf8'), context);
  const respond = (index) => requests[index].resolve({ ok: true, text: async () => '', url: requests[index].url });
  return { context, elements, requests, saved, respond, entryButton };
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

test('mode button cancels an old request and preserves English search settings', async () => {
  const h = harness();
  await tick();
  const old = h.context.runLookup('alt');
  h.elements['#word'].value = 'small';
  h.elements['#mode-toggle'].listeners.click();
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.match(h.elements['#mode-toggle'].innerHTML, /EN → DE/);
  h.respond(1); // English search form
  await tick();
  const url = new URL(h.requests[2].url);
  assert.equal(url.searchParams.get('language'), 'en');
  assert.equal(url.searchParams.get('w'), 'small');
  h.respond(2);
  await tick();
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
  assert.equal(h.requests[2].url, 'https://www.verbformen.com/declension/adjectives/klein.htm');
  h.respond(2);
  await tick();
  assert.match(h.elements['#result'].innerHTML, /Back to results/);
  h.elements['#back-results'].listeners.click();
  assert.equal(h.requests.length, 3);
  assert.match(h.elements['#result'].innerHTML, /German match/);
  assert.equal(h.saved.at(-1).lookupWord, 'small');
});

test('saved direction is restored and its English query runs in that mode', async () => {
  const h = harness({ lookupMode: 'en-de', lookupWord: 'small' });
  await tick();
  assert.equal(h.elements['#word'].value, 'small');
  assert.match(h.elements['#mode-toggle'].innerHTML, /EN → DE/);
  assert.equal(h.requests[0].url, 'https://www.verbformen.com/en-de/');
  h.respond(0);
  await tick();
  h.respond(1);
  await tick();
});

test('right-click actions pass the chosen language direction to the popup', async () => {
  const installed = [], clicked = [], menus = [], saved = [];
  let opened = 0;
  const context = vm.createContext({ chrome: {
    runtime: { onInstalled: { addListener: fn => installed.push(fn) } },
    contextMenus: { removeAll: fn => fn(), create: menu => menus.push(menu), onClicked: { addListener: fn => clicked.push(fn) } },
    storage: { local: { set: async value => saved.push(value) } },
    action: { openPopup: async () => { opened++; } },
  } });
  vm.runInContext(fs.readFileSync('background.js', 'utf8'), context);
  installed[0]();
  assert.equal(menus.length, 2);
  await clicked[0]({ menuItemId: 'english-word-lookup', selectionText: '“make for”' });
  assert.equal(saved[0].lookupMode, 'en-de');
  assert.equal(saved[0].lookupWord, 'make for');
  await clicked[0]({ menuItemId: 'german-word-lookup', selectionText: 'machst' });
  assert.equal(saved[1].lookupMode, 'de-en');
  assert.equal(opened, 2);
});

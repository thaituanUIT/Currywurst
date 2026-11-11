const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { browserI18n, english } = require('./helpers/i18n.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const parserContext = vm.createContext({ URL });
vm.runInContext(fs.readFileSync('dictionary-sources.js', 'utf8'), parserContext);
vm.runInContext(fs.readFileSync('parser.js', 'utf8'), parserContext);

function makeElement(dataset = {}) {
  return { dataset, value: '', innerHTML: '', listeners: {}, focus() { this.focused = true; }, getAttribute(name) { return this[name] ?? null; }, setAttribute(name, value) { this[name] = value; }, addEventListener(type, fn) { this.listeners[type] = fn; }, querySelectorAll() { return []; }, insertAdjacentHTML(position, html) { this.innerHTML += html; } };
}
function fallbackRuntime() {
  const context = vm.createContext({ URL, URLSearchParams, TextEncoder, AbortController, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync('meaning.js', 'utf8'), context);
  return context;
}
function harness(savedState = {}, sessionState = {}, meaningLookup = async () => null, basicLookup = async () => null, locale = {}, sendSavedMessage) {
  const elements = Object.fromEntries(['#word', '#result', '#source', '#search-form', '#mode-toggle', '.search-label', '#back-results', '#retry', '#lookup-tab', '#saved-tab', '#lookup-view', '#saved-view', '#saved-count', '#saved-list', '#saved-status', '#undo-delete', '#save-word', '#save-status'].map(id => [id, makeElement()]));
  const entries = [{ lemma: 'klein', label: 'klein', partOfSpeech: 'adjective', meaning: 'small, little', url: 'https://www.verbformen.com/declension/adjectives/klein.htm' }];
  const entryButton = makeElement({ entry: '0' });
  const variantButton = makeElement({ nounVariant: '1' });
  let savedWordButtons = [], deleteButtons = [], degreeButtons = [], choiceButtons = [], nounButtons = [];
  elements['#result'].querySelectorAll = selector => {
    if (selector === '[data-entry]') return [entryButton];
    if (selector === '[data-noun-variant]') {
      nounButtons = [...elements['#result'].innerHTML.matchAll(/data-noun-variant="(\d+)" aria-pressed="(true|false)"/g)].map(match => {
        const button = match[1] === '1' ? variantButton : makeElement({ nounVariant: match[1] });
        button.setAttribute('aria-pressed', match[2]);
        return button;
      });
      return nounButtons;
    }
    if (selector === '[data-degree]' || selector === '[data-entry-choice]') {
      const attribute = selector === '[data-degree]' ? 'degree' : 'entry-choice';
      const dataset = attribute === 'degree' ? 'degree' : 'entryChoice';
      const buttons = [...elements['#result'].innerHTML.matchAll(new RegExp(`data-${attribute}="(\\d+)" aria-pressed="(true|false)"`, 'g'))].map(match => {
        const button = makeElement({ [dataset]: match[1] });
        button.setAttribute('aria-pressed', match[2]);
        return button;
      });
      if (attribute === 'degree') degreeButtons = buttons;
      else choiceButtons = buttons;
      return buttons;
    }
    return [];
  };
  elements['#result'].querySelector = selector => selector === '.loading'
    ? elements['#result'].innerHTML.includes('class="loading"') ? {} : null
    : elements['#result'].innerHTML.includes(`id="${selector.slice(1)}"`) ? elements[selector] : null;
  elements['#saved-list'].querySelectorAll = selector => {
    if (selector === '[data-saved-word]') {
      savedWordButtons = [...elements['#saved-list'].innerHTML.matchAll(/data-saved-word="(\d+)"/g)].map(match => makeElement({ savedWord: match[1] }));
      return savedWordButtons;
    }
    if (selector === '[data-delete-word]') {
      deleteButtons = [...elements['#saved-list'].innerHTML.matchAll(/data-delete-word="(\d+)"/g)].map(match => makeElement({ deleteWord: match[1] }));
      return deleteButtons;
    }
    return [];
  };
  const requests = [], saved = [], savedMessages = [];
  const context = vm.createContext({
    document: { documentElement: { dataset: {} }, querySelectorAll: () => [], querySelector: id => elements[id] }, window: {},
    chrome: { i18n: browserI18n(locale), storage: {
      local: { get: async () => ({ ...savedState }), set: async value => { saved.push(value); Object.assign(savedState, value); } },
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
    dictionaryRequestUrl: parserContext.dictionaryRequestUrl,
    normalizeGermanForm: parserContext.normalizeGermanForm,
    mergeEntryChoices: parserContext.mergeEntryChoices,
    parseGermanSearchEntries: () => [],
    parseVerbformen: (_, word) => ({ word, lemma: word, title: `Noun ${word}`, ipa: [], audio: [], inflectionTables: [], meaning: word }),
  });
  vm.runInContext(fs.readFileSync('i18n.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('saved-words.js', 'utf8'), context);
  context.createEnglishMeaningFallback = () => meaningLookup;
  context.createBasicTranslationFallback = () => basicLookup;
  const store = context.createSavedWordsStore(context.chrome.storage.local);
  context.chrome.runtime = { sendMessage: async message => {
    savedMessages.push(message);
    if (sendSavedMessage) return sendSavedMessage(message);
    try {
      const argument = message.action === 'remove' ? message.id : message.entry;
      return { ok: true, ...await store[message.action](argument) };
    } catch (error) { return { ok: false, error: error.message, messageKey: error.messageKey }; }
  } };
  vm.runInContext(fs.readFileSync('lookup.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('popup.js', 'utf8'), context);
  const respond = (index) => requests[index].resolve({ ok: true, text: async () => '', url: requests[index].url });
  return { context, elements, requests, saved, savedMessages, respond, entryButton, variantButton, sessionState, savedState, savedWordButtons: () => savedWordButtons, deleteButtons: () => deleteButtons, degreeButtons: () => degreeButtons, choiceButtons: () => choiceButtons, nounButtons: () => nounButtons };
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

test('localized popup messages leave lookup directions and dictionary content unchanged', async () => {
  const locale = {
    ui_locale: { message: 'zz' },
    mode_to_english_label: { message: 'Direction DE EN' },
    mode_to_german_label: { message: 'Direction EN DE' },
    search_german_label: { message: 'SOURCE WORD' },
    grammar_noun: { message: 'NOUN LABEL' },
    heading_singular: { message: 'SINGULAR LABEL' },
    save_button: { message: 'Keep' },
    loading_german: { ...english.loading_german, message: 'Search: $WORD$' },
  };
  const h = harness({}, {}, async () => null, async () => null, locale);
  await tick();
  assert.equal(h.context.document.documentElement.lang, 'zz');
  assert.equal(h.elements['.search-label'].textContent, 'SOURCE WORD');
  const pending = h.context.runLookup('Haus');
  assert.match(h.elements['#result'].innerHTML, /Search: Haus/);
  assert.equal(new URL(h.requests[0].url).searchParams.get('w'), 'Haus');
  assert.equal(new URL(h.requests[0].url).searchParams.get('l'), '11');
  h.context.parseVerbformen = (_, word, sourceUrl) => germanEntry('Haus', { word, sourceUrl, title: 'German noun Haus', meaning: 'house', article: 'das', inflectionTables: [{ title: 'Singular', rows: [['Nom.', 'das', 'Haus']], cells: [[{ header: false, colSpan: 1, rowSpan: 1 }, { header: false, colSpan: 1, rowSpan: 1 }, { header: false, colSpan: 1, rowSpan: 1 }]] }] });
  h.respond(0);
  await pending;
  assert.match(h.elements['#result'].innerHTML, /NOUN LABEL/);
  assert.match(h.elements['#result'].innerHTML, /SINGULAR LABEL/);
  assert.match(h.elements['#result'].innerHTML, /class="gloss" lang="en">house/);
  assert.match(h.elements['#result'].innerHTML, /lang="de">Haus/);
  assert.equal(h.elements['#save-word'].textContent, 'Keep');
  h.elements['#mode-toggle'].listeners.click();
  assert.equal(h.context.document.documentElement.dataset.mode, 'en-de');
  assert.equal(h.elements['#mode-toggle'].getAttribute('aria-label'), 'Direction EN DE');
});

test('localized audio labels escape both message text and selected words', async () => {
  const h = harness({}, {}, async () => null, async () => null, {
    play_pronunciation_label: { ...english.play_pronunciation_label, message: '<Listen> $WORD$' },
  });
  await tick();
  const html = h.context.speakerButton('<img src=x>', 'de-DE');
  assert.match(html, /aria-label="&lt;Listen&gt; &lt;img src=x&gt;"/);
  assert.doesNotMatch(html, /<Listen>|<img/);
});

test('mode switch clears the old word and waits for a new explicit search', async () => {
  const h = harness();
  await tick();
  const old = h.context.runLookup('alt');
  h.elements['#word'].value = 'small';
  h.elements['#mode-toggle'].listeners.click();
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.match(h.elements['#mode-toggle'].getAttribute('aria-label'), /^English to German/);
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


test('a missing Pommes entry shows a basic translation, audio, and saved provider without grammar or related entries', async () => {
  const calls = [];
  const h = harness({}, {}, async () => null, async (word, signal) => {
    calls.push({ word, signal });
    return { meaning: 'French fries', meaningSource: { provider: 'MyMemory', url: 'https://mymemory.translated.net/' } };
  });
  await tick();
  h.context.lookupGermanEntry = async () => null;
  await h.context.runLookup('Pommes');
  assert.equal(calls[0].word, 'Pommes');
  assert.match(h.elements['#result'].innerHTML, /French fries/);
  assert.doesNotMatch(h.elements['#result'].innerHTML, /Basic translation|grammar unavailable/);
  assert.match(h.elements['#result'].innerHTML, /data-speak="Pommes"/);
  assert.match(h.elements['#result'].innerHTML, /Translation from.*MyMemory/);
  assert.doesNotMatch(h.elements['#result'].innerHTML, /inflection-grid|Related entries|RELATED ENTRIES|CC BY-SA/);
  await h.context.saveCurrentWord();
  assert.equal(h.savedState.savedWords[0].lemma, 'Pommes');
  assert.equal(h.savedState.savedWords[0].meaningSource.provider, 'MyMemory');
  assert.equal(h.savedState.savedWords[0].partOfSpeech, '');
  h.elements['#saved-tab'].listeners.click();
  await tick();
  assert.match(h.elements['#saved-list'].innerHTML, /MyMemory/);
});

test('a verified dictionary entry does not call the basic translation service', async () => {
  let calls = 0;
  const h = harness({}, {}, async () => null, async () => { calls++; });
  await tick();
  h.context.lookupGermanEntry = async () => ({ data: germanEntry('Haus'), sourceUrl: 'https://www.verbformen.com/declension/nouns/Haus.htm' });
  await h.context.runLookup('Haus');
  assert.equal(calls, 0);
  assert.doesNotMatch(h.elements['#result'].innerHTML, /Basic translation/);
});

test('ohne switches between exact inline word types locally and reopens the saved type', async () => {
  let translations = 0;
  const h = harness({}, {}, async () => null, async () => { translations++; return null; });
  await tick();
  const cards = [
    { partOfSpeech: 'preposition', meaning: 'without', grammarTags: ['accusative'] },
    { partOfSpeech: 'conjunction', meaning: 'without, but for', grammarTags: ['subordinating'] },
  ].map(entry => ({ lemma: 'ohne', label: 'ohne', detailUrl: null, data: germanEntry('ohne', { ...entry, article: '', title: `German ${entry.partOfSpeech} ohne`, level: 'A1' }) }));
  h.context.parseVerbformen = () => ({ title: 'All German words', lemma: 'ohne', meaning: '', inflectionTables: [] });
  h.context.parseGermanSearchEntries = () => cards;
  const lookup = h.context.runLookup('ohne');
  h.respond(0);
  await lookup;
  assert.equal(h.choiceButtons().length, 2);
  assert.equal(h.choiceButtons()[0].getAttribute('aria-pressed'), 'true');
  assert.match(h.elements['#result'].innerHTML, /accusative/);
  h.choiceButtons()[1].listeners.click();
  assert.equal(h.choiceButtons()[1].getAttribute('aria-pressed'), 'true');
  assert.match(h.elements['#result'].innerHTML, /without, but for/);
  assert.match(h.elements['#result'].innerHTML, /subordinating/);
  assert.doesNotMatch(h.elements['#result'].innerHTML, /accusative/);
  assert.equal(h.requests.length, 1);
  await h.context.saveCurrentWord();
  assert.equal(h.savedState.savedWords[0].partOfSpeech, 'conjunction');
  h.choiceButtons()[0].listeners.click();
  assert.equal(h.requests.length, 1);
  const reopened = h.context.openSavedWord(h.savedState.savedWords[0]);
  h.respond(1);
  await reopened;
  assert.equal(h.choiceButtons()[1].getAttribute('aria-pressed'), 'true');
  assert.match(h.elements['#result'].innerHTML, /without, but for/);
  assert.equal(translations, 0);
});

test('Woerter candidates fetch their own definitions, update the source, and retain saved source URLs', async () => {
  const h = harness();
  await tick();
  const choices = ['preposition', 'conjunction'].map(partOfSpeech => ({ lemma: 'ohne', label: `${partOfSpeech} · ohne`, partOfSpeech, url: `https://www.woerter.net/${partOfSpeech}s/ohne.htm` }));
  const makeEntry = (partOfSpeech, sourceUrl) => germanEntry('ohne', { title: `Definition of German ${partOfSpeech} ohne`, partOfSpeech, article: '', meaning: partOfSpeech === 'preposition' ? 'without' : 'without, but for', sourceUrl, entryChoices: choices });
  h.context.lookupGermanEntry = async () => ({ data: makeEntry('preposition', choices[0].url), sourceUrl: choices[0].url });
  h.context.parseVerbformen = (_, word, sourceUrl) => makeEntry('conjunction', sourceUrl);
  await h.context.runLookup('ohne');
  assert.match(h.elements['#source'].innerHTML, /Woerter\.net/);
  h.choiceButtons()[1].listeners.click();
  assert.equal(h.requests[0].url, choices[1].url);
  assert.equal(h.requests[0].options.credentials, 'omit');
  assert.equal(h.requests[0].options.referrerPolicy, 'no-referrer');
  h.respond(0);
  await tick();
  assert.match(h.elements['#result'].innerHTML, /without, but for/);
  assert.equal(h.elements['#source'].href, choices[1].url);
  await h.context.saveCurrentWord();
  assert.equal(h.savedState.savedWords[0].sourceUrl, choices[1].url);
  h.choiceButtons()[0].listeners.click();
  assert.equal(h.requests.length, 1);
  assert.match(h.elements['#result'].innerHTML, /class="gloss"[^>]*>without</);
  const reopened = h.context.openSavedWord(h.savedState.savedWords[0]);
  assert.equal(h.requests[1].url, choices[1].url);
  h.respond(1);
  await reopened;
  assert.match(h.elements['#result'].innerHTML, /without, but for/);
});

test('dictionary fetches allow verified Woerter redirects and reject arbitrary destinations', async () => {
  const h = harness();
  await tick();
  const controller = new AbortController();
  const pending = h.context.fetchPage('https://www.verbformen.com/?w=ohne', controller);
  h.requests[0].resolve({ ok: true, text: async () => 'definition', url: 'https://www.woerter.net/conjunctions/ohne.htm' });
  assert.equal((await pending).sourceUrl, 'https://www.woerter.net/conjunctions/ohne.htm');
  await assert.rejects(h.context.fetchPage('https://www.woerter.net/account', controller), /Unexpected dictionary address/);
  assert.equal(h.requests.length, 1);
  const redirected = h.context.fetchPage('https://www.woerter.net/prepositions/ohne.htm', controller);
  h.requests[1].resolve({ ok: true, url: 'https://evil.example/', text: async () => '' });
  await assert.rejects(redirected, /Unexpected dictionary redirect/);
});

test('different inline senses of one word stay selectable instead of collapsing by URL', async () => {
  const h = harness();
  await tick();
  const url = 'https://www.verbformen.com/?w=doch&l=11';
  const entryChoices = ['however', 'nevertheless'].map(meaning => ({ lemma: 'doch', label: 'conjunction · doch', partOfSpeech: 'conjunction', url,
    data: germanEntry('doch', { meaning, article: '', title: 'German conjunction doch', partOfSpeech: 'conjunction', sourceUrl: url }) }));
  h.context.renderGermanEntry({ ...entryChoices[0].data, entryChoices });
  assert.equal(h.choiceButtons().length, 2);
  assert.match(h.elements['#result'].innerHTML, /conjunction · however/);
  assert.match(h.elements['#result'].innerHTML, /conjunction · nevertheless/);
  h.choiceButtons()[1].listeners.click();
  assert.equal(h.choiceButtons()[1].getAttribute('aria-pressed'), 'true');
  assert.match(h.elements['#result'].innerHTML, /class="gloss"[^>]*>nevertheless/);
  assert.equal(h.requests.length, 0);
});

test('manual English searches never fall back to translating their input as German', async () => {
  for (const serviceError of [false, true]) {
    let calls = 0;
    const h = harness({}, {}, async () => null, async () => { calls++; return { meaning: 'wrong direction' }; });
    await tick();
    h.context.setMode('en-de');
    h.context.parseEnglishResults = () => [];
    const pending = h.context.runLookup('unknownword');
    if (serviceError) h.requests[0].resolve({ ok: false, status: 503, url: h.requests[0].url });
    else {
      h.respond(0);
      await tick();
      h.respond(1);
    }
    await pending;
    assert.equal(calls, 0);
    assert.doesNotMatch(h.elements['#result'].innerHTML, /wrong direction|id="save-word"/);
    assert.match(h.elements['#mode-toggle'].getAttribute('aria-label'), /^English to German/);
  }
});

test('a failed word-type tab keeps the current dictionary result and never invokes basic translation', async () => {
  let calls = 0;
  const h = harness({}, {}, async () => null, async () => { calls++; return { meaning: 'unrelated translation' }; });
  await tick();
  const entryChoices = kleinWordTypes();
  h.context.renderGermanEntry(germanEntry('klein', { title: 'German adjective klein', partOfSpeech: 'adjective', meaning: 'small', entryChoices, sourceUrl: entryChoices[0].url }));
  h.context.parseVerbformen = () => { throw new Error('Entry unavailable'); };
  h.choiceButtons()[1].listeners.click();
  h.respond(0);
  await tick();
  assert.equal(calls, 0);
  assert.match(h.elements['#result'].innerHTML, /class="gloss"[^>]*>small/);
  assert.match(h.elements['#result'].innerHTML, /Could not load this entry/);
});

test('Verbformen connection errors can use the basic fallback, while unavailable services show no fabricated result', async () => {
  const h = harness({}, {}, async () => null, async () => ({ meaning: 'French fries', meaningSource: { provider: 'MyMemory', url: 'https://mymemory.translated.net/' } }));
  await tick();
  h.context.lookupGermanEntry = async () => { throw new Error('Verbformen returned HTTP 503'); };
  await h.context.runLookup('Pommes');
  assert.match(h.elements['#result'].innerHTML, /French fries/);
  const missing = harness();
  await tick();
  missing.context.lookupGermanEntry = async () => null;
  await missing.context.runLookup('unknownword');
  assert.match(missing.elements['#result'].innerHTML, /No dictionary entry or translation found/);
  assert.doesNotMatch(missing.elements['#result'].innerHTML, /id="save-word"/);
});

test('a fresh missing word reaches the real translation adapter and can be saved with attribution', async () => {
  const translationCalls = [], dictionaryCalls = [];
  const translate = fallbackRuntime().createBasicTranslationFallback({ fetchImpl: async (url, options) => {
    translationCalls.push({ url, options });
    return { ok: true, url, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'repurposing' } }) };
  } });
  const h = harness({}, {}, undefined, translate);
  await tick();
  h.context.fetch = async url => { dictionaryCalls.push(url); return { ok: true, url, text: async () => '' }; };
  h.context.parseVerbformen = () => ({ title: 'All German words', lemma: '', meaning: '', inflectionTables: [] });
  await h.context.runLookup('Zweckentfremdung');
  assert.ok(dictionaryCalls.length > 1 && dictionaryCalls.length <= 9);
  assert.equal(translationCalls.length, 1);
  assert.equal(new URL(translationCalls[0].url).searchParams.get('q'), 'Zweckentfremdung');
  assert.match(h.elements['#result'].innerHTML, /repurposing/);
  assert.match(h.elements['#result'].innerHTML, /MyMemory/);
  assert.match(h.elements['#result'].innerHTML, /data-speak="Zweckentfremdung"/);
  assert.doesNotMatch(h.elements['#result'].innerHTML, /<table|class="grammar"/);
  await h.context.saveCurrentWord();
  assert.equal(h.savedState.savedWords[0].meaning, 'repurposing');
  assert.equal(h.savedState.savedWords[0].meaningSource.provider, 'MyMemory');
});

test('a dictionary deadline still permits the real basic fallback using a fresh cancellable signal', async () => {
  let deadline, translationSignal;
  const translate = fallbackRuntime().createBasicTranslationFallback({ fetchImpl: async (url, options) => {
    translationSignal = options.signal;
    return { ok: true, url, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'fear of missed opportunities' } }) };
  } });
  const h = harness({}, {}, undefined, translate);
  await tick();
  h.context.setTimeout = (callback, delay) => delay === 15000 ? (deadline = callback, 0) : setTimeout(callback, delay);
  h.context.fetch = (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  const pending = h.context.runLookup('Torschlusspanik');
  await tick();
  deadline();
  await pending;
  assert.match(h.elements['#result'].innerHTML, /fear of missed opportunities/);
  assert.equal(translationSignal.aborted, false);
});

test('a fallback started after a dictionary timeout still cancels on a mode switch', async () => {
  let deadline, reply, signal;
  const translate = fallbackRuntime().createBasicTranslationFallback({ fetchImpl: (url, options) => {
    signal = options.signal;
    return new Promise(resolve => { reply = () => resolve({ ok: true, url, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'disproportionality' } }) }); });
  } });
  const h = harness({}, {}, undefined, translate);
  await tick();
  h.context.setTimeout = (callback, delay) => delay === 15000 ? (deadline = callback, 0) : setTimeout(callback, delay);
  h.context.fetch = (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  const pending = h.context.runLookup('Unverhältnismäßigkeit');
  await tick();
  deadline();
  await tick();
  assert.equal(typeof reply, 'function');
  h.elements['#mode-toggle'].listeners.click();
  reply();
  await pending;
  assert.equal(signal.aborted, true);
  assert.doesNotMatch(h.elements['#result'].innerHTML, /disproportionality/);
});

test('the real meaning adapter fills a new verified noun without replacing its grammar or using basic translation', async () => {
  const calls = [];
  const find = fallbackRuntime().createEnglishMeaningFallback({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, url, json: async () => ({ parse: { title: 'Unwägbarkeit', revid: 456, text: 'controlled German noun section' } }) };
  }, parsePage: () => ({ meaning: 'uncertainty; imponderability', related: [] }) });
  const h = harness({}, {}, find, async () => assert.fail('Verified grammar should use the meaning adapter'));
  await tick();
  const rows = [['Nom.', 'die', 'Unwägbarkeit'], ['Gen.', 'der', 'Unwägbarkeit'], ['Dat.', 'der', 'Unwägbarkeit'], ['Acc.', 'die', 'Unwägbarkeit']];
  h.context.parseVerbformen = (_, word, sourceUrl) => germanEntry('Unwägbarkeit', { word, sourceUrl, title: 'German noun Unwägbarkeit', meaning: '', inflectionTables: [{ title: 'Singular', rows, cells: rows.map(row => row.map(() => ({ header: false, rowSpan: 1, colSpan: 1 }))) }] });
  const pending = h.context.runLookup('Unwägbarkeit');
  h.respond(0);
  await pending;
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).searchParams.get('page'), 'Unwägbarkeit');
  assert.match(h.elements['#result'].innerHTML, /uncertainty; imponderability/);
  assert.match(h.elements['#result'].innerHTML, /Nom\./);
  assert.match(h.elements['#result'].innerHTML, /Wiktionary/);
  assert.match(h.elements['#result'].innerHTML, /CC BY-SA 4\.0/);
  await h.context.saveCurrentWord();
  assert.equal(h.savedState.savedWords[0].meaningSource.revisionId, 456);
});

test('a late basic translation cannot replace another word or survive a direction switch', async () => {
  let finish, signal;
  const h = harness({}, {}, async () => null, (word, pendingSignal) => { signal = pendingSignal; return new Promise(resolve => { finish = resolve; }); });
  await tick();
  h.context.lookupGermanEntry = async () => null;
  const old = h.context.runLookup('Pommes');
  await tick();
  assert.match(h.elements['#result'].innerHTML, /Finding a translation/);
  h.context.lookupGermanEntry = async () => ({ data: germanEntry('Haus'), sourceUrl: 'https://www.verbformen.com/declension/nouns/Haus.htm' });
  await h.context.runLookup('Haus');
  finish({ meaning: 'French fries' });
  await old;
  assert.equal(signal.aborted, true);
  assert.doesNotMatch(h.elements['#result'].innerHTML, /French fries/);
  h.context.lookupGermanEntry = async () => null;
  const pending = h.context.runLookup('Pommes');
  await tick();
  h.elements['#mode-toggle'].listeners.click();
  finish({ meaning: 'French fries' });
  await pending;
  assert.doesNotMatch(h.elements['#result'].innerHTML, /French fries/);
});

test('automatic lookup uses the basic fallback only after German and English dictionary matching fail', async () => {
  let calls = 0;
  const h = harness({}, {}, async () => null, async () => { calls++; return { meaning: 'French fries' }; });
  await tick();
  h.context.lookupGermanEntry = async () => null;
  h.context.parseEnglishResults = () => [];
  const pending = h.context.runLookup('Pommes', null, { automatic: true, hint: 'de' });
  await tick();
  h.respond(0);
  await tick();
  h.respond(1);
  await pending;
  assert.equal(calls, 1);
  assert.match(h.elements['#result'].innerHTML, /French fries/);
  assert.match(h.elements['#mode-toggle'].getAttribute('aria-label'), /^German to English/);
});

test('basic translation output is escaped before rendering', async () => {
  const h = harness({}, {}, async () => null, async () => ({ meaning: '<img src=x onerror=alert(1)>' }));
  await tick();
  h.context.lookupGermanEntry = async () => null;
  await h.context.runLookup('Pommes');
  assert.match(h.elements['#result'].innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(h.elements['#result'].innerHTML, /<img/);
});

test('browser restart restores the saved word and mode without replaying a lookup', async () => {
  const h = harness({ lookupMode: 'en-de', lookupWord: 'small', lookupAuto: true, lookupHint: 'en' });
  await tick();
  assert.equal(h.elements['#word'].value, 'small');
  assert.match(h.elements['#mode-toggle'].getAttribute('aria-label'), /^English to German/);
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
    i18n: browserI18n(),
    runtime: { onInstalled: { addListener: fn => installed.push(fn) }, onStartup: { addListener() {} }, onMessage: { addListener() {} } },
    contextMenus: { removeAll: fn => fn(), create: menu => menus.push(menu), onClicked: { addListener: fn => clicked.push(fn) } },
    storage: {
      local: { set: async value => saved.push(value) },
      session: { set: async value => session.push(value) },
    },
    scripting: { executeScript: async options => { assert.equal(options.target.tabId, 7); return [{ result: 'en' }]; } },
    action: { openPopup: async () => { opened++; } },
  } });
  context.importScripts = file => vm.runInContext(fs.readFileSync(file, 'utf8'), context);
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
  assert.match(h.elements['#mode-toggle'].getAttribute('aria-label'), /^English to German/);
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
  assert.match(h.elements['#mode-toggle'].getAttribute('aria-label'), /^German to English/);
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

const germanEntry = (lemma, extra = {}) => ({ word: lemma, lemma, meaning: 'English meaning', partOfSpeech: 'noun', article: 'die', ipa: [], audio: [], inflectionTables: [], ...extra });

test('empty saved lists load and reopen without a background message receiver', async () => {
  for (const state of [{}, { savedWords: [] }]) {
    const h = harness(state, {}, undefined, undefined, {}, async () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    });
    await tick();
    for (let visit = 0; visit < 2; visit++) {
      h.elements['#saved-tab'].listeners.click();
      await tick();
      assert.match(h.elements['#saved-list'].innerHTML, /No saved words yet/);
      assert.equal(h.elements['#saved-count'].textContent, '0/100');
      assert.equal(h.elements['#saved-status'].textContent, '');
      h.elements['#lookup-tab'].listeners.click();
    }
    assert.equal(h.savedMessages.length, 0);
    assert.equal(h.requests.length, 0);
    assert.equal(h.saved.length, 0);
  }
});

test('saved words remain readable when the background receiver is unavailable', async () => {
  const h = harness({ savedWords: [germanEntry('Bruder', { article: 'der' })] }, {}, undefined, undefined, {}, async () => {
    throw new Error('Could not establish connection. Receiving end does not exist.');
  });
  await tick();
  h.elements['#saved-tab'].listeners.click();
  await tick();
  assert.match(h.elements['#saved-list'].innerHTML, /der Bruder/);
  assert.equal(h.elements['#saved-count'].textContent, '1/100');
  assert.equal(h.savedMessages.length, 0);
  await h.deleteButtons()[0].listeners.click();
  assert.equal(h.savedState.savedWords.length, 1);
  assert.match(h.elements['#saved-list'].innerHTML, /der Bruder/);
  assert.match(h.elements['#saved-status'].textContent, /Reload Currywurst/);
  assert.doesNotMatch(h.elements['#saved-status'].textContent, /Receiving end/);
  assert.equal(h.savedMessages.length, 1);
});

test('saving without a background receiver reports recovery and never writes from the popup', async () => {
  for (const reply of [async () => { throw new Error('Could not establish connection. Receiving end does not exist.'); }, async () => undefined]) {
    const h = harness({}, {}, undefined, undefined, {}, reply);
    await tick();
    h.context.renderGermanEntry(germanEntry('Haus'));
    await h.context.saveCurrentWord();
    assert.match(h.elements['#save-status'].textContent, /Reload Currywurst/);
    assert.equal(h.elements['#save-word'].textContent, 'Save');
    assert.equal(h.savedState.savedWords, undefined);
    assert.equal(h.savedMessages.length, 1);
  }
});

test('saved-list read failures appear once and do not claim the list is empty', async () => {
  const state = {};
  Object.defineProperty(state, 'savedWords', { enumerable: true, get() { throw new Error('Storage unavailable'); } });
  const h = harness(state);
  await tick();
  h.elements['#saved-tab'].listeners.click();
  await tick();
  assert.equal(h.elements['#saved-status'].textContent, 'Storage unavailable');
  assert.doesNotMatch(h.elements['#saved-list'].innerHTML, /Storage unavailable|No saved words yet|Loading saved words/);
});

test('save stores the lemma and English meaning once, with an offline list after reopening', async () => {
  const state = {};
  const h = harness(state);
  await tick();
  h.context.renderGermanEntry(germanEntry('machen', { word: 'machst', meaning: 'make, do', partOfSpeech: 'verb', article: '' }));
  await h.elements['#save-word'].listeners.click();
  assert.equal(state.savedWords.length, 1);
  assert.equal(state.savedWords[0].lemma, 'machen');
  assert.equal(state.savedWords[0].meaning, 'make, do');
  assert.equal(h.elements['#save-word'].textContent, 'Saved');
  assert.equal(h.elements['#save-word'].disabled, true);
  await h.context.saveCurrentWord();
  assert.equal(state.savedWords.length, 1);
  assert.equal(h.elements['#saved-count'].textContent, '1/100');
  const reopened = harness(state);
  await tick();
  reopened.elements['#saved-tab'].listeners.click();
  await tick();
  assert.match(reopened.elements['#saved-list'].innerHTML, /machen/);
  assert.match(reopened.elements['#saved-list'].innerHTML, /make, do/);
  assert.equal(reopened.requests.length, 0);
});

test('saved rows return to German lookup and preserve the saved noun gender route', async () => {
  const h = harness();
  await tick();
  const url = 'https://www.verbformen.com/declension/nouns/Vokabel_neut.htm';
  h.context.renderGermanEntry(germanEntry('Vokabel', { article: 'das', sourceUrl: url }));
  await h.context.saveCurrentWord();
  h.context.setMode('en-de');
  h.elements['#saved-tab'].listeners.click();
  await tick();
  assert.equal(h.elements['#lookup-view'].hidden, true);
  assert.match(h.elements['#saved-list'].innerHTML, /das Vokabel/);
  const lookup = h.savedWordButtons()[0].listeners.click();
  assert.equal(h.elements['#saved-view'].hidden, true);
  assert.equal(h.elements['#lookup-view'].hidden, false);
  assert.equal(h.elements['#word'].value, 'Vokabel');
  assert.match(h.elements['#mode-toggle'].getAttribute('aria-label'), /^German to English/);
  assert.equal(h.requests[0].url, url);
  h.respond(0);
  await lookup;
  assert.match(h.elements['#result'].innerHTML, /Vokabel/);
  assert.equal(h.savedState.lookupWord, 'Vokabel');
  assert.equal(h.savedState.lookupMode, 'de-en');
});

test('deletion and Undo persist before updating the count', async () => {
  const h = harness();
  await tick();
  h.context.renderGermanEntry(germanEntry('Bruder', { article: 'der' }));
  await h.context.saveCurrentWord();
  h.elements['#saved-tab'].listeners.click();
  await tick();
  await h.deleteButtons()[0].listeners.click();
  assert.equal(h.savedState.savedWords.length, 0);
  assert.equal(h.elements['#saved-count'].textContent, '0/100');
  assert.match(h.elements['#saved-list'].innerHTML, /No saved words yet/);
  assert.equal(h.elements['#undo-delete'].hidden, false);
  await h.elements['#undo-delete'].listeners.click();
  assert.equal(h.savedState.savedWords.length, 1);
  assert.equal(h.elements['#saved-count'].textContent, '1/100');
  assert.equal(h.elements['#undo-delete'].hidden, true);
  assert.equal(h.elements['#save-word'].textContent, 'Saved');
});

test('opening Saved cancels lookups and audio without allowing late results to replace it', async () => {
  const h = harness();
  await tick();
  let paused = false;
  h.context.testAudio = { pause: () => { paused = true; } };
  const lookup = h.context.runLookup('pending');
  vm.runInContext('activeAudio = testAudio', h.context);
  h.elements['#saved-tab'].listeners.click();
  await tick();
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.equal(paused, true);
  const list = h.elements['#saved-list'].innerHTML;
  h.respond(0);
  await lookup;
  assert.equal(h.elements['#saved-view'].hidden, false);
  assert.equal(h.elements['#saved-list'].innerHTML, list);
  h.elements['#lookup-tab'].listeners.click();
  assert.doesNotMatch(h.elements['#result'].innerHTML, /class="loading"/);
  assert.equal(h.requests.length, 1);
});

test('full lists disable new saves while keeping existing saved entries marked', async () => {
  const h = harness({ savedWords: Array.from({ length: 100 }, (_, i) => ({ lemma: `Wort${i}`, meaning: 'word', article: 'die', partOfSpeech: 'noun', savedAt: i })) });
  await tick();
  h.context.renderGermanEntry(germanEntry('New'));
  assert.equal(h.elements['#save-word'].disabled, true);
  assert.match(h.elements['#save-status'].textContent, /List full/);
  h.context.renderGermanEntry(germanEntry('Wort1'));
  assert.equal(h.elements['#save-word'].textContent, 'Saved');
  assert.equal(h.elements['#saved-count'].textContent, '100/100');
});

test('save and delete errors do not claim success or remove words', async () => {
  const h = harness();
  await tick();
  h.context.renderGermanEntry(germanEntry('Bruder'));
  const send = h.context.chrome.runtime.sendMessage;
  h.context.chrome.runtime.sendMessage = async () => ({ ok: false, error: 'Storage unavailable' });
  await h.context.saveCurrentWord();
  assert.equal(h.elements['#save-word'].textContent, 'Save');
  assert.match(h.elements['#save-status'].textContent, /Storage unavailable/);
  assert.equal(h.savedState.savedWords, undefined);
  h.context.chrome.runtime.sendMessage = send;
  await h.context.saveCurrentWord();
  h.elements['#saved-tab'].listeners.click();
  await tick();
  h.context.chrome.runtime.sendMessage = async () => ({ ok: false, error: 'Storage unavailable' });
  await h.deleteButtons()[0].listeners.click();
  assert.equal(h.savedState.savedWords.length, 1);
  assert.match(h.elements['#saved-list'].innerHTML, /Bruder/);
  assert.match(h.elements['#saved-status'].textContent, /Storage unavailable/);
});

test('saved meanings are escaped and unsafe source links fall back to a normal lookup', async () => {
  const h = harness();
  await tick();
  h.context.renderGermanEntry(germanEntry('Haus', { meaning: '<img src=x onerror=alert(1)>', sourceUrl: 'https://evil.example/' }));
  await h.context.saveCurrentWord();
  h.elements['#saved-tab'].listeners.click();
  await tick();
  assert.doesNotMatch(h.elements['#saved-list'].innerHTML, /<img/);
  assert.match(h.elements['#saved-list'].innerHTML, /&lt;img/);
  const lookup = h.savedWordButtons()[0].listeners.click();
  assert.equal(new URL(h.requests[0].url).origin, 'https://www.verbformen.com');
  assert.equal(new URL(h.requests[0].url).searchParams.get('w'), 'Haus');
  h.respond(0);
  await lookup;
});

test('an unreadable saved list shows an error and can be loaded again from Saved', async () => {
  let unavailable = true;
  const state = {};
  Object.defineProperty(state, 'savedWords', { enumerable: true, get() {
    if (unavailable) throw new Error('Storage unavailable');
    return [];
  } });
  const h = harness(state);
  await tick();
  h.context.renderGermanEntry(germanEntry('Haus'));
  assert.equal(h.elements['#save-word'].disabled, true);
  assert.match(h.elements['#save-status'].textContent, /Storage unavailable/);
  unavailable = false;
  h.elements['#saved-tab'].listeners.click();
  await tick();
  assert.match(h.elements['#saved-list'].innerHTML, /No saved words yet/);
  assert.equal(h.elements['#save-word'].disabled, false);
  assert.equal(h.elements['#save-status'].textContent, '');
});

test('entries without an English meaning cannot be saved', async () => {
  const h = harness();
  await tick();
  h.context.renderGermanEntry(germanEntry('Haus', { meaning: '' }));
  assert.equal(h.elements['#result'].querySelector('#save-word'), null);
});

const fallbackMeaning = { meaning: 'learner; student', meaningSource: { provider: 'Wiktionary', url: 'https://en.wiktionary.org/w/index.php?title=Lernender&oldid=123', revisionId: 123, license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' } };
const learnerEntry = () => {
  const rows = [['Nom.', 'der', 'Lernende'], ['Gen.', 'des', 'Lernenden'], ['Dat.', 'dem', 'Lernenden'], ['Acc.', 'den', 'Lernenden']];
  return germanEntry('Lernende', { meaning: '', article: 'der', sourceUrl: 'https://www.verbformen.com/declension/nouns/Lernende.htm', inflectionTables: [{ title: 'Singular', rows, cells: rows.map(row => row.map(() => ({ header: false, colSpan: 1, rowSpan: 1 }))) }] });
};

test('missing English meanings load after the grammar and retain attribution when saved', async () => {
  let finish;
  const h = harness({}, {}, () => new Promise(resolve => { finish = resolve; }));
  await tick();
  h.context.renderGermanEntry(learnerEntry());
  assert.match(h.elements['#result'].innerHTML, /Finding English meaning/);
  assert.match(h.elements['#result'].innerHTML, /Nom\./);
  assert.equal(h.elements['#result'].querySelector('#save-word'), null);
  finish(fallbackMeaning);
  await tick();
  assert.match(h.elements['#result'].innerHTML, /learner; student/);
  assert.match(h.elements['#result'].innerHTML, /Meaning from/);
  assert.match(h.elements['#result'].innerHTML, /CC BY-SA 4\.0/);
  await h.context.saveCurrentWord();
  assert.equal(h.savedState.savedWords[0].meaningSource.revisionId, 123);
  h.elements['#saved-tab'].listeners.click();
  await tick();
  assert.match(h.elements['#saved-list'].innerHTML, /Meaning from/);
});

test('failed or cancelled meaning fallback keeps the grammar and cannot replace a newer view', async () => {
  const failed = harness({}, {}, async () => null);
  await tick();
  failed.context.renderGermanEntry(learnerEntry());
  await tick();
  assert.match(failed.elements['#result'].innerHTML, /English meaning unavailable/);
  assert.match(failed.elements['#result'].innerHTML, /Nom\./);
  let finish, signal;
  const h = harness({}, {}, (_, requestSignal) => { signal = requestSignal; return new Promise(resolve => { finish = resolve; }); });
  await tick();
  h.context.renderGermanEntry(learnerEntry());
  h.elements['#saved-tab'].listeners.click();
  await tick();
  assert.equal(signal.aborted, true);
  const list = h.elements['#saved-list'].innerHTML;
  finish(fallbackMeaning);
  await tick();
  assert.equal(h.elements['#saved-list'].innerHTML, list);
  assert.doesNotMatch(h.elements['#result'].innerHTML, /learner; student/);
});

test('comparison degree buttons load only the chosen source page and save the positive form', async () => {
  const h = harness();
  await tick();
  const comparisons = ['positive', 'comparative', 'superlative'].map((degree, index) => ({ degree, label: degree, form: ['ausgesprochen', 'ausgesprochener', 'ausgesprochensten'][index], url: `https://www.verbformen.com/declension/adjectives/${['ausgesprochen', 'ausgesprochener', 'ausgesprochensten'][index]}.htm` }));
  const data = germanEntry('ausgesprochen', { title: 'German adjective ausgesprochen', article: '', partOfSpeech: 'adjective', meaning: 'pronounced', comparisonVariants: comparisons, sourceUrl: comparisons[0].url });
  h.context.renderGermanEntry(data);
  assert.equal(h.requests.length, 0);
  assert.equal(h.degreeButtons().length, 3);
  h.context.parseVerbformen = (html, word, sourceUrl) => ({ ...data, word, sourceUrl });
  h.degreeButtons()[1].listeners.click();
  assert.match(h.elements['#result'].innerHTML, /Loading comparative forms/);
  assert.equal(h.requests[0].url, comparisons[1].url);
  h.respond(0);
  await tick();
  assert.equal(h.degreeButtons()[1].getAttribute('aria-pressed'), 'true');
  await h.context.saveCurrentWord();
  assert.equal(h.savedState.savedWords[0].lemma, 'ausgesprochen');
  assert.equal(h.savedState.savedWords[0].sourceUrl, comparisons[0].url);
});

function kleinWordTypes() {
  return [
    { label: 'adjective · klein', lemma: 'klein', partOfSpeech: 'adjective', url: 'https://www.verbformen.com/declension/adjectives/klein.htm' },
    { label: 'noun · das Klein', lemma: 'Klein', partOfSpeech: 'noun', url: 'https://www.verbformen.com/declension/nouns/Klein.htm' },
  ];
}

test('klein and das Klein keep independent meanings, grammar, saved types, and cached tabs', async () => {
  const h = harness();
  await tick();
  const entryChoices = kleinWordTypes();
  h.context.renderGermanEntry(germanEntry('klein', { word: 'kleinen', title: 'German adjective klein', partOfSpeech: 'adjective', article: '', meaning: 'small', sourceUrl: entryChoices[0].url, entryChoices }));
  h.context.parseVerbformen = (_, word, sourceUrl) => germanEntry('Klein', { word, sourceUrl, title: 'German noun Klein', partOfSpeech: 'noun', article: 'das', meaning: 'giblets', inflectionTables: [{ title: 'Singular', rows: [['Nom.', 'das', 'Klein']], cells: [[{ header: false, colSpan: 1, rowSpan: 1 }, { header: false, colSpan: 1, rowSpan: 1 }, { header: false, colSpan: 1, rowSpan: 1 }]] }] });
  h.choiceButtons()[1].listeners.click();
  assert.match(h.elements['#result'].innerHTML, /Loading noun entry/);
  assert.equal(h.requests[0].url, entryChoices[1].url);
  h.respond(0);
  await tick();
  assert.match(h.elements['#result'].innerHTML, /giblets/);
  assert.match(h.elements['#result'].innerHTML, /Singular/);
  assert.doesNotMatch(h.elements['#result'].innerHTML, /class="gloss"[^>]*>small/);
  assert.equal(h.choiceButtons()[1].getAttribute('aria-pressed'), 'true');
  await h.context.saveCurrentWord();
  assert.equal(h.savedState.savedWords[0].lemma, 'Klein');
  assert.equal(h.savedState.savedWords[0].partOfSpeech, 'noun');
  h.choiceButtons()[0].listeners.click();
  assert.equal(h.requests.length, 1);
  assert.match(h.elements['#result'].innerHTML, /class="gloss"[^>]*>small/);
  assert.equal(h.choiceButtons()[0].getAttribute('aria-pressed'), 'true');
  h.choiceButtons()[1].listeners.click();
  assert.equal(h.requests.length, 1);
  assert.match(h.elements['#result'].innerHTML, /giblets/);
});

test('a type switch rejects a redirect to the same spelling with the wrong word type', async () => {
  const h = harness();
  await tick();
  const entryChoices = kleinWordTypes();
  const adjective = germanEntry('klein', { title: 'German adjective klein', partOfSpeech: 'adjective', article: '', meaning: 'small', sourceUrl: entryChoices[0].url, entryChoices });
  h.context.renderGermanEntry(adjective);
  h.context.parseVerbformen = () => adjective;
  h.choiceButtons()[1].listeners.click();
  h.respond(0);
  await tick();
  assert.match(h.elements['#result'].innerHTML, /Could not load this entry/);
  assert.match(h.elements['#result'].innerHTML, /class="gloss"[^>]*>small/);
  h.choiceButtons()[1].listeners.click();
  assert.equal(h.requests.length, 2);
  h.respond(1);
  await tick();
});

test('a comparative page keeps its adjective type button selected', async () => {
  const h = harness();
  await tick();
  h.context.renderGermanEntry(germanEntry('klein', { word: 'kleiner', title: 'German adjective kleiner', partOfSpeech: 'adjective', sourceUrl: 'https://www.verbformen.com/declension/adjectives/kleiner.htm', entryChoices: kleinWordTypes() }));
  assert.equal(h.choiceButtons()[0].getAttribute('aria-pressed'), 'true');
  assert.equal(h.choiceButtons()[1].getAttribute('aria-pressed'), 'false');
});

test('switching klein degrees repeatedly keeps one adjective button and one noun button', async () => {
  const h = harness();
  await tick();
  const entryChoices = kleinWordTypes();
  const comparisonVariants = ['klein', 'kleiner', 'kleinsten'].map((form, index) => ({ form, degree: ['positive', 'comparative', 'superlative'][index], label: ['Positive', 'Comparative', 'Superlative'][index], url: `https://www.verbformen.com/declension/adjectives/${form}.htm` }));
  const adjective = extra => germanEntry('klein', { title: 'German adjective klein', partOfSpeech: 'adjective', meaning: 'small', sourceUrl: entryChoices[0].url, entryChoices, comparisonVariants, ...extra });
  h.context.renderGermanEntry(adjective());
  h.context.parseVerbformen = (_, word, sourceUrl) => adjective({ word, sourceUrl, entryChoices: [{ ...entryChoices[0], url: sourceUrl }] });
  for (const degree of [1, 2]) {
    h.degreeButtons()[degree].listeners.click();
    h.respond(degree - 1);
    await tick();
    assert.equal(h.choiceButtons().length, 2);
    assert.equal(h.choiceButtons()[0].getAttribute('aria-pressed'), 'true');
    assert.equal(h.degreeButtons()[degree].getAttribute('aria-pressed'), 'true');
  }
  for (const degree of [1, 0, 2, 0]) {
    h.degreeButtons()[degree].listeners.click();
    assert.equal(h.choiceButtons().length, 2);
    assert.equal(h.degreeButtons()[degree].getAttribute('aria-pressed'), 'true');
  }
  assert.equal(h.requests.length, 2);
});

test('switching noun gender retains links to other word types', async () => {
  const h = harness();
  await tick();
  const variants = [
    { article: 'der', lemma: 'Laut', label: 'der Laut', url: 'https://www.verbformen.com/declension/nouns/Laut.htm' },
    { article: 'das', lemma: 'Laut', label: 'das Laut', url: 'https://www.verbformen.com/declension/nouns/Laut_neut.htm' },
  ];
  // Controlled variants test that the navigation survives a gender response
  // without repeating its cross-type links; they do not assert dictionary usage.
  const entryChoices = [
    { lemma: 'Laut', partOfSpeech: 'noun', label: 'noun · Laut', url: variants[0].url },
    { lemma: 'laut', partOfSpeech: 'adjective', label: 'adjective · laut', url: 'https://www.verbformen.com/declension/adjectives/laut.htm' },
  ];
  h.context.renderGermanEntry(germanEntry('Laut', { article: 'der', sourceUrl: variants[0].url, variants, entryChoices }));
  h.context.parseVerbformen = (_, word, sourceUrl) => germanEntry('Laut', { word, sourceUrl, article: 'das', variants });
  h.variantButton.listeners.click();
  h.respond(0);
  await tick();
  assert.match(h.elements['#result'].innerHTML, /Dictionary entries/);
  assert.match(h.elements['#result'].innerHTML, /adjective · laut/);
});

test('word-type choices can open an attested verb use without leaking adjective degrees', async () => {
  const h = harness();
  await tick();
  const choices = [
    { label: 'adjective · ausgesprochen', lemma: 'ausgesprochen', partOfSpeech: 'adjective', url: 'https://www.verbformen.com/declension/adjectives/ausgesprochen.htm' },
    { label: 'verb · aussprechen', lemma: 'aussprechen', partOfSpeech: 'verb', url: 'https://www.verbformen.com/conjugation/aussprechen.htm' },
  ];
  h.context.renderGermanEntry(germanEntry('ausgesprochen', { title: 'German adjective ausgesprochen', article: '', partOfSpeech: 'adjective', entryChoices: choices, sourceUrl: choices[0].url }));
  h.context.parseVerbformen = (html, word, sourceUrl) => germanEntry('aussprechen', { word, sourceUrl, title: 'German verb aussprechen', partOfSpeech: 'verb', article: '', inflectionTables: [{ title: 'Participle II', rows: [['ausgesprochen']], cells: [[{ header: false, colSpan: 1, rowSpan: 1 }]] }] });
  h.choiceButtons()[1].listeners.click();
  assert.equal(h.requests[0].url, choices[1].url);
  h.respond(0);
  await tick();
  assert.match(h.elements['#result'].innerHTML, /aussprechen/);
  assert.doesNotMatch(h.elements['#result'].innerHTML, /Adjective degree/);
  h.choiceButtons()[0].listeners.click();
  assert.equal(h.requests.length, 1);
  assert.match(h.elements['#result'].innerHTML, /adjective/);
  h.choiceButtons()[1].listeners.click();
  assert.equal(h.requests.length, 1);
  assert.match(h.elements['#result'].innerHTML, /aussprechen/);
});

test('gender tabs reuse both the initial query result and fetched alternate without another request', async () => {
  const h = harness();
  await tick();
  const variants = [
    { lemma: 'Vokabel', article: 'die', label: 'die Vokabel', url: 'https://www.verbformen.com/declension/nouns/Vokabel.htm' },
    { lemma: 'Vokabel', article: 'das', label: 'das Vokabel', url: 'https://www.verbformen.com/declension/nouns/Vokabel_neut.htm' },
  ];
  const data = germanEntry('Vokabel', { word: 'Vokabeln', variants, sourceUrl: 'https://www.verbformen.com/?w=Vokabeln&l=11' });
  h.context.renderGermanEntry(data);
  h.context.parseVerbformen = (html, word, sourceUrl) => ({ ...data, word, sourceUrl, article: 'das', meaning: 'alternate meaning' });
  h.nounButtons()[1].listeners.click();
  h.respond(0);
  await tick();
  assert.match(h.elements['#result'].innerHTML, /alternate meaning/);
  h.nounButtons()[0].listeners.click();
  assert.equal(h.requests.length, 1);
  assert.equal(h.nounButtons()[0].getAttribute('aria-pressed'), 'true');
  assert.doesNotMatch(h.elements['#result'].innerHTML, /alternate meaning|class="loading"/);
  h.nounButtons()[1].listeners.click();
  assert.equal(h.requests.length, 1);
  assert.match(h.elements['#result'].innerHTML, /alternate meaning/);
  assert.match(h.elements['#result'].innerHTML, /data-speak="Vokabeln"/);
});

function comparisonEntry() {
  const comparisonVariants = ['positive', 'comparative', 'superlative'].map((degree, index) => ({ degree, label: degree, form: ['ausgesprochen', 'ausgesprochener', 'ausgesprochensten'][index], url: `https://www.verbformen.com/declension/adjectives/${['ausgesprochen', 'ausgesprochener', 'ausgesprochensten'][index]}.htm` }));
  return germanEntry('ausgesprochen', { title: 'German adjective ausgesprochen', partOfSpeech: 'adjective', article: '', comparisonVariants, sourceUrl: comparisonVariants[0].url });
}

test('comparison tabs cache each degree and a new word flushes previous tab results', async () => {
  const h = harness();
  await tick();
  const data = comparisonEntry();
  h.context.renderGermanEntry(data);
  h.context.parseVerbformen = (html, word, sourceUrl) => word === 'klein'
    ? germanEntry('klein', { title: 'German adjective klein', partOfSpeech: 'adjective', article: '', sourceUrl })
    : { ...data, word, sourceUrl: sourceUrl.includes('/?') ? data.sourceUrl : sourceUrl };
  h.degreeButtons()[1].listeners.click();
  h.respond(0);
  await tick();
  h.degreeButtons()[0].listeners.click();
  assert.equal(h.requests.length, 1);
  assert.equal(h.degreeButtons()[0].getAttribute('aria-pressed'), 'true');
  h.degreeButtons()[1].listeners.click();
  assert.equal(h.requests.length, 1);
  h.degreeButtons()[2].listeners.click();
  assert.equal(h.requests.length, 2);
  h.respond(1);
  await tick();
  h.degreeButtons()[1].listeners.click();
  h.degreeButtons()[2].listeners.click();
  assert.equal(h.requests.length, 2);
  assert.doesNotMatch(h.elements['#result'].innerHTML, /class="loading"/);
  const different = h.context.runLookup('klein');
  h.respond(2);
  await different;
  const returnToWord = h.context.runLookup('ausgesprochen');
  h.respond(3);
  await returnToWord;
  h.degreeButtons()[1].listeners.click();
  assert.equal(h.requests.length, 5);
  assert.match(h.elements['#result'].innerHTML, /Loading comparative/);
  h.respond(4);
  await tick();
});

test('a late cancelled tab cannot repopulate the cache after a new lookup', async () => {
  const h = harness();
  await tick();
  const data = comparisonEntry();
  h.context.renderGermanEntry(data);
  h.context.parseVerbformen = (html, word, sourceUrl) => word === 'klein'
    ? germanEntry('klein', { title: 'German adjective klein', partOfSpeech: 'adjective', article: '', sourceUrl })
    : { ...data, word, sourceUrl: sourceUrl.includes('/?') ? data.sourceUrl : sourceUrl };
  h.degreeButtons()[1].listeners.click();
  const different = h.context.runLookup('klein');
  h.respond(1);
  await different;
  h.respond(0);
  await tick();
  assert.match(h.elements['#result'].innerHTML, /klein/);
  const returnToWord = h.context.runLookup('ausgesprochen');
  h.respond(2);
  await returnToWord;
  h.degreeButtons()[1].listeners.click();
  assert.equal(h.requests.length, 4);
  h.respond(3);
  await tick();
});

test('failed tab loads are not cached and can be retried', async () => {
  const h = harness();
  await tick();
  const data = comparisonEntry();
  h.context.renderGermanEntry(data);
  h.degreeButtons()[1].listeners.click();
  h.requests[0].resolve({ ok: false, status: 503, url: h.requests[0].url });
  await tick();
  assert.match(h.elements['#result'].innerHTML, /Could not load this entry/);
  h.context.parseVerbformen = (html, word, sourceUrl) => ({ ...data, word, sourceUrl });
  h.degreeButtons()[1].listeners.click();
  assert.equal(h.requests.length, 2);
  h.respond(1);
  await tick();
  assert.equal(h.degreeButtons()[1].getAttribute('aria-pressed'), 'true');
});

test('table forms break between alternatives while article columns stay compact', async () => {
  const h = harness();
  await tick();
  const form = 'ausgesprocheneren/ausgesprochneren⁴';
  const rows = [['Nom.', 'die', form], ['Gen.', 'der', form], ['Dat.', 'den', form], ['Acc.', 'die', form]];
  const table = { title: 'Plural', rows, cells: rows.map(row => row.map(() => ({ header: false, colSpan: 1, rowSpan: 1 }))) };
  const html = h.context.renderInflections([table], 'adjective');
  assert.match(html, /ausgesprocheneren\/<wbr>ausgesprochneren⁴/);
  assert.match(html, /class="article-column"/);
  assert.match(html, /table lang="de"/);
  assert.equal(table.rows[0][2], form);
  assert.doesNotMatch(h.context.renderInflections([table], 'verb'), /class="article-column"/);
});

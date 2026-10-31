const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const parser = vm.createContext({ URL });
vm.runInContext(fs.readFileSync('parser.js', 'utf8'), parser);
const empty = { title: 'All German words', lemma: 'Abend', meaning: 'evening', inflectionTables: [] };
const book = { title: 'Conjugation of German verb buchstabieren', lemma: 'buchstabieren', partOfSpeech: 'verb', meaning: 'spell', inflectionTables: [{ title: 'Present', group: 'Imperative', rows: [['buchstabiere', '(du)']] }] };

function harness(respond) {
  const calls = [];
  const context = vm.createContext({
    URL,
    dictionaryEntryUrl: parser.dictionaryEntryUrl,
    isGermanEntryMatch: parser.isGermanEntryMatch,
    parseVerbformen: html => html.entry || empty,
    parseGermanSearchEntries: (html, word) => (html.cards || []).filter(card => parser.isGermanEntryMatch(card.data, word)),
  });
  vm.runInContext(fs.readFileSync('lookup.js', 'utf8'), context);
  const load = async (address) => {
    const url = new URL(address);
    calls.push(url);
    const response = await respond(url);
    return { html: response?.html || { entry: empty }, sourceUrl: response?.sourceUrl || address };
  };
  return { context, calls, load, signal: new AbortController().signal };
}

test('buchstabier accepts the documented singular imperative on its first response', async () => {
  const h = harness(() => ({ html: { entry: book } }));
  const result = await h.context.lookupGermanEntry('buchstabier', h.load, h.signal);
  assert.equal(result.data.lemma, 'buchstabieren');
  assert.equal(result.data.word, 'buchstabier');
  assert.equal(h.calls.length, 1);
});

test('a failed stem search recovers the infinitive but validates against the selection', async () => {
  const h = harness(url => url.searchParams.get('w') === 'buchstabieren' ? { html: { entry: book } } : {});
  const result = await h.context.lookupGermanEntry('buchstabier', h.load, h.signal);
  assert.equal(result.data.lemma, 'buchstabieren');
  assert.equal(result.data.word, 'buchstabier');
  assert.equal(h.calls.length, 4);
  assert.equal(h.calls[1].pathname, '/conjugation/');
  assert.equal(h.calls[2].pathname, '/search/');
  assert.equal(h.calls[3].searchParams.get('w'), 'buchstabieren');
  assert.ok(h.calls.every(url => url.searchParams.get('l') === '11'));
});

test('a partial tense or voice route opens the complete entry', async () => {
  const h = harness(url => url.pathname === '/' ? {
    html: { entry: book }, sourceUrl: 'https://www.verbformen.com/conjugation/imperativ/fragesatz/buchstabieren.htm',
  } : { html: { entry: book } });
  const result = await h.context.lookupGermanEntry('buchstabier', h.load, h.signal);
  assert.equal(h.calls[1].pathname, '/conjugation/buchstabieren.htm');
  assert.equal(result.data.lemma, 'buchstabieren');
});

test('search-only adverbs, conjunctions, and particles can return inline entries', async () => {
  for (const [word, type, meaning] of [['heute','adverb','today'], ['und','conjunction','and'], ['nicht','particle','not'], ['mit','preposition','with']]) {
    const data = { title: `German ${type} ${word}`, lemma: word, meaning, partOfSpeech: type, inflectionTables: [] };
    const h = harness(url => url.pathname === '/search/' ? { html: { cards: [{ data, detailUrl: null }] } } : {});
    const result = await h.context.lookupGermanEntry(word, h.load, h.signal);
    assert.equal(result.data.lemma, word);
    assert.equal(result.data.partOfSpeech, type);
    assert.equal(h.calls.length, 3);
  }
});

test('inflected nouns, adjectives, articles, and pronouns retain their entry types', async () => {
  for (const [query, lemma, type] of [['Häusern','Haus','noun'], ['kleineren','klein','adjective'], ['einem','ein','article'], ['meiner','ich','pronoun']]) {
    const data = { title: `German ${type} ${lemma}`, lemma, meaning: 'example', partOfSpeech: type, inflectionTables: [{ title: 'Dative', rows: [['Dat.',query]] }] };
    const h = harness(() => ({ html: { entry: data } }));
    const result = await h.context.lookupGermanEntry(query, h.load, h.signal);
    assert.equal(result.data.lemma, lemma);
    assert.equal(result.data.word, query);
    assert.equal(h.calls.length, 1);
  }
});

test('unverified guesses and irrelevant homepage entries never become matches', async () => {
  const h = harness(url => url.searchParams.get('w') === 'xyzword' ? {} : { html: { entry: { ...book, lemma: url.searchParams.get('w') } } });
  // A guessed lemma match alone must not verify the original unknown selection.
  const result = await h.context.lookupGermanEntry('xyzword', h.load, h.signal);
  assert.equal(result, null);
  assert.ok(h.calls.length <= 6);
});

test('404 routes are skipped, while an aborted lookup sends no requests', async () => {
  const h = harness(url => {
    if (url.pathname === '/') throw Object.assign(new Error('not found'), { status: 404 });
    return { html: { entry: book } };
  });
  assert.equal((await h.context.lookupGermanEntry('buchstabier', h.load, h.signal)).data.lemma, 'buchstabieren');
  const controller = new AbortController();
  controller.abort();
  const count = h.calls.length;
  await assert.rejects(h.context.lookupGermanEntry('buchstabier', h.load, controller.signal));
  assert.equal(h.calls.length, count);
});

test('matching noun cards preserve alternate genders without fetching them eagerly', async () => {
  const feminine = { title: 'German noun Vokabel', lemma: 'Vokabel', partOfSpeech: 'noun', article: 'die', meaning: 'word', headwordForms: ['Vokabel','Vokabeln'], inflectionTables: [] };
  const neuter = { ...feminine, article: 'das', meaning: 'word, vocabulary' };
  const primary = 'https://www.verbformen.com/declension/nouns/Vokabel.htm';
  const alternate = 'https://www.verbformen.com/declension/nouns/Vokabel_neut.htm';
  const h = harness(url => url.pathname === '/' ? { html: { cards: [
    { data: feminine, detailUrl: primary, label: 'die Vokabel' },
    { data: neuter, detailUrl: alternate, label: 'das Vokabel' },
  ] } } : { html: { entry: feminine } });
  const result = await h.context.lookupGermanEntry('Vokabeln', h.load, h.signal);
  assert.equal(result.data.variants.length, 2);
  assert.equal(result.data.variants[0].article, 'die');
  assert.equal(result.data.variants[1].article, 'das');
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every(url => !url.pathname.endsWith('Vokabel_neut.htm')));
});

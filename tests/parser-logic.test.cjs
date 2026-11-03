const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const parser = vm.createContext({ URL, Node: { DOCUMENT_POSITION_FOLLOWING: 4 } });
vm.runInContext(fs.readFileSync('parser.js', 'utf8'), parser);
const plain = value => JSON.parse(JSON.stringify(value));

test('related German suggestions require the original query, a related headword, and a dictionary link', () => {
  const card = (lemma, url = `https://www.verbformen.com/declension/nouns/${lemma}.htm`) => ({
    lemma, label: `die ${lemma}`, partOfSpeech: 'noun', meaning: 'example', detailUrl: url,
    data: { title: `German noun ${lemma}`, lemma, meaning: 'example', inflectionTables: [] },
  });
  const cards = [card('Pommesbude'), card('Pommesbude'), card('Pommesgabel'), card('Abend'), card('Pommes'),
    card('Pommessalz', 'https://evil.example/declension/nouns/Pommessalz.htm'),
    card('Pommespreis', 'https://www.verbformen.com/declension/nouns/Pommespreis.pdf')];
  const found = parser.germanSearchSuggestionEntries(cards, 'Pommes', 'https://www.verbformen.com/?w=Pommes&l=11');
  assert.deepEqual(plain(found).map(entry => entry.lemma), ['Pommesbude', 'Pommesgabel']);
  for (const url of ['https://www.verbformen.com/', 'https://www.verbformen.com/?w=Pomme',
    'https://www.verbformen.com/declension/nouns/Pommesbude.htm?w=Pommes',
    'https://evil.example/?w=Pommes', 'https://www.verbformen.com/en-de/?w=Pommes']) {
    assert.equal(parser.germanSearchSuggestionEntries(cards, 'Pommes', url).length, 0);
  }
  assert.equal(parser.isGermanEntryMatch(cards[0].data, 'Pommes'), false);
});

test('German suggestions are bounded and do not interpret short fragments as words', () => {
  const entries = Array.from({ length: 20 }, (_, i) => ({ lemma: `Haus${String.fromCharCode(97 + i)}`,
    detailUrl: `https://www.verbformen.com/declension/nouns/Haus${i}.htm`, data: { inflectionTables: [] } }));
  assert.equal(parser.germanSearchSuggestionEntries(entries, 'Haus', 'https://www.verbformen.com/search/?w=Haus').length, 8);
  assert.equal(parser.germanSearchSuggestionEntries(entries, 'Ha', 'https://www.verbformen.com/search/?w=Ha').length, 0);
});

test('verb metadata keeps auxiliary and separability without accepting prose', () => {
  assert.deepEqual(plain(parser.parseGrammarSummary('A1 · irregular · haben · separable', 'Conjugation of German verb aufrufen')), {
    level: 'A1', partOfSpeech: 'verb', grammarTags: ['irregular', 'haben', 'separable'],
  });
  assert.deepEqual(plain(parser.parseGrammarSummary('The auf · rufen conjugation is shown online as a verb table.', 'Conjugation of German verb aufrufen')).grammarTags, []);
});

test('separable verb spelling is normalized to the complete lemma', () => {
  assert.equal(parser.extractLemma('Conjugation of German verb auf · rufen', 'aufgerufen'), 'aufrufen');
  assert.equal(parser.extractLemma('Conjugation of German verb auf\nrufen', 'aufgerufen'), 'aufrufen');
  assert.equal(parser.extractLemma('Declension of German noun Bruder with plural and article', 'Brüdern'), 'Bruder');
});

test('heading hierarchy retains the mood and replaces sibling tense headings', () => {
  const target = {};
  const heading = (level, text) => ({ tagName: `H${level}`, textContent: text, compareDocumentPosition: () => 4 });
  const headings = [heading(2, 'Indicative'), heading(3, 'Present'), heading(3, 'Imperfect')];
  assert.deepEqual(plain(parser.headingPathFor(target, headings)), ['Indicative', 'Imperfect']);
  headings.push(heading(2, 'Subjunctive'), heading(3, 'Present Subj.'));
  assert.deepEqual(plain(parser.headingPathFor(target, headings)), ['Subjunctive', 'Present Subj.']);
});

test('deduplication keeps identical forms in different moods and drops overview copies', () => {
  const rows = [['ich', 'machte'], ['du', 'machtest']];
  const tables = [
    { title: 'Imperfect', group: '', rows },
    { title: 'Imperfect', group: 'Indicative', rows },
    { title: 'Imperf. Subj.', group: 'Subjunctive', rows },
    { title: 'Imperfect', group: 'Indicative', rows },
  ];
  const result = parser.deduplicateInflections(tables);
  assert.equal(result.length, 2);
  assert.equal(result[0].group, 'Indicative');
  assert.equal(result[1].group, 'Subjunctive');
});


test('shortened imperatives are accepted only from singular imperative evidence', () => {
  const entry = { title: 'Conjugation of German verb buchstabieren', lemma: 'buchstabieren', partOfSpeech: 'verb', meaning: 'spell', inflectionTables: [{ title: 'Present', group: 'Imperative', rows: [['buchstabiere', '(du)']] }] };
  assert.equal(parser.isGermanEntryMatch(entry, 'buchstabier'), true);
  assert.equal(parser.isGermanEntryMatch({ ...entry, inflectionTables: [{ title: 'Present', rows: [['ich', 'buchstabiere']] }] }, 'buchstabier'), false);
  for (const [lemma, form, invalid] of [['arbeiten','arbeite','arbeit'], ['reden','rede','red'], ['atmen','atme','atm']]) {
    assert.equal(parser.isGermanEntryMatch({ ...entry, lemma, inflectionTables: [{ title: 'Imperative', rows: [[form, '(du)']] }] }, invalid), false);
  }
});

test('optional letters, alternate spellings, and footnotes match source forms', () => {
  assert.deepEqual(plain(parser.expandGermanForms('buchstabier(e)⁵')), ['buchstabier', 'buchstabiere']);
  assert.deepEqual(plain(parser.expandGermanForms('aß(es)t')), ['aßt', 'aßest']);
  assert.deepEqual(plain(parser.expandGermanForms('des/der')), ['des', 'der']);
  const noun = { title: 'Declension of German noun Haus', lemma: 'Haus', meaning: 'house', inflectionTables: [{ title: 'Singular', rows: [['Gen.', 'des', 'Haus(e)s⁰']] }] };
  assert.equal(parser.isGermanEntryMatch(noun, 'Hauses'), true);
  assert.equal(parser.isGermanEntryMatch(noun, 'Hausen'), false);
});

test('separable verbs can match subordinate-clause joined forms', () => {
  const entry = { title: 'Conjugation of German verb aufrufen', lemma: 'aufrufen', partOfSpeech: 'verb', meaning: 'call up', inflectionTables: [{ title: 'Present', rows: [['du','rufst','auf']] }] };
  assert.equal(parser.isGermanEntryMatch(entry, 'aufrufst'), true);
  assert.equal(parser.isGermanEntryMatch(entry, 'rufst auf'), true);
});

test('all word classes in the official search selector are recognized', () => {
  for (const type of ['verb','noun','adjective','adverb','article','pronoun','preposition','conjunction','particle']) {
    const metadata = parser.parseGrammarSummary(`A1 · ${type}`, '');
    assert.equal(metadata.partOfSpeech, type);
    assert.equal(parser.isGermanEntryMatch({ title: `German ${type} Beispiel`, lemma: 'Beispiel', meaning: 'example', inflectionTables: [] }, 'Beispiel'), true);
  }
  assert.equal(parser.extractLemma('Imperative of German verb buchstabieren ⟨Interrogative⟩','buchstabier'), 'buchstabieren');
});

test('nested dictionary routes are accepted while exports and foreign hosts are rejected', () => {
  for (const path of ['conjugation/indikativ/praesens/buchstabieren.htm', 'conjugation/vpassiv/nebensatz/aufrufen.htm', 'declension/articles/ein.htm', 'declension/pronouns/einer.htm', 'declension/adjectives/klein.htm']) {
    assert.equal(parser.dictionaryEntryUrl('/'+path,'https://www.verbformen.com/'), 'https://www.verbformen.com/'+path);
  }
  for (const path of ['conjugation/worksheets-exercises/suchsel/buchstabieren.htm','conjugation/aufrufen.pdf','search/','https://evil.example/conjugation/machen.htm']) {
    assert.equal(parser.dictionaryEntryUrl(path,'https://www.verbformen.com/'), null);
  }
});

test('irregular comparative and superlative forms can match an adjective entry', () => {
  const entry = { title: 'Declension German adjective gut', lemma: 'gut', partOfSpeech: 'adjective', meaning: 'good', principalParts: 'gut · besser · am besten', inflectionTables: [] };
  assert.equal(parser.isGermanEntryMatch(entry, 'besser'), true);
  assert.equal(parser.isGermanEntryMatch(entry, 'besten'), true);
  assert.equal(parser.isGermanEntryMatch(entry, 'böse'), false);
});

test('noun gender links match the exact lemma and preserve both articles', () => {
  assert.equal(parser.nounVariantArticle('feminine, -, -en- Vokabel, die', 'Vokabel'), 'die');
  assert.equal(parser.nounVariantArticle('neutral, -s, - Vokabel⁹, das', 'Vokabel'), 'das');
  assert.equal(parser.nounVariantArticle('das Vokabel', 'Vokabel'), 'das');
  assert.equal(parser.nounVariantArticle('Vokabelheft, das', 'Vokabel'), '');
  assert.equal(parser.nounArticleFromTags(['neutral', 'regular']), 'das');
  assert.equal(parser.nounArticleFromTags(['feminine']), 'die');
  assert.equal(parser.extractLemma('Declension of German noun das Vokabel with plural and article', 'Vokabeln'), 'Vokabel');
});

test('explicit noun header forms can verify a plural on a search card', () => {
  const entry = { title: 'German noun Vokabel', lemma: 'Vokabel', meaning: 'word', headwordForms: ['Vokabel','Vokabeln'], inflectionTables: [] };
  assert.equal(parser.isGermanEntryMatch(entry, 'Vokabeln'), true);
  assert.equal(parser.isGermanEntryMatch(entry, 'Vokabelheft'), false);
});

test('explicit noun introduction verifies a plural when the compact header is unavailable', () => {
  const forms = parser.extractStatedNounForms('The most important forms of "Vokabel" are: genitive singular "Vokabel" and nominative plural "Vokabeln".');
  assert.deepEqual(plain(forms), ['Vokabel','Vokabeln']);
  const entry = { title: 'German noun Vokabel', lemma: 'Vokabel', meaning: 'word', headwordForms: forms, inflectionTables: [] };
  assert.equal(parser.isGermanEntryMatch(entry, 'Vokabeln'), true);
  assert.deepEqual(plain(parser.extractStatedNounForms('An example sentence contains Vokabeln.')), []);
});

test('regular and irregular annotations do not become part of a headword', () => {
  assert.equal(parser.extractLemma('Conjugation of German verb verwenden (regelm)', 'verwendete'), 'verwenden');
  assert.equal(parser.cleanHeadword('verwenden <irr.>'), 'verwenden');
});

test('comparison choices are source-linked, normalized, and exclude foreign links', () => {
  const links = [
    ['positive ausgesprochen', '/declension/adjectives/ausgesprochen.htm'],
    ['comparative ausgesprochen er', '/declension/adjectives/ausgesprochener.htm'],
    ['superlative am ausgesprochen st en', '/declension/adjectives/ausgesprochensten.htm'],
    ['positive unwanted', 'https://evil.example/declension/adjectives/unwanted.htm'],
  ].map(([textContent, href]) => ({ textContent, getAttribute: () => href }));
  const variants = parser.extractComparisonVariants({ querySelectorAll: () => links }, 'https://www.verbformen.com/');
  assert.deepEqual(plain(variants.map(variant => variant.form)), ['ausgesprochen', 'ausgesprochener', 'ausgesprochensten']);
  assert.equal(parser.isGermanEntryMatch({ title: 'German adjective ausgesprochen', lemma: 'ausgesprochen', meaning: 'pronounced', comparisonVariants: variants }, 'ausgesprochener'), true);
});

test('dictionary-page type links retain klein and das Klein without navigation or degree links', () => {
  const links = [
    ['noun Klein, das', '/declension/nouns/Klein.htm'],
    ['noun Klein, das', '/declension/nouns/Klein.htm'],
    ['positive klein', '/declension/adjectives/klein.htm'],
    ['comparative kleiner', '/declension/adjectives/kleiner.htm'],
    ['Nouns', '/declension/nouns/'],
    ['noun Klein', 'https://evil.example/declension/nouns/Klein.htm'],
    ['noun falsch', '/declension/adjectives/falsch.htm'],
    ['noun Klein', '/declension/nouns/Klein.pdf'],
    ['noun click here!', '/declension/nouns/Klein.htm'],
  ].map(([textContent, href]) => ({ textContent, getAttribute: () => href }));
  const found = plain(parser.extractWordTypeVariants({ querySelectorAll: () => links }, 'klein', 'adjective', 'https://www.verbformen.com/declension/adjectives/klein.htm'));
  assert.deepEqual(found.map(entry => [entry.lemma, entry.partOfSpeech]), [['klein', 'adjective'], ['Klein', 'noun']]);
  assert.equal(found[1].label, 'noun · das Klein');
});

test('query pages use a source-linked current entry so users can return from another type', () => {
  const links = [['adjective klein', '/declension/adjectives/klein.htm'], ['neutral Klein, das', '/declension/nouns/Klein.htm']]
    .map(([textContent, href]) => ({ textContent, getAttribute: () => href }));
  const found = parser.extractWordTypeVariants({ querySelectorAll: () => links }, 'Klein', 'noun', 'https://www.verbformen.com/?w=Klein', 'https://www.verbformen.com/declension/nouns/Klein.htm');
  assert.deepEqual(plain(found).map(entry => entry.partOfSpeech), ['noun', 'adjective']);
  assert.ok(found.every(entry => entry.url.endsWith('.htm')));
});

test('word-type links normalize split verb names and keep the current URL in its own type', () => {
  const links = [['verb auf · rufen', '/conjugation/aufrufen.htm'], ['klein', '/declension/adjectives/klein.htm']]
    .map(([textContent, href]) => ({ textContent, getAttribute: () => href }));
  const found = parser.extractWordTypeVariants({ querySelectorAll: () => links }, 'klein', 'adjective', 'https://www.verbformen.com/declension/nouns/Klein.htm');
  assert.equal(found[0].partOfSpeech, 'adjective');
  assert.equal(found[0].url, 'https://www.verbformen.com/declension/adjectives/klein.htm');
  assert.equal(found[1].lemma, 'aufrufen');
});

test('a trusted lexical link can establish identity without an English meaning', () => {
  const entry = { title: 'German noun Lernende', lemma: 'Lernende', meaning: '', inflectionTables: [] };
  assert.equal(parser.isGermanEntryMatch(entry, 'Lernende'), false);
  assert.equal(parser.isGermanEntryMatch({ ...entry, sourceUrl: 'https://www.verbformen.com/declension/nouns/Lernende.htm' }, 'Lernende'), true);
  assert.equal(parser.isGermanEntryMatch({ ...entry, sourceUrl: 'https://evil.example/declension/nouns/Lernende.htm' }, 'Lernende'), false);
});

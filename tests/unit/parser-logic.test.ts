import { dictionaryRuntime } from '../helpers/runtime';
import { test } from 'vitest';
import assert from 'node:assert/strict';
const parser = dictionaryRuntime();
const plain = value => JSON.parse(JSON.stringify(value));

function summaryNode(textContent, children = []) {
  return { textContent, contains(node) { return node === this || children.some(child => child.contains(node)); } };
}

test('search summaries count nested metadata once and retain the full CEFR summary', () => {
  const firstSmall = summaryNode('preposition · accusative');
  const first = summaryNode('A1 · preposition · accusative', [firstSmall]);
  const secondSmall = summaryNode('A1 · conjunction · subordinating');
  const second = summaryNode('A1 · conjunction · subordinating', [secondSmall]);
  const summaries = parser.searchCardSummaries({ querySelectorAll: () => [first, firstSmall, second, secondSmall] });
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0], first);
  assert.equal(summaries[1], second);
});

test('flat search candidates are partitioned by metadata boundaries in inert templates', () => {
  const first = summaryNode('A1 · preposition · accusative');
  const second = summaryNode('A1 · conjunction · subordinating');
  const combined = summaryNode('A1 · preposition · accusative ohne without A1 · conjunction · subordinating ohne without, but for', [first, second]);
  const doc = { querySelectorAll: () => [combined, first, second], childNodes: [combined] };
  const ranges = [];
  parser.document = {
    createRange() {
      const state = {};
      ranges.push(state);
      return { setStartBefore(node) { state.start = node; }, setEndBefore(node) { state.end = node; }, setEnd(node, offset) { state.root = node; state.offset = offset; }, cloneContents() { return state; }, detach() {} };
    },
    createElement(tag) {
      assert.equal(tag, 'template');
      return { content: { firstElementChild: { appendChild(fragment) { this.fragment = fragment; } } } };
    },
  };
  try {
    const sections = parser.searchCardSections(doc);
    assert.equal(sections.length, 2);
    assert.equal(ranges[0].start, first);
    assert.equal(ranges[0].end, second);
    assert.equal(ranges[1].start, second);
    assert.equal(ranges[1].root, doc);
    assert.equal(sections[0].card.fragment, ranges[0]);
  } finally { delete parser.document; }
});

test('verified inline entries keep different word types despite sharing a query URL', () => {
  const url = 'https://www.verbformen.com/?w=ohne&l=11';
  const choice = partOfSpeech => ({ lemma: 'ohne', partOfSpeech, url, data: { title: `German ${partOfSpeech} ohne`, lemma: 'ohne', partOfSpeech, meaning: 'without', sourceUrl: url, inflectionTables: [] } });
  const preposition = choice('preposition'), conjunction = choice('conjunction');
  const bad = { ...conjunction, data: { ...conjunction.data, sourceUrl: 'https://evil.example/' } };
  const wrong = { ...conjunction, lemma: 'Haus' };
  const merged = parser.mergeEntryChoices([preposition, conjunction, { ...preposition }, bad, wrong]);
  assert.equal(merged.length, 2);
  assert.notEqual(parser.entryChoiceKey(preposition), parser.entryChoiceKey(conjunction));
});

test('English results retain matching inline types even when their gloss and query URL are identical', () => {
  const html = '<p>A1 · preposition</p><p>ohne</p><p lang="en">without</p><p>A1 · conjunction</p><p>ohne</p><p lang="en">without</p>';
  const results = parser.parseEnglishResults(html, 'without', 'https://www.verbformen.com/en-de/?w=without');
  assert.equal(results.length, 2);
  assert.deepEqual(results.map(entry => entry.partOfSpeech), ['preposition', 'conjunction']);
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

test('Woerter entry URLs support non-inflected word types and reject unrelated pages or hosts', () => {
  for (const [path, type] of [['conjunctions/ohne.htm', 'conjunction'], ['prepositions/ohne.htm', 'preposition'], ['adverbs/heute.htm', 'adverb'], ['particles/nicht.htm', 'particle']]) {
    const url = `https://www.woerter.net/${path}`;
    assert.equal(parser.dictionaryEntryUrl(url), url);
    assert.equal(parser.dictionaryRequestUrl(url), url);
    assert.equal(parser.dictionaryEntryType(url), type);
  }
  for (const url of ['https://www.woerter.net/', 'https://www.woerter.net/account', 'https://www.woerter.net/search/?w=ohne',
    'https://www.woerter.net/conjunctions/examples/ohne.htm', 'https://www.woerter.net/conjunctions/ohne.pdf',
    'https://www.woerter.net.evil.example/conjunctions/ohne.htm', 'https://user:pass@www.woerter.net/conjunctions/ohne.htm',
    'http://www.woerter.net/conjunctions/ohne.htm']) assert.equal(parser.dictionaryRequestUrl(url), null);
});

test('Woerter word-type links preserve both ohne entries from a definition page', () => {
  const links = [['preposition "ohne"', 'https://www.woerter.net/prepositions/ohne.htm'], ['conjunction "ohne"', '/conjunctions/ohne.htm']]
    .map(([textContent, href]) => ({ textContent, getAttribute: () => href }));
  const choices = parser.extractWordTypeVariants({ querySelectorAll: () => links }, 'ohne', 'conjunction', 'https://www.woerter.net/conjunctions/ohne.htm');
  assert.deepEqual(plain(choices).map(entry => entry.partOfSpeech), ['conjunction', 'preposition']);
  const duplicate = { ...choices[0], url: 'https://www.woerter.net/conjunctions/meanings/ohne.htm' };
  assert.equal(parser.mergeEntryChoices(choices, [duplicate]).length, 2);
});

test('compact candidate links without metadata resolve exact words through their Woerter URL types', () => {
  const html = '<a href="https://www.woerter.net/prepositions/ohne.htm">preposition "ohne"</a><a href="https://www.woerter.net/conjunctions/ohne.htm">conjunction "ohne"</a><a href="https://www.woerter.net/conjunctions/aber.htm">conjunction "aber"</a><a href="https://evil.example/conjunctions/ohne.htm">ohne</a>';
  const entries = parser.parseGermanSearchEntries(html, 'ohne', 'https://www.verbformen.com/conjugation/?w=ohne');
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map(entry => entry.partOfSpeech), ['preposition', 'conjunction']);
  assert.ok(entries.every(entry => entry.data.linkOnly && entry.detailUrl.startsWith('https://www.woerter.net/')));
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

test('comparison degrees share one adjective type identity while the noun remains separate', () => {
  const adjective = url => ({ lemma: 'klein', partOfSpeech: 'adjective', label: 'adjective · klein', url: `https://www.verbformen.com/declension/adjectives/${url}.htm` });
  const noun = { lemma: 'Klein', partOfSpeech: 'noun', label: 'noun · Klein', url: 'https://www.verbformen.com/declension/nouns/Klein.htm' };
  const merged = parser.mergeEntryChoices([adjective('klein'), noun], [adjective('kleiner')], [adjective('kleinsten')]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].url, adjective('klein').url);
  const current = parser.extractWordTypeVariants({ querySelectorAll: () => [] }, 'klein', 'adjective', adjective('kleiner').url, adjective('klein').url);
  assert.equal(current[0].url, adjective('klein').url);
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

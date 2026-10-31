const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const parser = vm.createContext({ URL, Node: { DOCUMENT_POSITION_FOLLOWING: 4 } });
vm.runInContext(fs.readFileSync('parser.js', 'utf8'), parser);
const plain = value => JSON.parse(JSON.stringify(value));

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

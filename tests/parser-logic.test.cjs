const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const parser = vm.createContext({ Node: { DOCUMENT_POSITION_FOLLOWING: 4 } });
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

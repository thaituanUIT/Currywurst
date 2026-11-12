import { describe, expect, test } from 'vitest';
import { analyzeGermanVerbPhrase } from '../../src/dictionary/verb-structure';
import { isGermanEntryMatch, parseVerbformen } from '../../src/dictionary/parser';
import { createGermanLookup } from '../../src/dictionary/lookup';
import type { DictionaryEntry, InflectionTable } from '../../src/shared/dictionary-types';

function verb(lemma: string, rows: string[][], extra: Partial<DictionaryEntry> = {}): DictionaryEntry {
  const table: InflectionTable = { title: 'Present', rows, cells: rows.map(row => row.map(() => ({ header: false, colSpan: 1, rowSpan: 1 }))) };
  return { word: lemma, lemma, title: `Conjugation of German verb ${lemma}`, meaning: 'meaning', partOfSpeech: 'verb', sourceUrl: `https://www.verbformen.com/conjugation/${lemma.replace(/^sich /, '')}.htm`, ipa: [], audio: [], inflectionTables: [table], ...extra };
}

const freuen = verb('freuen', [['ich', 'freue'], ['du', 'freust'], ['er', 'freut'], ['wir', 'freuen']], { reflexiveCases: ['accusative'], principalParts: 'freut · freute · hat gefreut' });
const aufstehen = verb('aufstehen', [['ich', 'stehe', 'auf'], ['du', 'stehst', 'auf'], ['er', 'steht', 'auf']], { grammarTags: ['separable'], principalParts: 'steht auf · stand auf · ist aufgestanden' });
const anziehen = verb('anziehen', [['ich', 'ziehe', 'an'], ['du', 'ziehst', 'an'], ['er', 'zieht', 'an']], { grammarTags: ['separable'], reflexiveCases: ['accusative', 'dative'], principalParts: 'zieht an · zog an · hat angezogen' });

describe('bounded phrase analysis', () => {
  test.each([
    ['sich freuen', { verb: 'freuen', pronoun: 'sich' }],
    ['ich freue mich', { verb: 'freue', pronoun: 'mich', subject: 'ich' }],
    ['er steht früh auf', { verb: 'steht', particle: 'auf', subject: 'er' }],
    ['zieht sich an', { verb: 'zieht', pronoun: 'sich', particle: 'an' }],
    ['sich anzuziehen', { verb: 'anzuziehen', pronoun: 'sich' }],
    ['Wir haben uns gefreut.', { verb: 'gefreut', pronoun: 'uns', subject: 'wir', auxiliary: 'haben' }],
    ['  ICH\u00a0FREUE mich! ', { verb: 'freue', pronoun: 'mich', subject: 'ich' }],
  ])('recognizes %s', (query, expected) => expect(analyzeGermanVerbPhrase(query)).toMatchObject(expected));

  test.each(['die Jacke', 'steht auf und geht weg', 'steht, auf', 'sich', 'auf', 'freue mich dich', 'ich kann mich freuen', 'x '.repeat(100), '<b>zieht sich an</b>'])('does not invent a verb structure for %s', query => expect(analyzeGermanVerbPhrase(query)).toBeNull());
});

describe('source verification', () => {
  test.each(['sich freuen', 'freue mich', 'ich freue mich', 'du freust dich', 'er freut sich', 'sie freut sich', 'es freut sich', 'wir freuen uns', 'ich habe mich gefreut', 'sich zu freuen'])('matches reflexive phrase %s', query => expect(isGermanEntryMatch(freuen, query)).toBe(true));
  test.each(['ich freue sich', 'du freust mich', 'er freut dich', 'freut mich', 'ich freust mich', 'ich freuen mich', 'ich freue mir', 'bin mich gefreut', 'ich hat mich gefreut'])('rejects reflexive/person/case mismatch %s', query => expect(isGermanEntryMatch(freuen, query)).toBe(false));
  test('does not infer reflexivity from an ordinary object or translated prose', () => {
    const ordinary = verb('lieben', [['ich', 'liebe']], { excerpt: 'A paragraph mentions sich and reflexive verbs.' });
    expect(isGermanEntryMatch(ordinary, 'liebe mich')).toBe(false);
  });
  test.each(['steht auf', 'er steht früh auf', 'ich stehe auf', 'aufsteht', 'aufgestanden'])('matches separable form %s', query => expect(isGermanEntryMatch(aufstehen, query)).toBe(true));
  test.each(['steht', 'auf', 'steht an', 'auf steht', 'steht auf auf', 'er stehst auf'])('keeps prefix and verb evidence for %s', query => expect(isGermanEntryMatch(aufstehen, query)).toBe(false));
  test.each(['zieht sich an', 'er zieht sich an', 'du ziehst dich an', 'ich ziehe mir an', 'hat sich angezogen'])('combines reflexive and separable evidence for %s', query => expect(isGermanEntryMatch(anziehen, query)).toBe(true));
  test.each(['zieht sich aus', 'zieht mich an', 'ich ziehe sich an'])('rejects the wrong combined structure %s', query => expect(isGermanEntryMatch(anziehen, query)).toBe(false));
  test('a prefix spelling alone does not prove that an ambiguous verb separates', () => {
    const inseparable = verb('übersetzen', [['er', 'übersetzt']], { grammarTags: ['inseparable'] });
    expect(isGermanEntryMatch(inseparable, 'setzt über')).toBe(false);
  });
  test('only a source-listed du imperative permits dropping optional final e', () => {
    const imperative = verb('sich freuen', [['freue', '(du)', 'dich']]);
    imperative.inflectionTables[0].group = 'Imperative';
    expect(isGermanEntryMatch(imperative, 'freu dich')).toBe(true);
    expect(isGermanEntryMatch({ ...imperative, inflectionTables: [{ ...imperative.inflectionTables[0], group: 'Indicative' }] }, 'freu dich')).toBe(false);
    const mandatory = verb('sich melden', [['melde', '(du)', 'dich']]);
    mandatory.inflectionTables[0].group = 'Imperative';
    expect(isGermanEntryMatch(mandatory, 'meld dich')).toBe(false);
  });
  test('header cells cannot attest a reflexive or separable phrase', () => {
    const entry = verb('freuen', [['ich', 'freue', 'mich']]);
    entry.inflectionTables[0].cells[0].forEach(cell => { cell.header = true; });
    expect(isGermanEntryMatch(entry, 'freue mich')).toBe(false);
  });
  test('bare forms of an explicitly reflexive entry are verified without matching labels or pronouns', () => {
    const entry = verb('sich freuen', [['ich', 'freue mich'], ['du', 'freust dich'], ['Present']]);
    for (const word of ['freuen', 'freue', 'freust']) expect(isGermanEntryMatch(entry, word)).toBe(true);
    for (const word of ['mich', 'dich', 'sich', 'ich', 'Present']) expect(isGermanEntryMatch(entry, word)).toBe(false);
  });
});

test('the HTML parser retains reflexive lemmas and reads valency markers rather than examples', () => {
  const html = '<main><h1>Conjugation of German verb sich an · ziehen</h1><p>A1 · irregular · haben · separable</p><p lang="en">get dressed</p><p><span title="with accusative of reflexive pronoun (mich)">sich+A</span>, <span title="with dative of reflexive pronoun (mir)">sich+D</span></p><h2>Present</h2><table><tr><td>ich</td><td>ziehe</td><td>mich</td><td>an</td></tr><tr><td>du</td><td>ziehst</td><td>dich</td><td>an</td></tr><tr><td>er</td><td>zieht</td><td>sich</td><td>an</td></tr></table></main>';
  const entry = parseVerbformen(html, 'zieht sich an', 'https://www.verbformen.com/conjugation/anziehen.htm');
  expect(entry.lemma).toBe('sich anziehen');
  expect(entry.reflexiveCases).toEqual(['accusative', 'dative']);
  expect(isGermanEntryMatch(entry, 'zieht sich an')).toBe(true);
  const ordinary = parseVerbformen('<h1>Conjugation of German verb lieben</h1><p lang="en">love</p><p>Example: Ich liebe mich.</p>', 'lieben', 'https://www.verbformen.com/conjugation/lieben.htm');
  expect(ordinary.reflexiveCases).toEqual([]);
  const exampleOnly = parseVerbformen('<main><h1>Conjugation of German verb lieben</h1><p lang="en">love</p><h2>Examples</h2><p><span title="with accusative of reflexive pronoun (mich)">sich+A</span></p></main>', 'lieben', 'https://www.verbformen.com/conjugation/lieben.htm');
  expect(exampleOnly.reflexiveCases).toEqual([]);
});

function lookupFixture(entry: DictionaryEntry, respondOn: (url: URL) => boolean) {
  const calls: URL[] = [];
  const empty = verb('', [], { title: 'All German words', meaning: '' });
  const lookup = createGermanLookup({ parseVerbformen: (html, word, sourceUrl) => ({ ...(html === 'entry' ? entry : empty), word, sourceUrl }), parseGermanSearchEntries: () => [] });
  const load = async (url: string) => { const address = new URL(url); calls.push(address); return { html: respondOn(address) ? 'entry' : 'empty', sourceUrl: url }; };
  return { calls, lookup, load };
}

test.each([
  ['ich freue mich', freuen, '/conjugation/freuen.htm'],
  ['er steht früh auf', aufstehen, '/conjugation/aufstehen.htm'],
  ['zieht sich an', anziehen, '/conjugation/anziehen.htm'],
])('recovers %s through bounded verb candidates', async (query, entry, path) => {
  const h = lookupFixture(entry, url => url.pathname === path);
  const found = await h.lookup(query, h.load, new AbortController().signal);
  expect(found?.data.lemma).toBe(entry.lemma);
  expect(found?.data.word).toBe(query);
  expect(h.calls.length).toBeLessThanOrEqual(9);
  expect(new Set(h.calls.map(url => url.href)).size).toBe(h.calls.length);
});

test('a guessed candidate never substitutes verification of the original phrase', async () => {
  const h = lookupFixture(anziehen, () => true);
  expect(await h.lookup('zieht sich aus', h.load, new AbortController().signal)).toBeNull();
  expect(h.calls.length).toBeLessThanOrEqual(9);
});

test('abort and the shared cache still bound phrase recovery', async () => {
  const h = lookupFixture(freuen, () => false);
  const signal = new AbortController();
  signal.abort();
  await expect(h.lookup('freue mich', h.load, signal.signal)).rejects.toThrow();
  expect(h.calls).toHaveLength(0);
  const cache = new Map();
  await h.lookup('freue mich', h.load, new AbortController().signal, { cache });
  const count = h.calls.length;
  await h.lookup('freue mich', h.load, new AbortController().signal, { cache });
  expect(h.calls).toHaveLength(count);
  await h.lookup('zieht sich an', h.load, new AbortController().signal, { cache });
  expect(h.calls.length).toBeLessThanOrEqual(9);
});

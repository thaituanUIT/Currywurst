const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Fresh audit corpus, separate from the original examples. These are controlled
// responses, not claims of live browser coverage. Source forms were checked at:
// https://www.verbformen.com/declension/nouns/Widerspruch.htm
// https://www.verbformen.com/declension/nouns/Geda3chtnis.htm
// https://www.verbformen.com/declension/nouns/Verha3ltnis.htm
// https://www.verbformen.com/conjugation/auseinandersetzen.htm
// https://www.verbformen.com/conjugation/gegensteuern.htm
// https://www.verbformen.com/declension/adjectives/unwiderstehlich.htm
// https://www.verbformen.de/konjugation/widersprechen.htm
// https://www.verbformen.de/konjugation/infinitive/beitragen.htm
// https://www.duden.de/rechtschreibung/Unabhaengigkeitserklaerung
function runtime() {
  const context = vm.createContext({ URL });
  for (const file of ['dictionary-sources.js', 'parser.js', 'lookup.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  }
  return context;
}

const parser = runtime();
const noun = (lemma, meaning, singularGenitive, plural, pluralDative) => ({
  title: `Declension of German noun ${lemma} with plural and article`,
  lemma, partOfSpeech: 'noun', meaning,
  headwordForms: [singularGenitive, plural],
  inflectionTables: [
    { title: 'Singular', rows: [['Nom.', 'das', lemma], ['Gen.', 'des', singularGenitive], ['Dat.', 'dem', lemma], ['Acc.', 'das', lemma]] },
    { title: 'Plural', rows: [['Nom.', 'die', plural], ['Gen.', 'der', plural], ['Dat.', 'den', pluralDative], ['Acc.', 'die', plural]] },
  ],
});
const contradiction = noun('Widerspruch', 'contradiction, objection', 'Widerspruches/Widerspruchs', 'Widersprüche⁰', 'Widersprüchen⁰');
contradiction.inflectionTables[0].rows = [['Nom.', 'der', 'Widerspruch'], ['Gen.', 'des', 'Widerspruches/Widerspruchs'], ['Dat.', 'dem', 'Widerspruch/Widerspruche⁶'], ['Acc.', 'den', 'Widerspruch']];
const memory = noun('Gedächtnis', 'memory, remembrance', 'Gedächtnisses', 'Gedächtnisse', 'Gedächtnissen');
const relationship = noun('Verhältnis', 'relationship, ratio', 'Verhältnisses', 'Verhältnisse', 'Verhältnissen');
const declaration = {
  ...noun('Unabhängigkeitserklärung', 'declaration of independence', 'Unabhängigkeitserklärung', 'Unabhängigkeitserklärungen', 'Unabhängigkeitserklärungen'),
  article: 'die',
  inflectionTables: [{ title: 'Plural', rows: [['Nom.', 'die', 'Unabhängigkeitserklärungen'], ['Gen.', 'der', 'Unabhängigkeitserklärungen'], ['Dat.', 'den', 'Unabhängigkeitserklärungen'], ['Acc.', 'die', 'Unabhängigkeitserklärungen']] }],
};
const verb = (lemma, meaning, principalParts, rows) => ({ title: `Conjugation of German verb ${lemma}`, lemma, partOfSpeech: 'verb', meaning, principalParts, inflectionTables: [{ title: 'Perfect', rows }] });
const discuss = verb('auseinandersetzen', 'explain, discuss', 'setzt auseinander · setzte auseinander · hat auseinandergesetzt', [['ich', 'habe', 'auseinandergesetzt'], ['du', 'hast', 'auseinandergesetzt'], ['er', 'hat', 'auseinandergesetzt']]);
const counteract = verb('gegensteuern', 'counteract', 'steuert gegen · steuerte gegen · hat gegengesteuert', [['ich', 'habe', 'gegengesteuert'], ['du', 'hast', 'gegengesteuert'], ['er', 'hat', 'gegengesteuert']]);
const irresistible = {
  title: 'Declension and comparison German adjective unwiderstehlich', lemma: 'unwiderstehlich', partOfSpeech: 'adjective', meaning: 'irresistible',
  principalParts: 'unwiderstehlich · unwiderstehlicher · am unwiderstehlichsten',
  inflectionTables: [{ title: 'Masculine', group: 'Strong declension', rows: [['Nom.', 'unwiderstehlicher'], ['Gen.', 'unwiderstehlichen'], ['Dat.', 'unwiderstehlichem'], ['Acc.', 'unwiderstehlichen']] }],
};

async function resolve(query, entry, { direct = false, attest = true } = {}) {
  const context = runtime();
  const calls = [];
  const route = entry.partOfSpeech === 'verb' ? 'conjugation' : `declension/${entry.partOfSpeech === 'adjective' ? 'adjectives' : 'nouns'}`;
  const target = `https://www.verbformen.com/${route}/${context.verbformenSlug(entry.lemma)}.htm`;
  context.parseVerbformen = (html, word, sourceUrl) => ({ ...html, word, sourceUrl });
  context.parseGermanSearchEntries = () => [];
  const found = await context.lookupGermanEntry(query, async url => {
    calls.push(url);
    const matched = (direct && calls.length === 1) || url === target;
    const data = attest ? entry : { ...entry, principalParts: '', headwordForms: [], inflectionTables: [] };
    return { sourceUrl: url, html: matched ? data : { title: 'All German words', lemma: '', meaning: '', inflectionTables: [] } };
  }, new AbortController().signal);
  assert.ok(calls.length <= 9, `${query} exceeded the request budget: ${calls.length}`);
  assert.equal(new Set(calls).size, calls.length, `${query} fetched a URL twice`);
  return { found, calls };
}

for (const [entry, queries] of [
  [contradiction, ['Widersprüche', 'Widersprüchen', 'Widerspruches']],
  [memory, ['Gedächtnisse', 'Gedächtnissen', 'Gedächtnisses']],
  [relationship, ['Verhältnisse', 'Verhältnissen', 'Verhältnisses']],
  [declaration, ['Unabhängigkeitserklärungen']],
  [discuss, ['auseinandergesetzt']],
  [counteract, ['gegengesteuert']],
  [irresistible, ['unwiderstehlichsten']],
]) {
  for (const query of queries) {
    test(`fresh difficult form ${query} recovers ${entry.lemma} after query-route misses`, async () => {
      const { found } = await resolve(query, entry);
      assert.equal(found?.data.lemma, entry.lemma);
      assert.equal(found.data.word, query);
      assert.equal(found.data.meaning, entry.meaning);
    });
  }
}

test('copied decomposed umlauts recover the original dictionary entry and preserve the selection', async () => {
  for (const [entry, word] of [[declaration, 'Unabhängigkeitserklärungen'], [memory, 'Gedächtnissen']]) {
    const query = word.normalize('NFD');
    const { found } = await resolve(query, entry);
    assert.equal(found?.data.lemma, entry.lemma);
    assert.equal(found.data.word, query);
  }
});

test('lowercase difficult plurals retain adjective fallbacks without starving noun recovery', async () => {
  for (const [entry, query] of [[contradiction, 'widersprüchen'], [memory, 'gedächtnissen'], [relationship, 'verhältnissen']]) {
    const { found } = await resolve(query, entry);
    assert.equal(found?.data.lemma, entry.lemma, query);
  }
});

test('new stem guesses never establish a match without source evidence', async () => {
  for (const [query, entry] of [['Gedächtnissen', memory], ['Widersprüchen', contradiction], ['gegengesteuert', counteract], ['unwiderstehlichsten', irresistible]]) {
    assert.equal((await resolve(query, entry, { attest: false })).found, null, query);
  }
});

test('irregular subjunctives, inserted zu, and optional letters still match directly', async () => {
  const irregular = { ...verb('widersprechen', 'contradict', 'widerspricht · widersprach · hat widersprochen', []), inflectionTables: [{ title: 'Imperf. Subj.', rows: [['du', 'widerspräch(e)st']] }] };
  const contribute = { ...verb('beitragen', 'contribute', 'trägt bei · trug bei · hat beigetragen', []), inflectionTables: [{ title: 'Infinitive', rows: [['beitragen'], ['beizutragen']] }] };
  for (const [query, entry] of [['widersprächst', irregular], ['widersprächest', irregular], ['beizutragen', contribute]]) {
    const { found, calls } = await resolve(query, entry, { direct: true });
    assert.equal(found?.data.lemma, entry.lemma);
    assert.equal(calls.length, 1);
  }
});

test('a separable verb cannot claim the unprefixed verb, its subject, or its auxiliary', () => {
  const entry = { ...discuss, inflectionTables: [
    { title: 'Present', rows: [['du', 'setzt', 'auseinander']] },
    { title: 'Imperfect', rows: [['du', 'setztest', 'auseinander']] },
    { title: 'Perfect', rows: [['du', 'hast', 'auseinandergesetzt']] },
    { title: 'Future I', rows: [['du', 'wirst', 'auseinandersetzen']] },
    { title: 'Present', group: 'Imperative', rows: [['setze', '(du)', 'auseinander']] },
  ] };
  for (const query of ['auseinandersetzt', 'setzt auseinander', 'auseinandersetztest', 'setze auseinander', 'setz auseinander', 'auseinandergesetzt']) {
    assert.equal(parser.isGermanEntryMatch(entry, query), true, query);
  }
  for (const query of ['setzt', 'setztest', 'setze', 'setz', 'auseinander', 'du', 'hast', 'wirst', 'hat']) {
    assert.equal(parser.isGermanEntryMatch(entry, query), false, query);
  }
});

test('compact entries can verify joined separable forms from principal parts alone', () => {
  const entry = { ...discuss, inflectionTables: [] };
  for (const query of ['auseinandersetzt', 'auseinandersetzte', 'setzt auseinander', 'auseinandergesetzt']) {
    assert.equal(parser.isGermanEntryMatch(entry, query), true, query);
  }
  for (const query of ['setzt', 'setzte', 'hat', 'auseinander']) assert.equal(parser.isGermanEntryMatch(entry, query), false, query);
});

test('noun articles and case labels are not mistaken for inflected difficult nouns', () => {
  for (const query of ['der', 'des', 'dem', 'den', 'die', 'Nom.', 'Dat.']) {
    assert.equal(parser.isGermanEntryMatch(contradiction, query), false, query);
  }
  for (const query of ['Widerspruchs', 'Widerspruches', 'Widersprüche', 'Widersprüchen']) {
    assert.equal(parser.isGermanEntryMatch(contradiction, query), true, query);
  }
});

test('subjects with footnotes and auxiliaries in compound tenses cannot verify a different verb', () => {
  const entry = { ...counteract, principalParts: '', inflectionTables: [
    { title: 'Future Perfect', rows: [['ihr⁵', 'werdet', 'gegengesteuert', 'haben']] },
    { title: 'Perf. Subj.', rows: [['du', 'habest', 'gegengesteuert']] },
  ] };
  assert.equal(parser.isGermanEntryMatch(entry, 'gegengesteuert'), true);
  for (const query of ['ihr', 'werdet', 'habest', 'haben']) assert.equal(parser.isGermanEntryMatch(entry, query), false, query);
});

test('auxiliary verbs retain their own lexical conjugations', () => {
  // These are controls for filtering auxiliaries in the new difficult corpus.
  const entry = verb('werden', 'become', 'wird · wurde · ist geworden', []);
  entry.inflectionTables = [{ title: 'Present', rows: [['ich', 'werde'], ['du', 'wirst'], ['ihr', 'werdet']] }];
  for (const query of ['werde', 'wirst', 'werdet', 'wurde', 'geworden']) assert.equal(parser.isGermanEntryMatch(entry, query), true, query);
});

test('column headings do not verify another noun when the source marks them as headers', () => {
  const entry = { ...relationship, inflectionTables: [{ title: 'Declension', rows: [['', 'Singular', 'Plural'], ['Nom.', 'Verhältnis', 'Verhältnisse']], cells: [[{ header: true }, { header: true }, { header: true }], [{ header: true }, { header: false }, { header: false }]] }] };
  assert.equal(parser.isGermanEntryMatch(entry, 'Plural'), false);
  assert.equal(parser.isGermanEntryMatch(entry, 'Verhältnisse'), true);
});

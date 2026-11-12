import { dictionaryRuntime } from '../helpers/runtime';
import { test } from 'vitest';
import assert from 'node:assert/strict';
const parser = dictionaryRuntime();
const empty = { title: 'All German words', lemma: 'Abend', meaning: 'evening', inflectionTables: [] };
const book = { title: 'Conjugation of German verb buchstabieren', lemma: 'buchstabieren', partOfSpeech: 'verb', meaning: 'spell', inflectionTables: [{ title: 'Present', group: 'Imperative', rows: [['buchstabiere', '(du)']] }] };

function harness(respond) {
  const calls = [];
  const context = dictionaryRuntime({
    URL,
    dictionaryEntryUrl: parser.dictionaryEntryUrl,
    mergeEntryChoices: parser.mergeEntryChoices,
    isGermanEntryMatch: parser.isGermanEntryMatch,
    parseVerbformen: (html, word, sourceUrl) => ({ ...(html.entry || empty), word, sourceUrl }),
    parseGermanSearchEntries: (html, word) => (html.cards || []).filter(card => parser.isGermanEntryMatch(card.data, word)),

  });
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
  assert.equal(h.calls.length, 6);
  assert.equal(h.calls[1].pathname, '/conjugation/');
  assert.equal(h.calls[2].pathname, '/search/');
  assert.equal(h.calls[3].pathname, '/declension/adjectives/buchstabi.htm');
  assert.equal(h.calls[4].pathname, '/declension/nouns/Buchstabier.htm');
  assert.equal(h.calls[5].searchParams.get('w'), 'buchstabieren');
  assert.ok(h.calls.filter(url => url.search).every(url => url.searchParams.get('l') === '11'));
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

test('ohne resolves two exact inline candidates and preserves both without fetching another page', async () => {
  const cards = ['preposition', 'conjunction'].map(partOfSpeech => ({ lemma: 'ohne', label: 'ohne', partOfSpeech, detailUrl: null,
    data: { title: `German ${partOfSpeech} ohne`, lemma: 'ohne', partOfSpeech, meaning: 'without', inflectionTables: [] } }));
  const h = harness(() => ({ html: { cards } }));
  const result = await h.context.lookupGermanEntry('ohne', h.load, h.signal);
  assert.equal(result.data.lemma, 'ohne');
  assert.equal(result.data.partOfSpeech, 'preposition');
  assert.deepEqual(Array.from(result.data.entryChoices, entry => entry.partOfSpeech), ['preposition', 'conjunction']);
  assert.equal(h.calls.length, 1);
  assert.equal(result.data.entryChoices[1].data.meaning, 'without');
});

function woerterCards() {
  return ['preposition', 'conjunction'].map(partOfSpeech => {
    const detailUrl = `https://www.woerter.net/${partOfSpeech}s/ohne.htm`;
    return { lemma: 'ohne', label: 'ohne', partOfSpeech, detailUrl, url: detailUrl,
      data: { title: `Definition of German ${partOfSpeech} ohne`, lemma: 'ohne', partOfSpeech, sourceUrl: detailUrl, meaning: '', inflectionTables: [], linkOnly: true } };
  });
}

test('compact Woerter candidates load the selected definition and retain the other type', async () => {
  const cards = woerterCards();
  const h = harness(url => url.hostname === 'www.woerter.net' ? { html: { entry: { ...cards[0].data, linkOnly: false, meaning: 'without' } } }
    : { html: { cards } });
  const result = await h.context.lookupGermanEntry('ohne', h.load, h.signal);
  assert.equal(result.data.meaning, 'without');
  assert.equal(result.sourceUrl, cards[0].url);
  assert.equal(result.data.entryChoices.length, 2);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].href, cards[0].url);
});

test('a missing Woerter candidate tries the other exact candidate without displaying a stub', async () => {
  const cards = woerterCards();
  const h = harness(url => {
    if (url.pathname === '/prepositions/ohne.htm') throw Object.assign(new Error('missing'), { status: 404 });
    if (url.pathname === '/conjunctions/ohne.htm') return { html: { entry: { ...cards[1].data, linkOnly: false, meaning: 'without, but for' } } };
    return { html: { cards } };
  });
  const result = await h.context.lookupGermanEntry('ohne', h.load, h.signal);
  assert.equal(result.data.partOfSpeech, 'conjunction');
  assert.equal(result.data.meaning, 'without, but for');
  assert.equal(h.calls.length, 3);
});

test('Woerter definitions must match the selected word and canonicalize their own routes', async () => {
  const cards = woerterCards();
  const h = harness(url => url.hostname === 'www.woerter.net' ? { html: { entry: { title: 'German noun Haus', lemma: 'Haus', meaning: 'house' } } }
    : url.pathname === '/' ? { html: { cards } } : {});
  assert.equal(await h.context.lookupGermanEntry('ohne', h.load, h.signal), null);
  assert.equal(h.context.fullDictionaryEntryUrl('https://www.woerter.net/conjunctions/meanings/ohne.htm'), 'https://www.woerter.net/conjunctions/ohne.htm');
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

test('Vokabeln recovers Vokabel when plural query routes return no matching entry', async () => {
  const variants = [
    { article: 'die', lemma: 'Vokabel', label: 'die Vokabel', url: 'https://www.verbformen.com/declension/nouns/Vokabel.htm' },
    { article: 'das', lemma: 'Vokabel', label: 'das Vokabel', url: 'https://www.verbformen.com/declension/nouns/Vokabel_neut.htm' },
  ];
  const noun = { title: 'Declension of German noun Vokabel with plural and article', lemma: 'Vokabel', partOfSpeech: 'noun', article: 'die', meaning: 'word', variants, headwordForms: ['Vokabel','Vokabeln'], inflectionTables: [] };
  for (const query of ['Vokabeln', 'vokabeln']) {
    const h = harness(url => url.pathname === '/declension/nouns/Vokabel.htm' ? { html: { entry: noun } } : {});
    const result = await h.context.lookupGermanEntry(query, h.load, h.signal);
    assert.equal(result.data.lemma, 'Vokabel');
    assert.equal(result.data.word, query);
    assert.equal(result.data.variants.length, 2);
    assert.equal(h.calls.length, 5);
    assert.equal(h.calls[3].pathname, '/declension/nouns/Vokabeln.htm');
    assert.equal(h.calls[4].pathname, '/declension/nouns/Vokabel.htm');
  }
});

test('noun recovery rejects guessed singulars that do not list the selected plural', async () => {
  const h = harness(url => url.pathname === '/declension/nouns/Vokabel.htm' ? { html: { entry: { title: 'German noun Vokabel', lemma: 'Vokabel', meaning: 'word', headwordForms: ['Vokabels','Vokabel'], inflectionTables: [] } } } : {});
  const result = await h.context.lookupGermanEntry('Vokabeln', h.load, h.signal);
  assert.equal(result, null);
  assert.ok(h.calls.length <= 6);
});

test('exact noun pages recover singulars before trying suffix guesses', async () => {
  for (const lemma of ['Praktikantin', 'Studentin', 'Garten', 'Wagen', 'Mensch', 'Computer']) {
    for (const query of [lemma, lemma.toLocaleLowerCase('de-DE')]) {
      const noun = { title: `Declension of German noun ${lemma} with plural and article`, lemma, partOfSpeech: 'noun', meaning: 'example', inflectionTables: [] };
      const h = harness(url => url.pathname === `/declension/nouns/${lemma}.htm` ? { html: { entry: noun } } : {});
      const result = await h.context.lookupGermanEntry(query, h.load, h.signal);
      assert.equal(result?.data.lemma, lemma, query);
      assert.equal(result.data.word, query);
      const adjectiveFirst = query === lemma.toLocaleLowerCase('de-DE') && h.context.germanAdjectiveCandidates(query).length > 0;
      const pastFirst = query === lemma.toLocaleLowerCase('de-DE') && h.context.germanPastTenseCandidates(query).length > 0;
      assert.equal(h.calls.length, 4 + Number(adjectiveFirst) + Number(pastFirst));
      assert.equal(h.calls.at(-1).pathname, `/declension/nouns/${lemma}.htm`);
    }
  }
});

test('feminine plurals in -innen recover -in with source verification', async () => {
  for (const [query, lemma] of [['Praktikantinnen', 'Praktikantin'], ['Lehrerinnen', 'Lehrerin'], ['studentinnen', 'Studentin']]) {
    const noun = { title: `German noun ${lemma}`, lemma, partOfSpeech: 'noun', meaning: 'example', headwordForms: [lemma, query], inflectionTables: [] };
    const h = harness(url => url.pathname === `/declension/nouns/${lemma}.htm` ? { html: { entry: noun } } : {});
    const result = await h.context.lookupGermanEntry(query, h.load, h.signal);
    assert.equal(result?.data.lemma, lemma, query);
    assert.equal(result.data.word, query);
    assert.ok(h.calls.length <= 6);
    const invalid = harness(url => url.pathname === `/declension/nouns/${lemma}.htm` ? { html: { entry: { ...noun, headwordForms: [lemma] } } } : {});
    assert.equal(await invalid.context.lookupGermanEntry(query, invalid.load, invalid.signal), null);
  }
});

test('exact noun fallback rejects unrelated redirects and respects request limits', async () => {
  const h = harness(() => ({ html: { entry: { title: 'German noun Praktikant', lemma: 'Praktikant', meaning: 'intern', inflectionTables: [] } } }));
  assert.equal(await h.context.lookupGermanEntry('Praktikantin', h.load, h.signal), null);
  assert.ok(h.calls.length <= 6);
});

const nationwide = {
  title: 'Declension and comparison German adjective landesweit',
  lemma: 'landesweit', partOfSpeech: 'adjective', meaning: 'nationwide, countrywide, statewide',
  grammarTags: ['positive', 'not comparable'],
  inflectionTables: [{ title: 'Masculine', group: 'Strong declension', rows: [
    ['Nom.', 'landesweiter'], ['Gen.', 'landesweiten'], ['Dat.', 'landesweitem'], ['Acc.', 'landesweiten'],
  ] }, { title: 'Neutral', group: 'Strong declension', rows: [
    ['Nom.', 'landesweites'], ['Gen.', 'landesweiten'], ['Dat.', 'landesweitem'], ['Acc.', 'landesweites'],
  ] }, { title: 'Feminine', group: 'Strong declension', rows: [
    ['Nom.', 'landesweite'], ['Gen.', 'landesweiter'], ['Dat.', 'landesweiter'], ['Acc.', 'landesweite'],
  ] }],
};

test('landesweiten and other adjective endings recover their source-verified dictionary form', async () => {
  for (const query of ['landesweiten', 'landesweite', 'landesweitem', 'landesweiter', 'landesweites', 'Landesweiten']) {
    const h = harness(url => url.pathname === '/declension/adjectives/landesweit.htm' ? { html: { entry: nationwide } } : {});
    const result = await h.context.lookupGermanEntry(query, h.load, h.signal);
    assert.equal(result?.data.lemma, 'landesweit', query);
    assert.equal(result.data.word, query);
    assert.equal(result.data.meaning, nationwide.meaning);
    assert.equal(result.data.inflectionTables.length, 3);
    assert.ok(h.calls.length <= 8);
  }
});

test('adjective guesses cannot be accepted without the original form in the source', async () => {
  const h = harness(url => url.pathname.startsWith('/declension/adjectives/') ? { html: { entry: {
    ...nationwide, inflectionTables: [{ title: 'Masculine', rows: [['Nom.', 'landesweiter']] }],
  } } } : {});
  assert.equal(await h.context.lookupGermanEntry('landesweiten', h.load, h.signal), null);
  assert.ok(h.calls.length <= 8);
});

test('adjective recovery preserves final e, contracted stems, and comparative bases', async () => {
  for (const [query, lemma, slug = lemma] of [['müden', 'müde', 'mu3de'], ['leises', 'leise'], ['dunklen', 'dunkel'], ['teuren', 'teuer'], ['kleineren', 'klein']]) {
    const data = { title: `German adjective ${lemma}`, lemma, partOfSpeech: 'adjective', meaning: 'example', inflectionTables: [{ title: 'Dative', rows: [['Dat.', query]] }] };
    const h = harness(url => url.pathname === `/declension/adjectives/${slug}.htm` ? { html: { entry: data } } : {});
    const result = await h.context.lookupGermanEntry(query, h.load, h.signal);
    assert.equal(result?.data.lemma, lemma, query);
    assert.equal(result.data.word, query);
    assert.ok(h.calls.length <= 8);
  }
});

test('lowercase noun plurals remain recoverable alongside adjective guesses', async () => {
  const noun = { title: 'German noun Student', lemma: 'Student', partOfSpeech: 'noun', meaning: 'student', headwordForms: ['Student', 'Studenten'], inflectionTables: [] };
  const h = harness(url => url.pathname === '/declension/nouns/Student.htm' ? { html: { entry: noun } } : {});
  assert.equal((await h.context.lookupGermanEntry('studenten', h.load, h.signal))?.data.lemma, 'Student');
  assert.ok(h.calls.length <= 8);
});

test('umlaut and sharp-s nouns use the source slug encoding', async () => {
  for (const [query, slug] of [['Übungsbuch', 'U3bungsbuch'], ['übungsbuch', 'U3bungsbuch'], ['Straße', 'Stras5e'], ['Öl', 'O3l']]) {
    const lemma = query[0].toLocaleUpperCase('de-DE') + query.slice(1);
    const noun = { title: `German noun ${lemma}`, lemma, partOfSpeech: 'noun', meaning: 'workbook', inflectionTables: [] };
    const h = harness(url => url.pathname === `/declension/nouns/${slug}.htm` ? { html: { entry: noun } } : {});
    const result = await h.context.lookupGermanEntry(query, h.load, h.signal);
    assert.equal(result?.data.lemma, lemma, query);
    assert.equal(result.data.word, query);
    assert.ok(h.calls.length <= 8);
  }
});

test('regular past-tense selections recover verwenden and verify the selected conjugation', async () => {
  for (const query of ['verwendete', 'verwendetest', 'verwendeten', 'verwendetet', 'Verwendete']) {
    const verb = { title: 'Conjugation of German verb verwenden', lemma: 'verwenden', partOfSpeech: 'verb', meaning: 'use, employ', inflectionTables: [{ title: 'Imperfect', rows: [['ich', 'verwendete'], ['du', 'verwendetest'], ['wir', 'verwendeten'], ['ihr', 'verwendetet']] }] };
    const h = harness(url => url.pathname === '/conjugation/verwenden.htm' ? { html: { entry: verb } } : {});
    const result = await h.context.lookupGermanEntry(query, h.load, h.signal);
    assert.equal(result?.data.lemma, 'verwenden', query);
    assert.equal(result.data.word, query);
    assert.ok(h.calls.length <= 8);
  }
});

test('the exact adjective is selected before a matching comparative and keeps alternatives', async () => {
  const adjective = { title: 'German adjective ausgesprochen', lemma: 'ausgesprochen', partOfSpeech: 'adjective', meaning: 'pronounced, explicit', inflectionTables: [], comparisonVariants: [
    { degree: 'positive', form: 'ausgesprochen', url: 'https://www.verbformen.com/declension/adjectives/ausgesprochen.htm' },
    { degree: 'comparative', form: 'ausgesprochener', url: 'https://www.verbformen.com/declension/adjectives/ausgesprochener.htm' },
  ] };
  const comparative = { ...adjective, lemma: 'ausgesprochener', principalParts: 'ausgesprochen · ausgesprochener · am ausgesprochensten' };
  const h = harness(url => url.pathname === '/' ? { html: { cards: [
    { data: comparative, label: 'ausgesprochener', detailUrl: comparative.comparisonVariants[1].url },
    { data: adjective, label: 'ausgesprochen', detailUrl: adjective.comparisonVariants[0].url },
  ] } } : { html: { entry: adjective } });
  const result = await h.context.lookupGermanEntry('ausgesprochen', h.load, h.signal);
  assert.equal(result.data.lemma, 'ausgesprochen');
  assert.equal(h.calls[1].pathname, '/declension/adjectives/ausgesprochen.htm');
  assert.equal(result.data.comparisonVariants.length, 2);
  assert.equal(result.data.entryChoices.length, 2);
  assert.equal(h.calls.length, 2);
});

test('ausgesprochen can recover its exact adjective page when all query routes fail', async () => {
  const adjective = { title: 'German adjective ausgesprochen', lemma: 'ausgesprochen', partOfSpeech: 'adjective', meaning: 'pronounced, explicit', inflectionTables: [] };
  const h = harness(url => url.pathname === '/declension/adjectives/ausgesprochen.htm' ? { html: { entry: adjective } } : {});
  assert.equal((await h.context.lookupGermanEntry('ausgesprochen', h.load, h.signal))?.data.lemma, 'ausgesprochen');
  assert.equal(h.calls.length, 4);
});

test('verified grammar and linked lexical entries survive missing English glosses', async () => {
  const noun = { title: 'German noun Lernende', lemma: 'Lernende', partOfSpeech: 'noun', article: 'der', meaning: '', inflectionTables: [{ title: 'Singular', rows: [['Nom.', 'der', 'Lernende'], ['Gen.', 'des', 'Lernenden'], ['Dat.', 'dem', 'Lernenden'], ['Acc.', 'den', 'Lernenden']] }] };
  const url = 'https://www.verbformen.com/declension/nouns/Lernende.htm';
  const h = harness(address => address.pathname === '/' ? { html: { cards: [{ data: { ...noun, sourceUrl: url, inflectionTables: [] }, detailUrl: url }] } } : { html: { entry: noun } });
  const result = await h.context.lookupGermanEntry('Lernende', h.load, h.signal);
  assert.equal(result?.data.lemma, 'Lernende');
  assert.equal(result.data.meaning, '');
  assert.equal(result.data.inflectionTables.length, 1);
});

test('redirected dictionary entries preserve source-linked word types without loading alternatives', async () => {
  const adjectiveUrl = 'https://www.verbformen.com/declension/adjectives/klein.htm';
  const nounUrl = 'https://www.verbformen.com/declension/nouns/Klein.htm';
  const entryChoices = [{ lemma: 'klein', partOfSpeech: 'adjective', label: 'adjective · klein', url: adjectiveUrl },
    { lemma: 'Klein', partOfSpeech: 'noun', label: 'noun · das Klein', url: nounUrl }];
  const data = { title: 'German adjective klein', lemma: 'klein', partOfSpeech: 'adjective', meaning: 'small', entryChoices, inflectionTables: [] };
  const h = harness(() => ({ html: { entry: data }, sourceUrl: adjectiveUrl }));
  const result = await h.context.lookupGermanEntry('klein', h.load, h.signal);
  assert.deepEqual(Array.from(result.data.entryChoices, entry => entry.partOfSpeech), ['adjective', 'noun']);
  assert.equal(h.calls.length, 1);
});

test('search-card completion keeps word types discovered on the full dictionary page', async () => {
  const adjectiveUrl = 'https://www.verbformen.com/declension/adjectives/klein.htm';
  const noun = { lemma: 'Klein', partOfSpeech: 'noun', label: 'noun · das Klein', url: 'https://www.verbformen.com/declension/nouns/Klein.htm' };
  const data = { title: 'German adjective klein', lemma: 'klein', partOfSpeech: 'adjective', meaning: 'small', inflectionTables: [] };
  const h = harness(url => url.pathname === '/' ? { html: { cards: [{ data, lemma: 'klein', detailUrl: adjectiveUrl }] } }
    : { html: { entry: { ...data, entryChoices: [noun] } } });
  const result = await h.context.lookupGermanEntry('klein', h.load, h.signal);
  assert.ok(result.data.entryChoices.some(entry => entry.partOfSpeech === 'noun'));
  assert.ok(result.data.entryChoices.some(entry => entry.partOfSpeech === 'adjective'));
  assert.equal(h.calls.length, 2);
});

test('verheiratet recovers verheiraten without requiring a ge- prefix', async () => {
  const verb = { title: 'German verb verheiraten', lemma: 'verheiraten', partOfSpeech: 'verb', meaning: 'marry, get married', principalParts: 'verheiratet · verheiratete · hat verheiratet', inflectionTables: [] };
  for (const query of ['verheiratet', 'Verheiratet']) {
    const h = harness(url => url.pathname === '/conjugation/verheiraten.htm' ? { html: { entry: verb } } : {});
    const result = await h.context.lookupGermanEntry(query, h.load, h.signal);
    assert.equal(result?.data.lemma, 'verheiraten', query);
    assert.equal(result.data.word, query);
    assert.ok(h.calls.length <= 8);
  }
});

test('uninflected adjectives ending in t use their exact source page first', async () => {
  for (const word of ['verheiratet', 'begeistert', 'entspannt']) {
    const adjective = { title: `German adjective ${word}`, lemma: word, partOfSpeech: 'adjective', meaning: 'example', inflectionTables: [] };
    const h = harness(url => url.pathname === `/declension/adjectives/${word}.htm` ? { html: { entry: adjective } } : {});
    assert.equal((await h.context.lookupGermanEntry(word, h.load, h.signal))?.data.lemma, word);
    assert.equal(h.calls[3].pathname, `/declension/adjectives/${word}.htm`);
  }
});

test('regular t/et forms recover stems and source-attested ge- particles', async () => {
  for (const [query, lemma, slug] of [
    ['arbeitet', 'arbeiten', 'arbeiten'],
    ['benutzt', 'benutzen', 'benutzen'],
    ['geöffnet', 'öffnen', 'o3ffnen'],
    ['eingekauft', 'einkaufen', 'einkaufen'],
    ['begeistert', 'begeistern', 'begeistern'],
    ['verwendetet', 'verwenden', 'verwenden'],
  ]) {
    const verb = { title: `German verb ${lemma}`, lemma, partOfSpeech: 'verb', meaning: 'example', inflectionTables: [{ title: 'Present / participle', rows: [['Form', query]] }] };
    const h = harness(url => url.pathname === `/conjugation/${slug}.htm` ? { html: { entry: verb } } : {});
    const result = await h.context.lookupGermanEntry(query, h.load, h.signal);
    assert.equal(result?.data.lemma, lemma, query);
    assert.equal(result.data.word, query);
    assert.ok(h.calls.length <= 8);
  }
});

test('regular verb recovery rejects candidates that do not attest the original t-form', async () => {
  const h = harness(url => url.pathname === '/conjugation/verheiraten.htm' ? { html: { entry: {
    title: 'German verb verheiraten', lemma: 'verheiraten', partOfSpeech: 'verb', meaning: 'marry', inflectionTables: [{ title: 'Present', rows: [['ich', 'verheirate']] }],
  } } } : {});
  assert.equal(await h.context.lookupGermanEntry('verheiratet', h.load, h.signal), null);
  assert.ok(h.calls.length <= 8);
});

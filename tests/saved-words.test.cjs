const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { browserI18n } = require('./helpers/i18n.cjs');
const source = fs.readFileSync('saved-words.js', 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const entry = (lemma, extra = {}) => ({ lemma, meaning: `English for ${lemma}`, partOfSpeech: 'noun', article: 'die', ...extra });

function harness() {
  const state = {};
  let failWrite = false;
  const storage = {
    get: async () => clone(state),
    set: async value => {
      if (failWrite) { failWrite = false; throw new Error('Storage unavailable'); }
      Object.assign(state, clone(value));
    },
  };
  const context = vm.createContext({ URL });
  vm.runInContext(source, context);
  return { state, storage, context, store: context.createSavedWordsStore(storage), failNextWrite: () => { failWrite = true; } };
}

test('saved records contain the dictionary form and meaning, and survive store recreation', async () => {
  const h = harness();
  const { words } = await h.store.add(entry('machen', { word: 'machst', article: '', partOfSpeech: 'verb', meaning: 'make, do', audio: ['ignored'], inflectionTables: ['ignored'], sourceUrl: 'https://www.verbformen.com/conjugation/machen.htm' }));
  assert.equal(words[0].lemma, 'machen');
  assert.equal(words[0].meaning, 'make, do');
  assert.equal(words[0].word, undefined);
  assert.equal(words[0].audio, undefined);
  const reopened = h.context.createSavedWordsStore(h.storage);
  assert.deepEqual(clone((await reopened.list()).words), clone(words));
});

test('duplicates normalize case and Unicode while preserving genders and word types', async () => {
  const h = harness();
  await h.store.add(entry('Vokabel'));
  await h.store.add(entry('vokabel'));
  await h.store.add(entry('Vokabel', { article: 'das' }));
  await h.store.add(entry('Vokabel', { article: '', partOfSpeech: 'adjective' }));
  await h.store.add(entry('Ähre'));
  const { words } = await h.store.add(entry('A\u0308hre'));
  assert.equal(words.length, 4);
  assert.equal(words.filter(word => word.lemma.toLowerCase() === 'vokabel').length, 3);
});

test('simultaneous saves cannot exceed 100 or evict existing entries', async () => {
  const h = harness();
  const results = await Promise.allSettled(Array.from({ length: 101 }, (_, i) => h.store.add(entry(`Wort${i}`))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 100);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.match(results[100].reason.message, /List full/);
  assert.equal(h.state.savedWords.length, 100);
  assert.ok(h.state.savedWords.some(word => word.lemma === 'Wort0'));
  assert.equal((await h.store.add(entry('Wort0'))).words.length, 100);
  const { removed } = await h.store.remove(h.state.savedWords[0].id);
  await h.store.add(entry('Replacement'));
  await assert.rejects(h.store.restore(removed), /List full/);
  assert.equal(h.state.savedWords.length, 100);
});

test('delete and undo restore the word to its original sorted position', async () => {
  const h = harness();
  await h.store.restore(entry('old', { savedAt: 10 }));
  await h.store.restore(entry('new', { savedAt: 30 }));
  let { words } = await h.store.restore(entry('middle', { savedAt: 20 }));
  const { removed } = await h.store.remove(words[1].id);
  assert.equal((await h.store.list()).words.length, 2);
  ({ words } = await h.store.restore(removed));
  assert.deepEqual(clone(words.map(word => word.lemma)), ['new', 'middle', 'old']);
  assert.equal(words[1].savedAt, 20);
});

test('failed writes leave saved words intact and do not block later operations', async () => {
  const h = harness();
  h.failNextWrite();
  await assert.rejects(h.store.add(entry('first')), /Storage unavailable/);
  assert.equal((await h.store.list()).words.length, 0);
  const { words } = await h.store.add(entry('second'));
  h.failNextWrite();
  await assert.rejects(h.store.remove(words[0].id), /Storage unavailable/);
  assert.equal((await h.store.list()).words.length, 1);
  await h.store.remove(words[0].id);
  assert.equal((await h.store.list()).words.length, 0);
});

test('saving requires a meaning and never retains foreign or executable source URLs', async () => {
  const h = harness();
  await assert.rejects(h.store.add(entry('word', { meaning: '' })), /meaning/);
  for (const [i, sourceUrl] of ['javascript:alert(1)', 'https://evil.example/word', 'https://user:pass@www.verbformen.com/'].entries()) {
    const { words } = await h.store.add(entry(`word${i}`, { sourceUrl }));
    assert.equal(words.find(word => word.lemma === `word${i}`).sourceUrl, '');
  }
});

test('background messages use the shared store and reject unknown actions', async () => {
  const h = harness();
  let listener;
  const context = vm.createContext({ URL, chrome: {
    i18n: browserI18n(),
    storage: { local: h.storage },
    runtime: { onMessage: { addListener: fn => { listener = fn; } }, onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
    contextMenus: { onClicked: { addListener() {} } },
  } });
  context.importScripts = file => vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  vm.runInContext(fs.readFileSync('background.js', 'utf8'), context);
  const send = message => new Promise(resolve => assert.equal(listener({ type: 'savedWords', ...message }, {}, resolve), true));
  assert.equal((await send({ action: 'add', entry: entry('Bruder') })).ok, true);
  assert.equal((await send({ action: 'list' })).words.length, 1);
  assert.equal((await send({ action: 'constructor' })).ok, false);
  assert.equal(listener({ type: 'other' }, {}, () => assert.fail()), undefined);
});

test('fallback definition attribution survives saving, reopening, deletion and undo', async () => {
  const h = harness();
  const meaningSource = { provider: 'Wiktionary', url: 'https://en.wiktionary.org/w/index.php?title=Lernender&oldid=123', revisionId: 123, license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' };
  let { words } = await h.store.add(entry('Lernende', { meaning: 'learner; student', meaningSource }));
  assert.deepEqual(clone(words[0].meaningSource), meaningSource);
  const { removed } = await h.store.remove(words[0].id);
  ({ words } = await h.store.restore(removed));
  assert.deepEqual(clone(words[0].meaningSource), meaningSource);
  assert.deepEqual(clone((await h.context.createSavedWordsStore(h.storage).list()).words[0].meaningSource), meaningSource);
});

test('saved definition attribution rejects hostile URLs and normalizes the license link', async () => {
  const h = harness();
  let { words } = await h.store.add(entry('first', { meaningSource: { provider: 'Wiktionary', url: 'javascript:alert(1)' } }));
  assert.equal(words[0].meaningSource, undefined);
  ({ words } = await h.store.add(entry('second', { meaningSource: { provider: 'Wiktionary', url: 'https://en.wiktionary.org/wiki/Lernende', licenseUrl: 'https://evil.example/' } })));
  assert.equal(words.find(word => word.lemma === 'second').meaningSource.licenseUrl, 'https://creativecommons.org/licenses/by-sa/4.0/');
});

test('saved basic translations retain MyMemory attribution without a Wiktionary license or arbitrary source URL', async () => {
  const h = harness();
  const meaningSource = { provider: 'MyMemory', url: 'https://mymemory.translated.net/' };
  const { words } = await h.store.add(entry('Pommes', { partOfSpeech: '', meaning: 'French fries', meaningSource: { ...meaningSource, license: 'CC BY-SA 4.0', licenseUrl: 'https://evil.example/' } }));
  assert.deepEqual(clone(words[0].meaningSource), meaningSource);
  const restored = await h.context.createSavedWordsStore(h.storage).list();
  assert.equal(restored.words[0].meaningSource.provider, 'MyMemory');
  const invalid = h.context.savedWordRecord(entry('other', { meaningSource: { provider: 'MyMemory', url: 'https://evil.example/' } }));
  assert.equal(invalid.meaningSource, undefined);
});

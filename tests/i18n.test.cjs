const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { browserI18n, english } = require('./helpers/i18n.cjs');

function harness(overrides = {}) {
  const context = vm.createContext({ chrome: { i18n: browserI18n(overrides) } });
  vm.runInContext(fs.readFileSync('i18n.js', 'utf8'), context);
  return context;
}

test('all UI, manifest, grammar, and transported error message references exist in the default catalog', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.equal(manifest.default_locale, 'en');
  const referenced = new Set();
  for (const file of ['popup.js', 'background.js', 'parser.js', 'saved-words.js', 'i18n.js']) {
    const source = fs.readFileSync(file, 'utf8');
    for (const call of source.matchAll(/\bt\(([^)\n]*)/g)) {
      for (const key of call[1].matchAll(/["']([a-z_]+)["']/g)) referenced.add(key[1]);
    }
    for (const match of source.matchAll(/messageKey:\s*["']([a-z_]+)["']/g)) referenced.add(match[1]);
  }
  for (const match of fs.readFileSync('popup.html', 'utf8').matchAll(/data-i18n(?:-title|-aria-label)?="([a-z_]+)"/g)) referenced.add(match[1]);
  for (const match of JSON.stringify(manifest).matchAll(/__MSG_([a-z_]+)__/g)) referenced.add(match[1]);
  const context = harness();
  for (const key of vm.runInContext('Object.values(GRAMMAR_MESSAGES)', context)) referenced.add(key);
  for (const key of referenced) assert.ok(english[key]?.message, `Missing English message: ${key}`);
});

test('every shipped catalog has valid keys, substitution definitions, and language metadata', () => {
  for (const locale of fs.readdirSync('_locales')) {
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    assert.match(catalog.ui_locale.message, /^[a-z]{2,3}(?:[_-][A-Za-z0-9]+)*$/);
    assert.match(catalog.ui_direction.message, /^(ltr|rtl)$/);
    for (const [key, entry] of Object.entries(catalog)) {
      assert.match(key, /^[a-z_]+$/);
      assert.equal(typeof entry.message, 'string');
      assert.ok(entry.message.length);
      assert.ok(english[key], `Unknown message: ${key}`);
      const placeholders = [...entry.message.matchAll(/\$([a-z_]+)\$/gi)].map(match => match[1].toLowerCase()).sort();
      const expected = [...english[key].message.matchAll(/\$([a-z_]+)\$/gi)].map(match => match[1].toLowerCase()).sort();
      assert.deepEqual(placeholders, expected, `${locale}: ${key} placeholders changed`);
      for (const name of placeholders) {
        assert.match(entry.placeholders?.[name]?.content || '', /^\$[1-9]$/);
        assert.equal(entry.placeholders[name].content, english[key].placeholders[name].content);
      }
      if (key === 'context_lookup') assert.equal((entry.message.match(/%s/g) || []).length, 1);
    }
  }
});

test('native message lookup preserves dynamic values and default English messages', () => {
  const context = harness({ save_button: { message: 'Keep' } });
  assert.equal(context.t('save_button'), 'Keep');
  assert.equal(context.t('lookup_button'), 'Look up');
  assert.equal(context.t('delete_word_label', '<b>Häuser</b> $1'), 'Delete <b>Häuser</b> $1');
  assert.equal(context.t('saved_count', [3, 100]), '3/100');
  assert.equal(context.t('context_lookup'), 'Look up with Currywurst: %s');
});

test('static localization sets document language and attributes while keeping catalog markup inert', () => {
  const context = harness({ lookup_button: { message: '<b>Keep</b>' }, ui_locale: { message: 'zz' }, ui_direction: { message: 'rtl' } });
  const makeNode = attributes => ({ attributes, textContent: '', getAttribute(name) { return this.attributes[name]; }, setAttribute(name, value) { this.attributes[name] = value; } });
  const button = makeNode({ 'data-i18n': 'lookup_button' });
  const title = makeNode({ 'data-i18n-title': 'mode_toggle_title' });
  const label = makeNode({ 'data-i18n-aria-label': 'saved_list_label' });
  const root = { documentElement: {}, querySelectorAll: selector => ({ '[data-i18n]': [button], '[data-i18n-title]': [title], '[data-i18n-aria-label]': [label] })[selector] };
  context.localizeDocument(root);
  assert.equal(root.documentElement.lang, 'zz');
  assert.equal(root.documentElement.dir, 'rtl');
  assert.equal(button.textContent, '<b>Keep</b>');
  assert.equal(button.innerHTML, undefined);
  assert.equal(title.attributes.title, 'Click to reverse direction');
  assert.equal(label.attributes['aria-label'], 'Saved words');
});

test('grammar display and structured errors localize without altering source words', () => {
  const context = harness({ grammar_noun: { message: 'NOUN LABEL' }, saved_list_full: { message: 'FULL LIST' } });
  assert.equal(context.uiGrammarLabel('noun'), 'NOUN LABEL');
  assert.equal(context.uiGrammarLabel('Indicative · Present'), 'Indicative · Present');
  assert.equal(context.uiGrammarLabel('Schwestern'), 'Schwestern');
  assert.equal(context.entryChoiceLabel({ partOfSpeech: 'noun', lemma: 'Klein', label: 'noun · das Klein' }), 'NOUN LABEL · das Klein');
  assert.equal(context.uiError({ message: 'Internal English', messageKey: 'saved_list_full' }), 'FULL LIST');
});

import * as i18n from '../../src/shared/i18n';
import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { browserI18n, english } from '../setup';

function harness(overrides = {}) {
  vi.stubGlobal("chrome", { i18n: browserI18n(overrides) });
  return i18n;
}

test('all UI, manifest, grammar, and transported error message references exist in the default catalog', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.equal(manifest.default_locale, 'en');
  const referenced = new Set();
  for (const file of fs.readdirSync('src', { recursive: true }).filter(name => /\.tsx?$/.test(name)).map(name => `src/${name}`)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const call of source.matchAll(/\bt\(\s*["']([a-z_]+)["']/g)) referenced.add(call[1]);
    for (const match of source.matchAll(/messageKey:\s*["']([a-z_]+)["']/g)) referenced.add(match[1]);
  }
  for (const match of fs.readFileSync('popup.html', 'utf8').matchAll(/data-i18n(?:-title|-aria-label)?="([a-z_]+)"/g)) referenced.add(match[1]);
  for (const match of JSON.stringify(manifest).matchAll(/__MSG_([a-z_]+)__/g)) referenced.add(match[1]);
  const context = harness();
  for (const key of Object.values(context.GRAMMAR_MESSAGES)) referenced.add(key);
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

test('grammar display and structured errors localize without altering source words', () => {
  const context = harness({ grammar_noun: { message: 'NOUN LABEL' }, saved_list_full: { message: 'FULL LIST' } });
  assert.equal(context.uiGrammarLabel('noun'), 'NOUN LABEL');
  assert.equal(context.uiGrammarLabel('Indicative · Present'), 'Indicative · Present');
  assert.equal(context.uiGrammarLabel('Schwestern'), 'Schwestern');
  assert.equal(context.entryChoiceLabel({ partOfSpeech: 'noun', lemma: 'Klein', label: 'noun · das Klein' }), 'NOUN LABEL · das Klein');
  assert.equal(context.uiError({ message: 'Internal English', messageKey: 'saved_list_full' }), 'FULL LIST');
});

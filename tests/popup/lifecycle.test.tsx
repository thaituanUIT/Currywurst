import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { App } from '../../src/popup/App';
import { PopupController } from '../../src/popup/features/lookup/controller';
import { harness, tick } from '../helpers/popup';
import { parseSavedWordsMessage, parseSavedWordsResponse } from '../../src/shared/messages';
import { Pronunciation } from '../../src/popup/features/pronunciation/pronunciation';

test('StrictMode and repeated initialization consume a pending request once', async () => {
  const storage = { pendingLookup: { word: 'Haus', hint: 'de', createdAt: Date.now() } };
  const h = harness({}, storage);
  await act(async () => {
    render(<StrictMode><App controller={h.controller} saved={h.savedController} /></StrictMode>);
    const initial = h.controller.initialize();
    expect(h.controller.initialize()).toBe(initial);
    await Promise.resolve();
  });
  expect(storage.pendingLookup).toBeUndefined();
  expect(h.requests).toHaveLength(1);
  h.respond(0);
  await tick();
  expect(h.requests).toHaveLength(1);
});

test('real keyboard interaction submits the current input and mode reversal clears and focuses it', async () => {
  const h = harness();
  await tick();
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), 'Haus{Enter}');
  expect(new URL(h.requests[0].url).searchParams.get('w')).toBe('Haus');
  h.respond(0);
  await tick();
  expect(screen.getByRole('heading', { name: 'Haus' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: /German to English\. Click/ }));
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
  expect(document.activeElement).toBe(screen.getByRole('textbox'));
  expect(h.requests).toHaveLength(1);
});

test('a late save error for an old entry does not appear on a new entry', async () => {
  let rejectSave!: (error: Error) => void;
  const h = harness({}, {}, undefined, undefined, {}, () => new Promise((_, reject) => { rejectSave = reject; }));
  await tick();
  const entry = (lemma: string) => ({ word: lemma, lemma, meaning: 'meaning', title: `German noun ${lemma}`, sourceUrl: '', partOfSpeech: 'noun', ipa: [], audio: [], inflectionTables: [] });
  h.context.renderGermanEntry(entry('Haus'));
  const saving = h.context.saveCurrentWord();
  h.context.renderGermanEntry(entry('Baum'));
  rejectSave(new Error('Old save failed'));
  await saving;
  expect(h.container.querySelector('#save-status')?.textContent).toBe('');
  expect(h.container.querySelector('h1')?.textContent).toBe('Baum');
});

test('a late storage read cannot overwrite typing or navigation', async () => {
  let resolveLocal!: (value: object) => void;
  const h = harness();
  await tick();
  const browser = h.context.chrome;
  browser.storage.local.get = () => new Promise(resolve => { resolveLocal = resolve; });
  const controller = new PopupController({ browser });
  const pending = controller.initialize();
  controller.editInput('typed');
  controller.setView('saved');
  resolveLocal({ lookupWord: 'old', lookupMode: 'en-de' });
  await pending;
  expect(controller.getSnapshot()).toMatchObject({ input: 'typed', view: 'saved', mode: 'de-en' });
  controller.dispose();
});

test('older saved-list reads do not replace a completed mutation', async () => {
  const h = harness();
  await tick();
  let finishRead!: (value: object) => void;
  const browser = h.context.chrome;
  browser.storage.local.get = () => new Promise(resolve => { finishRead = resolve; });
  const loading = h.savedController.load();
  await Promise.resolve();
  const entry = { lemma: 'Haus', word: 'Haus', title: 'German noun Haus', meaning: 'house', sourceUrl: '', partOfSpeech: 'noun', ipa: [], audio: [], inflectionTables: [] };
  browser.runtime.sendMessage = async () => ({ ok: true, words: [{ ...entry, id: '["haus","noun",""]', article: '', savedAt: 42 }] });
  await h.savedController.save(entry, '');
  finishRead({ savedWords: [] });
  await loading;
  expect(h.savedController.getSnapshot().words).toHaveLength(1);
});

test('Undo expires after five seconds and cannot restore after expiry', async () => {
  const h = harness({ savedWords: [{ lemma: 'Haus', meaning: 'house', savedAt: 12 }] });
  await tick();
  vi.useFakeTimers();
  try {
    await h.savedController.remove(h.savedController.getSnapshot().words[0].id);
    expect(h.savedController.getSnapshot().removed?.lemma).toBe('Haus');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(h.savedController.getSnapshot().removed).toBeUndefined();
    await h.savedController.undo();
    expect(h.savedController.getSnapshot().words).toHaveLength(0);
  } finally { vi.useRealTimers(); }
});

test('hostile definitions and localized strings remain text in React', async () => {
  const h = harness({}, {}, undefined, undefined, { empty_lookup_hint: { message: '<img src=x onerror=alert(1)>' } });
  await tick();
  expect(h.container.querySelector('#result img')).toBeNull();
  expect(h.container.querySelector('#result')?.textContent).toContain('<img');
  fireEvent.change(h.container.querySelector('input')!, { target: { value: '<script>' } });
  expect(h.controller.getSnapshot().input).toBe('<script>');
});

test('React localizes document metadata, labels, and text without interpreting catalog markup', async () => {
  const h = harness({}, {}, undefined, undefined, {
    ui_locale: { message: 'zz' }, ui_direction: { message: 'rtl' },
    popup_title: { message: 'Translated title' }, lookup_button: { message: '<b>Keep</b>' },
    mode_toggle_title: { message: 'Reverse' }, german_word_label: { message: 'Source word' },
  });
  await tick();
  expect(document.documentElement.lang).toBe('zz');
  expect(document.documentElement.dir).toBe('rtl');
  expect(document.title).toBe('Translated title');
  expect(h.container.querySelector('#word')?.getAttribute('aria-label')).toBe('Source word');
  expect(h.container.querySelector('#mode-toggle')?.getAttribute('title')).toBe('Reverse');
  expect(h.container.querySelector('form button')?.textContent).toBe('<b>Keep</b>');
  expect(h.container.querySelector('form button b')).toBeNull();
});

describe('typed browser boundaries', () => {
  test('message validation rejects malformed requests and response records', () => {
    for (const value of [null, {}, { type: 'savedWords', action: 'constructor' }, { type: 'savedWords', action: 'remove', id: 1 }, { type: 'savedWords', action: 'add', entry: { lemma: 'Haus' } }]) expect(() => parseSavedWordsMessage(value)).toThrow();
    for (const value of [null, {}, { ok: true, words: 'wrong' }, { ok: true, words: [null] }]) expect(() => parseSavedWordsResponse(value)).toThrow();
  });
});

test('stopping a failed recording prevents late speech fallback', async () => {
  let rejectPlayback!: (error: Error) => void;
  const speak = vi.fn();
  const pause = vi.fn();
  vi.stubGlobal('Audio', class { pause = pause; play = () => new Promise((_, reject) => { rejectPlayback = reject; }); });
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), getVoices: () => [], speak });
  const pronunciation = new Pronunciation();
  const playing = pronunciation.play('Haus', 'de-DE', 'https://www.verbformen.com/haus.mp3', vi.fn());
  pronunciation.stop();
  rejectPlayback(new Error('Recording failed'));
  await playing;
  expect(pause).toHaveBeenCalled();
  expect(speak).not.toHaveBeenCalled();
});

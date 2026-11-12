import { act, fireEvent, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, vi } from 'vitest';
import { setImmediate } from 'node:timers';
import { App } from '../../src/popup/App';
import { PopupController } from '../../src/popup/features/lookup/controller';
import { SavedWordsController } from '../../src/popup/features/saved-words/controller';
import { createDictionaryClient } from '../../src/dictionary/client';
import { createGermanLookup } from '../../src/dictionary/lookup';
import * as parser from '../../src/dictionary/parser';
import * as meaning from '../../src/dictionary/meaning';
import { createSavedWordsStore } from '../../src/shared/saved-words';
import { Speaker } from '../../src/popup/features/pronunciation/Speaker';
import { Inflections } from '../../src/popup/components/Inflections';
import { browserI18n } from '../setup';

const controllers: { dispose(): void }[] = [];
afterEach(() => { act(() => { controllers.splice(0).forEach(controller => controller.dispose()); }); });

const drain = () => new Promise(resolve => setImmediate(resolve));
export const tick = () => act(async () => { await drain(); });
export const fallbackRuntime = () => meaning;

// Preserve the original behavioral corpus while driving real React nodes and imported services.
// The facade only translates the old harness's event calls into DOM events.
export function harness(savedState: any = {}, sessionState: any = {}, meaningLookup: any = async () => null, basicLookup: any = async () => null, locale: any = {}, sendSavedMessage?: any) {
  const requests: any[] = [], saved: any[] = [], savedMessages: any[] = [];
  const browser: any = { i18n: browserI18n(locale), storage: {
    local: { get: async () => ({ ...savedState }), set: async (value: any) => { saved.push(value); Object.assign(savedState, value); } },
    session: { get: async () => ({ ...sessionState }), set: async (value: any) => { Object.assign(sessionState, value); }, remove: async (key: string) => { delete sessionState[key]; } },
  } };
  const store = createSavedWordsStore(browser.storage.local);
  browser.runtime = { sendMessage: async (message: any) => {
    savedMessages.push(message);
    if (sendSavedMessage) return sendSavedMessage(message);
    try {
      switch (message.action) {
        case 'add': return { ok: true, ...await store.add(message.entry) };
        case 'restore': return { ok: true, ...await store.restore(message.entry) };
        case 'remove': return { ok: true, ...await store.remove(message.id) };
      }
    } catch (error: any) { return { ok: false, error: error.message, messageKey: error.messageKey }; }
  } };
  vi.stubGlobal('chrome', browser);
  const context: any = { chrome: browser, document, ...parser, ...meaning };
  context.fetch = (url: string, options: RequestInit) => new Promise(resolve => requests.push({ url, options, resolve }));
  context.parseVerbformen = (_: string, word: string, sourceUrl: string) => ({ word, lemma: word, sourceUrl, title: `Noun ${word}`, ipa: [], audio: [], inflectionTables: [], meaning: word });
  context.parseGermanSearchEntries = () => [];
  context.parseEnglishResults = () => [{ lemma: 'klein', label: 'klein', partOfSpeech: 'adjective', meaning: 'small, little', url: 'https://www.verbformen.com/declension/adjectives/klein.htm' }];
  const client = createDictionaryClient((...args) => context.fetch(...args));
  client.parseEntry = (...args) => context.parseVerbformen(...args);
  client.parseResults = (...args) => context.parseEnglishResults(...args);
  context.lookupGermanEntry = createGermanLookup({
    parseVerbformen: (...args) => context.parseVerbformen(...args),
    parseGermanSearchEntries: (...args) => context.parseGermanSearchEntries(...args),
  });
  client.lookupGerman = (...args) => context.lookupGermanEntry(...args);
  const controller = new PopupController({ browser, client, meaning: meaningLookup, translation: basicLookup });
  const savedController = new SavedWordsController(browser);
  controllers.push(controller, savedController);
  for (const observable of [controller, savedController]) {
    const subscribe = observable.subscribe;
    observable.subscribe = listener => subscribe(() => { act(listener); });
  }
  const rendered = render(<App controller={controller} saved={savedController} />);
  const action = (fn: (...args: any[]) => any) => (...args: any[]) => {
    let value: any;
    act(() => { value = fn(...args); });
    return value && typeof value.then === 'function' ? value.then(async (result: any) => { await tick(); return result; }) : value;
  };
  context.runLookup = action(controller.runLookup.bind(controller));
  context.openSavedWord = action(controller.openSavedWord.bind(controller));
  context.setMode = action(controller.setMode.bind(controller));
  context.renderGermanEntry = action(controller.showEntry.bind(controller));
  context.fetchPage = client.fetchPage;
  context.saveCurrentWord = action(() => {
    const state = controller.getSnapshot();
    return state.lookup.kind === 'entry' ? savedController.save(state.lookup.data, state.sourceUrl) : undefined;
  });
  context.speakerButton = (word: string, language: string) => renderToStaticMarkup(<Speaker word={word} language={language} controller={controller} />);
  context.renderInflections = (tables: any, partOfSpeech: string) => renderToStaticMarkup(<Inflections tables={tables} partOfSpeech={partOfSpeech} />);
  Object.defineProperty(context, 'setTimeout', { set(value) { vi.stubGlobal('setTimeout', value); } });
  const element = (selector: string): any => new Proxy({}, {
    get(_target, key) {
      const node = rendered.container.querySelector(selector) as HTMLElement | null;
      if (key === 'listeners') return {
        click: () => { act(() => { if (!node) throw new Error(`Missing node: ${selector}`); fireEvent.click(node); }); return drain(); },
        submit: () => { act(() => { fireEvent.submit(node!); }); return drain(); },
        input: () => act(() => controller.editInput((node as HTMLInputElement).value)),
      };
      if (key === 'focused') return document.activeElement === node;
      const value = node?.[key as keyof HTMLElement];
      return typeof value === 'function' ? value.bind(node) : value;
    },
    set(_target, key, value) {
      const node: any = rendered.container.querySelector(selector);
      node[key] = value;
      return true;
    },
  });
  const elements = new Proxy({}, { get: (_, selector) => element(String(selector)) });
  const buttons = (selector: string) => [...rendered.container.querySelectorAll(selector)].map((_, index) => element(`${selector}:nth-of-type(${index + 1})`));
  const indexedButtons = (attribute: string) => [...rendered.container.querySelectorAll(`[${attribute}]`)].map((_, index) => element(`[${attribute}="${index}"]`));
  const respond = (index: number) => requests[index].resolve({ ok: true, text: async () => requests[index].url === 'https://www.verbformen.com/en-de/' ? '<form><input name="w"><input name="language" value="en"></form>' : '', url: requests[index].url });
  void controller.initialize();
  void savedController.initialize();
  return { context, controller, savedController, elements: elements as any, requests, saved, savedMessages, respond, entryButton: element('[data-entry="0"]'), variantButton: element('[data-noun-variant="1"]'), sessionState, savedState, savedWordButtons: () => indexedButtons('data-saved-word'), deleteButtons: () => indexedButtons('data-delete-word'), degreeButtons: () => indexedButtons('data-degree'), choiceButtons: () => indexedButtons('data-entry-choice'), nounButtons: () => indexedButtons('data-noun-variant'), buttons, container: rendered.container };
}

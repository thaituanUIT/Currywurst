import { expect, test, vi } from 'vitest';
import { handleContextLookup, readSelectionLanguage, registerContextMenu } from '../../src/background/context-menu';
import { browserI18n } from '../setup';

test('selection language is read from the closest marked element without collecting page text', () => {
  document.body.innerHTML = '<article lang="de-AT"><span>Haus</span></article>';
  const selection = window.getSelection()!;
  const range = document.createRange();
  range.selectNodeContents(document.querySelector('span')!);
  selection.removeAllRanges();
  selection.addRange(range);
  expect(readSelectionLanguage()).toBe('de');
  selection.removeAllRanges();
});

test('a restricted page still opens a fallback popup with a fresh one-use request', async () => {
  const localSet = vi.fn(async () => {});
  const sessionSet = vi.fn(async () => {});
  const createWindow = vi.fn();
  vi.stubGlobal('chrome', {
    storage: { local: { set: localSet }, session: { set: sessionSet } },
    scripting: { executeScript: vi.fn(async () => { throw new Error('Restricted page'); }) },
    action: { openPopup: vi.fn(async () => { throw new Error('Unavailable'); }) },
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    windows: { create: createWindow },
  });
  await handleContextLookup({ menuItemId: 'german-word-lookup', selectionText: '“Haus”', editable: false }, { id: 7 } as chrome.tabs.Tab);
  expect(localSet).toHaveBeenCalledWith({ lookupWord: 'Haus' });
  expect(sessionSet).toHaveBeenCalledWith({ pendingLookup: { word: 'Haus', hint: '', createdAt: expect.any(Number) } });
  expect(createWindow).toHaveBeenCalledWith({ url: 'chrome-extension://test/popup.html', type: 'popup', width: 580, height: 400 });
});

test('worker listeners register synchronously and unrelated/empty selections do nothing', async () => {
  const installed = vi.fn(), startup = vi.fn(), clicked = vi.fn(), localSet = vi.fn();
  vi.stubGlobal('chrome', {
    i18n: browserI18n(),
    runtime: { onInstalled: { addListener: installed }, onStartup: { addListener: startup } },
    contextMenus: { onClicked: { addListener: clicked } },
    storage: { local: { set: localSet } },
  });
  registerContextMenu();
  expect(installed).toHaveBeenCalledOnce();
  expect(startup).toHaveBeenCalledOnce();
  expect(clicked).toHaveBeenCalledOnce();
  await handleContextLookup({ menuItemId: 'other', selectionText: 'Haus', editable: false });
  await handleContextLookup({ menuItemId: 'german-word-lookup', selectionText: '…', editable: false });
  expect(localSet).not.toHaveBeenCalled();
});

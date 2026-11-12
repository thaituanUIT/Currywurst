import { createSavedWordsStore } from '../shared/saved-words';
import { parseSavedWordsMessage, type SavedWordsResponse } from '../shared/messages';
import { errorMessage, isRecord, type StorageArea } from '../shared/storage';
import type { MessageKey } from '../shared/i18n';

export function createSavedWordsHandler(storage: StorageArea) {
  const store = createSavedWordsStore(storage);
  return (message: unknown, _sender: chrome.runtime.MessageSender, respond: (response: SavedWordsResponse) => void): true | undefined => {
    if (!isRecord(message) || message.type !== 'savedWords') return;
    Promise.resolve().then(() => {
      const request = parseSavedWordsMessage(message);
      switch (request.action) {
        case 'list': return store.list();
        case 'add': return store.add(request.entry);
        case 'restore': return store.restore(request.entry);
        case 'remove': return store.remove(request.id);
      }
    }).then(value => respond({ ok: true, ...value }), (error: unknown) => {
      const messageKey = isRecord(error) && typeof error.messageKey === 'string' ? error.messageKey as MessageKey : undefined;
      respond({ ok: false, error: errorMessage(error), messageKey });
    });
    return true;
  };
}

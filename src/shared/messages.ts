import type { SavedWord, SavedWordsResult } from './dictionary-types';
import type { MessageKey } from './i18n';
import { isRecord } from './storage';
import { savedWordRecord } from './saved-words';

export type SavedWordsMessage =
  | { type: 'savedWords'; action: 'list' }
  | { type: 'savedWords'; action: 'add' | 'restore'; entry: SavedWord }
  | { type: 'savedWords'; action: 'remove'; id: string };

export type SavedWordsResponse =
  | ({ ok: true } & SavedWordsResult)
  | { ok: false; error: string; messageKey?: MessageKey };

export function parseSavedWordsMessage(value: unknown): SavedWordsMessage {
  if (!isRecord(value) || value.type !== 'savedWords') throw new Error('Invalid saved-word message.');
  switch (value.action) {
    case 'list': return { type: 'savedWords', action: 'list' };
    case 'remove':
      if (typeof value.id !== 'string' || value.id.length > 1000) throw new Error('Invalid saved-word ID.');
      return { type: 'savedWords', action: 'remove', id: value.id };
    case 'add':
    case 'restore': {
      const savedAt = isRecord(value.entry) && typeof value.entry.savedAt === 'number' && Number.isFinite(value.entry.savedAt) ? value.entry.savedAt : Date.now();
      return { type: 'savedWords', action: value.action, entry: savedWordRecord(value.entry, savedAt) };
    }
    default: throw Object.assign(new Error('Unknown saved-word action.'), { messageKey: 'saved_unknown_action' });
  }
}

export function parseSavedWordsResponse(value: unknown): SavedWordsResponse {
  if (!isRecord(value)) throw new Error('Invalid saved-word response.');
  if (value.ok === false && typeof value.error === 'string') {
    return { ok: false, error: value.error, ...(typeof value.messageKey === 'string' ? { messageKey: value.messageKey as MessageKey } : {}) };
  }
  if (value.ok !== true || !Array.isArray(value.words)) throw new Error('Invalid saved-word response.');
  const normalize = (entry: unknown) => savedWordRecord(entry, isRecord(entry) && typeof entry.savedAt === 'number' && Number.isFinite(entry.savedAt) ? entry.savedAt : 0);
  return { ok: true, words: value.words.map(normalize), ...(value.removed ? { removed: normalize(value.removed) } : {}) };
}

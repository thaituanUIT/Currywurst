import type { LookupMode, PendingLookup } from '../shared/dictionary-types';
import { isRecord } from '../shared/storage';

export interface BootstrapState { word: string; mode: LookupMode; pending?: PendingLookup }

export async function readPopupBootstrap(storage: Pick<typeof chrome.storage, 'local' | 'session'>): Promise<BootstrapState> {
  const [local, session] = await Promise.all([
    storage.local.get(['lookupWord', 'lookupMode']).catch(() => ({} as Record<string, unknown>)),
    storage.session.get('pendingLookup').catch(() => ({} as Record<string, unknown>)),
  ]);
  const pending = session.pendingLookup as unknown;
  const consumed = pending ? await storage.session.remove('pendingLookup').then(() => true, () => false) : false;
  const mode = local.lookupMode === 'en-de' ? 'en-de' : 'de-en';
  const word = typeof local.lookupWord === 'string' ? local.lookupWord : '';
  if (!consumed || !isRecord(pending) || typeof pending.word !== 'string' || !pending.word.trim() || typeof pending.createdAt !== 'number') return { mode, word };
  const age = Date.now() - pending.createdAt;
  if (!Number.isFinite(age) || age < 0 || age >= 60000) return { mode, word };
  return { mode, word: pending.word, pending: { word: pending.word, createdAt: pending.createdAt, hint: typeof pending.hint === 'string' ? pending.hint : '' } };
}

import type { DictionaryEntry, SavedWord, SavedWordsResult } from '../../../shared/dictionary-types';
import { parseSavedWordsResponse, type SavedWordsMessage } from '../../../shared/messages';
import { createSavedWordsStore, savedWordRecord } from '../../../shared/saved-words';
import { errorMessage } from '../../../shared/storage';
import { t, uiError } from '../../../shared/i18n';
import { ObservableStore } from '../../store';

export interface SavedWordsState {
  words: SavedWord[];
  ready: boolean;
  busy: boolean;
  loadError: string;
  saveError: string;
  status: string;
  statusError: boolean;
  removed?: SavedWord;
}

export class SavedWordsController extends ObservableStore<SavedWordsState> {
  private sequence = 0;
  private saveGeneration = 0;
  private undoTimer?: ReturnType<typeof setTimeout>;
  private initialization?: Promise<void>;
  private reader: ReturnType<typeof createSavedWordsStore>;

  constructor(private browser: Pick<typeof chrome, 'storage' | 'runtime'>) {
    super({ words: [], ready: false, busy: false, loadError: '', saveError: '', status: '', statusError: false });
    this.reader = createSavedWordsStore(browser.storage.local);
  }

  initialize() { return this.initialization ??= this.load(); }
  clearSaveError() { this.saveGeneration++; this.update({ saveError: '' }); }

  private async request(message: SavedWordsMessage): Promise<SavedWordsResult> {
    const sequence = ++this.sequence;
    let response;
    if (message.action === 'list') response = { ok: true as const, ...await this.reader.list() };
    else {
      let raw: unknown;
      try { raw = await this.browser.runtime.sendMessage(message); }
      catch (error) {
        if (!/Could not establish connection\. Receiving end does not exist\.?/i.test(errorMessage(error))) throw error;
        throw Object.assign(new Error(t('saved_worker_unavailable')), { messageKey: 'saved_worker_unavailable' });
      }
      if (!raw) throw Object.assign(new Error(t('saved_worker_unavailable')), { messageKey: 'saved_worker_unavailable' });
      response = parseSavedWordsResponse(raw);
    }
    if (!response.ok) throw Object.assign(new Error(response.error || t('saved_access_error')), { messageKey: response.messageKey });
    if (sequence === this.sequence) this.update({ words: response.words, ready: true });
    return response;
  }

  async load() {
    const sequence = this.sequence + 1;
    try {
      await this.request({ type: 'savedWords', action: 'list' });
      if (sequence !== this.sequence) return;
      this.update({ loadError: '', ...(!this.state.removed ? { status: '', statusError: false } : {}) });
    } catch (error) {
      if (sequence !== this.sequence) return;
      const message = uiError(error);
      this.update({ loadError: message, status: message, statusError: true });
    }
  }

  async save(entry: DictionaryEntry, sourceUrl: string) {
    if (!this.state.ready || this.state.busy) return;
    const generation = this.saveGeneration;
    this.update({ busy: true, saveError: '' });
    try {
      const positiveUrl = entry.comparisonVariants?.find(variant => variant.degree === 'positive')?.url;
      await this.request({ type: 'savedWords', action: 'add', entry: savedWordRecord({ ...entry, sourceUrl: positiveUrl || entry.sourceUrl || sourceUrl }) });
    } catch (error) { if (generation === this.saveGeneration) this.update({ saveError: uiError(error) }); }
    finally { this.update({ busy: false }); }
  }

  async remove(id: string) {
    if (this.state.busy) return;
    this.update({ busy: true, status: '', statusError: false });
    try {
      const { removed } = await this.request({ type: 'savedWords', action: 'remove', id });
      if (this.disposed) return;
      if (removed) {
        clearTimeout(this.undoTimer);
        this.update({ removed, status: t('deleted_word', removed.lemma) });
        this.undoTimer = setTimeout(() => this.update({ removed: undefined }), 5000);
      }
    } catch (error) { this.update({ status: uiError(error), statusError: true }); }
    finally { this.update({ busy: false }); }
  }

  async undo() {
    if (!this.state.removed || this.state.busy) return;
    this.update({ busy: true });
    try {
      await this.request({ type: 'savedWords', action: 'restore', entry: this.state.removed });
      clearTimeout(this.undoTimer);
      this.update({ removed: undefined, status: '', statusError: false });
    } catch (error) { this.update({ status: uiError(error), statusError: true }); }
    finally { this.update({ busy: false }); }
  }

  override dispose() {
    this.sequence++;
    clearTimeout(this.undoTimer);
    super.dispose();
  }
}

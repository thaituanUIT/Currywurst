import { createDictionaryClient, type DictionaryClient } from '../../../dictionary/client';
import { fullDictionaryEntryUrl } from '../../../dictionary/lookup';
import { createBasicTranslationFallback, createEnglishMeaningFallback } from '../../../dictionary/meaning';
import { isGermanEntryMatch, mergeEntryChoices } from '../../../dictionary/parser';
import { dictionaryEntryUrl, dictionaryRequestUrl } from '../../../shared/dictionary-sources';
import type { DetailRequest, DictionaryEntry, LookupMode, LookupOptions, LookupState, LookupView, MeaningResult, SavedWord, SearchEntry, SearchResults } from '../../../shared/dictionary-types';
import { t, uiError, uiGrammarLabel } from '../../../shared/i18n';
import { readPopupBootstrap } from '../../bootstrap';
import { ObservableStore } from '../../store';
import { Pronunciation } from '../pronunciation/pronunciation';

export interface PopupState {
  input: string;
  mode: LookupMode;
  view: LookupView;
  lookup: LookupState;
  sourceUrl: string;
  audioStatus: string;
  scrollVersion: number;
}

interface PopupDependencies {
  browser: Pick<typeof chrome, 'storage'>;
  client?: DictionaryClient;
  meaning?: (entry: DictionaryEntry, signal: AbortSignal) => Promise<MeaningResult | null>;
  translation?: (word: string, signal: AbortSignal) => Promise<MeaningResult | null>;
  pronunciation?: Pronunciation;
}

export class PopupController extends ObservableStore<PopupState> {
  private sequence = 0;
  private activeController?: AbortController;
  private meaningController?: AbortController;
  private inputEdited = false;
  private tabCache = new Map<string, DictionaryEntry>();
  private initialization?: Promise<void>;
  private client: DictionaryClient;
  private findMeaning: NonNullable<PopupDependencies['meaning']>;
  private findTranslation: NonNullable<PopupDependencies['translation']>;
  private pronunciation: Pronunciation;

  constructor(private dependencies: PopupDependencies) {
    super({ input: '', mode: 'de-en', view: 'lookup', lookup: { kind: 'idle', restored: false }, sourceUrl: 'https://www.verbformen.com/', audioStatus: '', scrollVersion: 0 });
    this.client = dependencies.client || createDictionaryClient();
    this.findMeaning = dependencies.meaning || createEnglishMeaningFallback({ storage: dependencies.browser.storage.session });
    this.findTranslation = dependencies.translation || createBasicTranslationFallback({ storage: dependencies.browser.storage.session });
    this.pronunciation = dependencies.pronunciation || new Pronunciation();
  }

  initialize(): Promise<void> {
    return this.initialization ??= this.bootstrap();
  }

  private async bootstrap() {
    const restored = await readPopupBootstrap(this.dependencies.browser.storage);
    if (this.disposed || this.inputEdited || this.sequence !== 0) return;
    this.setMode(restored.mode);
    this.update({ input: restored.word });
    if (restored.pending) await this.runLookup(restored.word, null, { automatic: true, hint: restored.pending.hint });
    else this.showEmpty();
  }

  editInput(input: string) { this.inputEdited = true; this.update({ input }); }

  setMode(mode: LookupMode) {
    this.update({ mode });
    this.setSource(mode === 'en-de' ? 'https://www.verbformen.com/en-de/' : 'https://www.verbformen.com/');
  }

  toggleMode() {
    this.inputEdited = true;
    this.cancel();
    this.tabCache.clear();
    this.setMode(this.state.mode === 'de-en' ? 'en-de' : 'de-en');
    this.update({ input: '' });
    this.persist({ lookupWord: '', lookupMode: this.state.mode });
    this.showEmpty();
  }

  setView(view: LookupView) {
    this.inputEdited = true;
    if (view === 'saved') {
      this.cancel();
      if (this.state.lookup.kind === 'loading') this.showEmpty();
    }
    this.update({ view });
  }

  private persist(values: Record<string, unknown>) {
    void this.dependencies.browser.storage.local.set(values).catch(() => {});
  }

  private setSource(url: string) { this.update({ sourceUrl: dictionaryRequestUrl(url) || 'https://www.verbformen.com/' }); }
  private resetScroll() { this.update({ scrollVersion: this.state.scrollVersion + 1 }); }

  private showEmpty() {
    this.stopMeaning();
    this.update({ lookup: { kind: 'idle', restored: Boolean(this.state.input.trim()) } });
    this.resetScroll();
  }

  cancel() {
    this.sequence++;
    this.activeController?.abort();
    this.stopMeaning();
    this.pronunciation.stop();
    this.update({ audioStatus: '' });
  }

  private stopMeaning() {
    this.meaningController?.abort();
    this.meaningController = undefined;
  }

  private cacheKey(url: string): string | null {
    const accepted = fullDictionaryEntryUrl(url, 'https://www.verbformen.com/');
    if (!accepted) return null;
    const address = new URL(accepted);
    address.search = '';
    address.hash = '';
    return address.href;
  }

  private cacheEntry(data: DictionaryEntry) {
    const direct = this.cacheKey(data.sourceUrl);
    if (direct) { this.tabCache.set(direct, { ...data, sourceUrl: direct }); return; }
    const aliases: string[] = [];
    const genders = (data.variants || []).filter(entry => entry.article === data.article && entry.lemma === data.lemma);
    if (genders.length === 1) aliases.push(genders[0].url);
    const degree = data.comparisonVariants?.find(entry => data.grammarTags?.includes(entry.degree))
      || data.comparisonVariants?.find(entry => entry.form === data.word)
      || data.comparisonVariants?.find(entry => entry.degree === 'positive');
    if (degree) aliases.push(degree.url);
    const choices = (data.entryChoices || []).filter(entry => entry.lemma === data.lemma && entry.partOfSpeech === data.partOfSpeech);
    if (!aliases.length && choices.length === 1) aliases.push(choices[0].url);
    for (const url of aliases) {
      const key = this.cacheKey(url);
      if (key) this.tabCache.set(key, { ...data, sourceUrl: key });
    }
  }

  showResults(results: SearchResults) {
    this.stopMeaning();
    this.setSource(results.sourceUrl);
    this.update({ lookup: { kind: 'results', results } });
    this.resetScroll();
  }

  showEntry(data: DictionaryEntry, backState?: SearchResults, message = '') {
    this.stopMeaning();
    if (!message) this.cacheEntry(data);
    this.update({ lookup: { kind: 'entry', data, backState, message } });
    if (!data.meaning && !data.meaningState) void this.loadMeaning(data, backState, message);
  }

  private async loadMeaning(data: DictionaryEntry, backState?: SearchResults, message?: string) {
    const controller = new AbortController();
    this.meaningController = controller;
    const sequence = this.sequence;
    let meaning: MeaningResult | null = null;
    try { meaning = await this.findMeaning(data, controller.signal); } catch { /* Grammar remains usable without a definition. */ }
    if (controller.signal.aborted || this.disposed || sequence !== this.sequence || this.state.view !== 'lookup'
      || this.state.lookup.kind !== 'entry' || this.state.lookup.data !== data) return;
    this.showEntry({ ...data, ...(meaning || {}), meaningState: meaning ? 'ready' : 'unavailable' }, backState, message);
  }

  back(results: SearchResults) { this.cancel(); this.showResults(results); }

  openResult(entry: SearchEntry, results: SearchResults) {
    if (entry.data && !entry.detailUrl) {
      this.cancel();
      this.tabCache.clear();
      this.setSource(entry.url);
      this.resetScroll();
      this.showEntry(entry.data, results);
    } else void this.runLookup(entry.lemma, { entry, backState: results });
  }

  openAlternative(entry: DetailRequest['entry'] & { data?: DictionaryEntry }, data: DictionaryEntry, backState?: SearchResults, variantKind?: DetailRequest['variantKind']) {
    if (variantKind === 'entry' && entry.data && !dictionaryEntryUrl(entry.url, data.sourceUrl)) {
      this.cancel();
      this.setSource(entry.data.sourceUrl);
      this.showEntry({ ...entry.data, word: data.word, entryChoices: mergeEntryChoices(data.entryChoices) }, backState);
      return;
    }
    if (!dictionaryEntryUrl(entry.url, data.sourceUrl)) return;
    void this.runLookup(data.word, { entry, previousData: data, backState, variantKind });
  }

  openSavedWord(entry: SavedWord) {
    this.inputEdited = true;
    this.update({ view: 'lookup', input: entry.lemma });
    this.setMode('de-en');
    this.persist({ lookupWord: entry.lemma, lookupMode: 'de-en' });
    const url = dictionaryEntryUrl(entry.sourceUrl, 'https://www.verbformen.com/');
    return this.runLookup(entry.lemma, url ? { entry: { ...entry, url }, savedEntry: true } : null, { savedPartOfSpeech: entry.partOfSpeech });
  }

  play(word: string, language: string, recording = '') {
    return this.pronunciation.play(word, language, recording, audioStatus => this.update({ audioStatus }));
  }

  async runLookup(word: string, detail: DetailRequest | null = null, options: LookupOptions = {}) {
    if (!word || this.disposed) return;
    this.inputEdited = true;
    if (!detail?.previousData) this.tabCache.clear();
    const cacheKey = detail?.previousData ? this.cacheKey(detail.entry.url) : null;
    const cached = cacheKey ? this.tabCache.get(cacheKey) : undefined;
    this.update({ view: 'lookup' });
    this.cancel();
    const sequence = this.sequence;
    let translationAttempted = false;
    let controller = new AbortController();
    this.activeController = controller;
    const requestedMode = this.state.mode;
    let dictionaryTimedOut = false;
    const timeout = setTimeout(() => { dictionaryTimedOut = true; controller.abort(); }, options.automatic ? 25000 : 15000);
    const showBasicTranslation = async () => {
      translationAttempted = true;
      clearTimeout(timeout);
      this.update({ lookup: { kind: 'loading', message: t('finding_translation') } });
      const translation = await this.findTranslation(word, controller.signal);
      if (sequence !== this.sequence || !translation || this.disposed) return false;
      this.setMode('de-en');
      if (options.automatic) this.persist({ lookupMode: 'de-en' });
      const sourceUrl = `https://www.verbformen.com/?w=${encodeURIComponent(word)}&l=11`;
      this.setSource(sourceUrl);
      this.showEntry({ word, lemma: word, title: word, ...translation, basicTranslation: true, sourceUrl, ipa: [], audio: [], partOfSpeech: '', grammarTags: [], inflectionTables: [] });
      return true;
    };
    if (!detail) this.persist(options.automatic ? { lookupWord: word } : { lookupWord: word, lookupMode: requestedMode });
    this.setSource(detail?.entry.url || `https://www.verbformen.com/${requestedMode === 'en-de' ? 'en-de/' : ''}?w=${encodeURIComponent(word)}`);
    if (!cached) this.update({ lookup: { kind: 'loading', message: loadingMessage(word, detail, options, requestedMode) } });
    this.resetScroll();
    try {
      if (options.automatic && !detail) {
        const match = await this.client.detectAndLookup(word, options.hint, requestedMode, controller);
        if (sequence !== this.sequence) return;
        if (!match) {
          if (await showBasicTranslation() || sequence !== this.sequence) return;
          this.update({ lookup: { kind: 'empty', message: t('no_auto_match') } });
          return;
        }
        this.setMode(match.mode);
        this.persist({ lookupMode: match.mode });
        if ('state' in match) this.showResults(match.state);
        else { this.setSource(match.sourceUrl); this.showEntry(match.data); }
      } else if (requestedMode === 'en-de' && !detail) {
        const page = await this.client.searchEnglish(word, controller);
        const entries = this.client.parseResults(page.html, word, page.sourceUrl);
        if (sequence !== this.sequence) return;
        this.showResults({ query: word, entries, sourceUrl: page.sourceUrl });
      } else {
        let found;
        if (cached) found = { data: { ...cached, word }, sourceUrl: cached.sourceUrl };
        else if (!detail) found = await this.client.lookupGerman(word, url => this.client.fetchPage(url, controller), controller.signal);
        else {
          const page = await this.client.fetchPage(fullDictionaryEntryUrl(detail.entry.url, detail.entry.url) || detail.entry.url, controller);
          found = { data: this.client.parseEntry(page.html, word, page.sourceUrl), sourceUrl: page.sourceUrl };
        }
        if (sequence !== this.sequence) return;
        if (found?.data && options.savedPartOfSpeech) {
          const choice = found.data.entryChoices?.find(entry => entry.data && entry.partOfSpeech === options.savedPartOfSpeech);
          if (choice?.data) found.data = { ...choice.data, word, entryChoices: found.data.entryChoices };
        }
        if (detail?.previousData && !detail.variantKind && found && found.data.lemma.toLowerCase() !== detail.entry.lemma?.toLowerCase()) throw new Error(t('noun_variant_not_found'));
        if (detail?.variantKind && found && (!isGermanEntryMatch(found.data, detail.variantKind === 'entry' ? detail.entry.lemma || word : word)
          || (detail.variantKind === 'entry' && found.data.partOfSpeech !== detail.entry.partOfSpeech))) throw new Error(t('entry_unverified'));
        if (detail?.savedEntry && found && !isGermanEntryMatch(found.data, word)) throw new Error(t('saved_word_not_found'));
        if (!found) {
          if (!detail && (await showBasicTranslation() || sequence !== this.sequence)) return;
          this.update({ lookup: { kind: 'empty', message: t('no_german_match') } });
          return;
        }
        this.setSource(found.sourceUrl);
        if (detail?.previousData) {
          found.data.entryChoices = mergeEntryChoices(detail.previousData.entryChoices, found.data.entryChoices);
          if (detail.variantKind === 'comparison' && !found.data.comparisonVariants?.length) found.data.comparisonVariants = detail.previousData.comparisonVariants;
        }
        this.showEntry(found.data, detail?.backState);
      }
    } catch (error) {
      if (sequence !== this.sequence) return;
      if (!detail && !translationAttempted && (dictionaryTimedOut || !controller.signal.aborted) && (requestedMode === 'de-en' || options.automatic)) {
        if (dictionaryTimedOut) { controller = new AbortController(); this.activeController = controller; }
        try { if (await showBasicTranslation()) return; } catch { /* Preserve the original lookup error. */ }
        if (sequence !== this.sequence) return;
      }
      if (detail?.previousData) {
        this.setSource(detail.previousData.sourceUrl);
        this.showEntry(detail.previousData, detail.backState, detail.variantKind ? t('entry_load_error') : t('noun_load_error'));
        return;
      }
      this.update({ lookup: { kind: 'error', message: dictionaryTimedOut || controller.signal.aborted ? t('lookup_timeout') : uiError(error), word, detail, options } });
    } finally { clearTimeout(timeout); }
  }

  override dispose() { this.cancel(); super.dispose(); }
}

export function loadingMessage(word: string, detail: DetailRequest | null, options: LookupOptions, direction: LookupMode): string {
  if (detail?.variantKind === 'comparison') return t('loading_degree', uiGrammarLabel(detail.entry.degree));
  if (detail?.variantKind === 'entry') return t('loading_entry', uiGrammarLabel(detail.entry.partOfSpeech) || t('dictionary_type'));
  if (detail?.previousData) return t('loading_variant', detail.entry.label || detail.entry.lemma || word);
  if (detail) return t('loading_grammar', detail.entry.lemma || word);
  if (options.automatic) return t('loading_detection');
  return t(direction === 'en-de' ? 'loading_english' : 'loading_german', word);
}

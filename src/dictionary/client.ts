import { dictionaryRequestUrl } from '../shared/dictionary-sources';
import type { DictionaryEntry, DictionaryPage, LookupMode, ResolvedEntry, SearchResults } from '../shared/dictionary-types';
import { t } from '../shared/i18n';
import { lookupGermanEntry } from './lookup';
import { parseEnglishResults, parseEnglishSearchForm, parseVerbformen } from './parser';

export type DetectedLookup = { mode: LookupMode } & ({ state: SearchResults } | ResolvedEntry);

export interface DictionaryClient {
  fetchPage(url: string, controller: AbortController, options?: RequestInit): Promise<DictionaryPage>;
  searchEnglish(word: string, controller: AbortController): Promise<DictionaryPage>;
  lookupGerman: typeof lookupGermanEntry;
  parseEntry(html: string, word: string, sourceUrl: string): DictionaryEntry;
  parseResults: typeof parseEnglishResults;
  detectAndLookup(word: string, hint: string | undefined, preferredMode: LookupMode, controller: AbortController): Promise<DetectedLookup | null>;
}

export function createDictionaryClient(fetchImpl: typeof fetch = fetch): DictionaryClient {
  let englishForm: ReturnType<typeof parseEnglishSearchForm> | undefined;
  const fetchPage: DictionaryClient['fetchPage'] = async (url, controller, options = {}) => {
    if (!dictionaryRequestUrl(url)) throw new Error(t('dictionary_address_error'));
    const response = await fetchImpl(url, { ...options, headers: { Accept: 'text/html', ...options.headers }, credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
    if (!response.ok) throw Object.assign(new Error(t('dictionary_http_error', response.status)), { status: response.status });
    if (!dictionaryRequestUrl(response.url || url)) throw new Error(t('dictionary_redirect_error'));
    return { html: await response.text(), sourceUrl: response.url || url };
  };
  const searchEnglish: DictionaryClient['searchEnglish'] = async (word, controller) => {
    if (!englishForm) {
      const page = await fetchPage('https://www.verbformen.com/en-de/', controller);
      controller.signal.throwIfAborted();
      englishForm = parseEnglishSearchForm(page.html, page.sourceUrl);
    }
    const fields = new URLSearchParams(englishForm.fields);
    fields.set('w', word);
    fields.set('l', '11');
    if (englishForm.method === 'POST') return fetchPage(englishForm.action, controller, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: fields.toString() });
    const url = new URL(englishForm.action);
    for (const [key, value] of fields) url.searchParams.set(key, value);
    return fetchPage(url.href, controller);
  };
  const client: DictionaryClient = {
    fetchPage, searchEnglish, lookupGerman: lookupGermanEntry, parseEntry: parseVerbformen, parseResults: parseEnglishResults,
    async detectAndLookup(word, hint, preferredMode, controller) {
      const cache = new Map();
      const firstMode: LookupMode = /[äöüß]/i.test(word) ? 'de-en' : hint === 'en' ? 'en-de' : hint === 'de' ? 'de-en' : preferredMode;
      const directions: LookupMode[] = [firstMode, firstMode === 'de-en' ? 'en-de' : 'de-en'];
      for (const direction of directions) {
        controller.signal.throwIfAborted();
        if (direction === 'de-en') {
          const found = await client.lookupGerman(word, url => fetchPage(url, controller), controller.signal, { recover: hint === 'de', cache });
          if (found) return { mode: direction, ...found };
        } else {
          const page = await searchEnglish(word, controller);
          controller.signal.throwIfAborted();
          const entries = client.parseResults(page.html, word, page.sourceUrl);
          if (entries.length) return { mode: direction, state: { query: word, entries, sourceUrl: page.sourceUrl } };
        }
      }
      const recovered = await client.lookupGerman(word, url => fetchPage(url, controller), controller.signal, { cache });
      return recovered ? { mode: 'de-en', ...recovered } : null;
    },
  };
  return client;
}

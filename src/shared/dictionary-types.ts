export type LookupMode = 'de-en' | 'en-de';
export type LookupView = 'lookup' | 'saved';

export interface InflectionCell {
  header: boolean;
  colSpan: number;
  rowSpan: number;
}

export interface InflectionTable {
  title: string;
  group?: string;
  rows: string[][];
  cells: InflectionCell[][];
}

export interface NounVariant {
  lemma: string;
  article: string;
  label: string;
  url: string;
}

export interface ComparisonVariant {
  degree: string;
  label: string;
  form: string;
  url: string;
}

export interface EntryChoice {
  lemma: string;
  partOfSpeech: string;
  label: string;
  url: string;
  data?: DictionaryEntry;
}

export type MeaningSource =
  | { provider: 'MyMemory'; url: 'https://mymemory.translated.net/' }
  | {
      provider: 'Wiktionary';
      url: string;
      revisionId?: number;
      license: 'CC BY-SA 4.0';
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/';
    };

export interface MeaningResult {
  meaning: string;
  meaningSource: MeaningSource;
}

export interface DictionaryEntry {
  word: string;
  lemma: string;
  title: string;
  meaning: string;
  sourceUrl: string;
  partOfSpeech: string;
  article?: string;
  level?: string;
  matchedForm?: string;
  grammar?: string;
  grammarTags?: string[];
  reflexiveCases?: ('accusative' | 'dative')[];
  principalParts?: string;
  forms?: Record<string, string>;
  headwordForms?: string[];
  variants?: NounVariant[];
  comparisonVariants?: ComparisonVariant[];
  entryChoices?: EntryChoice[];
  usageNotes?: string[];
  excerpt?: string;
  ipa: string[];
  audio: string[];
  inflectionTables: InflectionTable[];
  linkOnly?: boolean;
  basicTranslation?: boolean;
  meaningSource?: MeaningSource;
  meaningState?: 'ready' | 'unavailable';
}

export interface SearchEntry extends EntryChoice {
  meaning: string;
  detailUrl?: string | null;
}

export interface SearchResults {
  query: string;
  entries: SearchEntry[];
  sourceUrl: string;
}

export interface DictionaryPage {
  html: string;
  sourceUrl: string;
}

export interface ResolvedEntry {
  data: DictionaryEntry;
  sourceUrl: string;
}

export type LoadPage = (url: string) => Promise<DictionaryPage>;
export type PageCache = Map<string, Promise<DictionaryPage | null>>;

export interface SavedWord {
  id: string;
  lemma: string;
  meaning: string;
  partOfSpeech: string;
  article: string;
  sourceUrl: string;
  savedAt: number;
  meaningSource?: MeaningSource;
}

export interface SavedWordsResult {
  words: SavedWord[];
  removed?: SavedWord;
}

export interface PendingLookup {
  word: string;
  hint: string;
  createdAt: number;
}

export interface LookupOptions {
  automatic?: boolean;
  hint?: string;
  savedPartOfSpeech?: string;
}

export interface DetailRequest {
  entry: { lemma?: string; url: string; partOfSpeech?: string; degree?: string; label?: string };
  previousData?: DictionaryEntry;
  backState?: SearchResults;
  variantKind?: 'comparison' | 'entry';
  savedEntry?: boolean;
}

export type LookupState =
  | { kind: 'idle'; restored: boolean }
  | { kind: 'loading'; message: string }
  | { kind: 'results'; results: SearchResults }
  | { kind: 'entry'; data: DictionaryEntry; backState?: SearchResults; message?: string }
  | { kind: 'empty'; message: string }
  | { kind: 'error'; message: string; word: string; detail: DetailRequest | null; options: LookupOptions };

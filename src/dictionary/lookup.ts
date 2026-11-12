import { dictionaryEntryUrl } from "../shared/dictionary-sources";
import { parseVerbformen, parseGermanSearchEntries, isGermanEntryMatch, mergeEntryChoices } from "./parser";
import type { DictionaryEntry, EntryChoice, NounVariant, LoadPage, PageCache, ResolvedEntry } from "../shared/dictionary-types";
import { analyzeGermanVerbPhrase, verbPhraseInfinitives, verbPhraseSearchForm } from './verb-structure';

// Resolve the requested word and verify its dictionary form.
// These are bounded fallbacks, not a crawl.
async function resolveGermanEntry(word: string, loadPage: LoadPage, signal: AbortSignal, { recover = true, cache = new Map() }: { recover?: boolean; cache?: PageCache } = {}, parsers: LookupParsers = defaultParsers): Promise<ResolvedEntry | null> {
  const { parseVerbformen, parseGermanSearchEntries } = parsers;
  const normalizedWord = word.normalize("NFC");
  const phrase = analyzeGermanVerbPhrase(word);
  const nounSelection = /^\p{Lu}/u.test(normalizedWord);
  const nounStems = germanNounCandidates(normalizedWord);
  const adjectiveCandidates = germanAdjectiveCandidates(word);
  const finiteVerbCandidates = germanPastTenseCandidates(word);
  const regularVerbCandidates = germanRegularVerbCandidates(word);
  // Phrases share a nine-request cap. Single-word recovery keeps its existing
  // bound, including room for lowercase adjective and noun guesses.
  const requestLimit = phrase ? 9 : 6 + Math.max(adjectiveCandidates.length, finiteVerbCandidates.length, regularVerbCandidates.length)
    + Number(!nounSelection && nounStems.length > 2);
  const withPhrase = (data: DictionaryEntry): DictionaryEntry => ({ ...data, word,
    ...(phrase?.pronoun ? { grammarTags: [...new Set([...(data.grammarTags || []), 'reflexive'])] } : {}),
  });
  const load = async (url: string) => {
    signal.throwIfAborted();
    if (!cache.has(url)) {
      if (cache.size >= requestLimit) return null;
      cache.set(url, loadPage(url).catch((error) => {
        if (error instanceof Error && "status" in error && error.status === 404) return null;
        throw error;
      }));
    }
    const page = await cache.get(url);
    signal.throwIfAborted();
    return page;
  };
  const completeEntry = async (data: DictionaryEntry, sourceUrl: string, detailUrl: string | null = null): Promise<ResolvedEntry | null> => {
    const fullUrl = fullDictionaryEntryUrl(detailUrl || sourceUrl, sourceUrl);
    if (fullUrl && fullUrl !== sourceUrl) {
      const full = await load(fullUrl);
      if (full) {
        const parsed = parseVerbformen(full.html, word, full.sourceUrl);
        if (isGermanEntryMatch(parsed, word)) return { data: withPhrase({ ...parsed, variants: mergeNounVariants(parsed, data.variants || []), entryChoices: mergeEntryChoices(parsed.entryChoices, data.entryChoices) }), sourceUrl: full.sourceUrl };
      }
    }
    return data.linkOnly ? null : { data: withPhrase(data), sourceUrl };
  };
  const inspect = async (url: string): Promise<ResolvedEntry | null> => {
    const page = await load(url);
    if (!page) return null;
    const data = parseVerbformen(page.html, word, page.sourceUrl);
    const cards = parseGermanSearchEntries(page.html, word, page.sourceUrl).sort((a, b) =>
      Number((b.lemma || b.data.lemma).toLocaleLowerCase("de-DE") === word.toLocaleLowerCase("de-DE"))
      - Number((a.lemma || a.data.lemma).toLocaleLowerCase("de-DE") === word.toLocaleLowerCase("de-DE")));
    const directMatch = isGermanEntryMatch(data, word);
    const entryChoices = mergeEntryChoices(directMatch ? data.entryChoices : [], cards.flatMap(entry => entry.data.entryChoices || []), cards.flatMap(entry => {
      const url = dictionaryEntryUrl(entry.detailUrl || entry.url, page.sourceUrl);
      const choice: EntryChoice = { lemma: entry.data.lemma, partOfSpeech: entry.data.partOfSpeech, label: `${entry.data.partOfSpeech || "Entry"} · ${entry.label || entry.data.lemma}`, url: url || page.sourceUrl };
      if (!url) choice.data = { ...entry.data, word, sourceUrl: page.sourceUrl };
      return [choice];
    }));
    if (directMatch) return completeEntry({ ...data, entryChoices }, page.sourceUrl);
    for (const card of cards) {
      const variants = cards.filter((entry) => entry.data.lemma.toLowerCase() === card.data.lemma.toLowerCase()).flatMap((entry) => {
        const article = entry.data.article || entry.label?.match(/^(der|die|das)\s/i)?.[1];
        const url = dictionaryEntryUrl(entry.detailUrl || entry.url, page.sourceUrl);
        return article && url ? [{ article, label: `${article} ${entry.data.lemma}`, lemma: entry.data.lemma, url }] : [];
      });
      const completed = await completeEntry({ ...card.data, variants: mergeNounVariants(card.data, variants) }, page.sourceUrl, card.detailUrl);
      if (!completed) continue;
      completed.data.entryChoices = mergeEntryChoices(completed.data.entryChoices, entryChoices);
      return completed;
    }
    return null;
  };
  const direct = await inspect(`https://www.verbformen.com/?w=${encodeURIComponent(normalizedWord)}&l=11`);
  if (direct || !recover) return direct;
  if (phrase) {
    const form = verbPhraseSearchForm(phrase);
    const joined = await inspect(`https://www.verbformen.com/?w=${encodeURIComponent(form)}&l=11`);
    if (joined) return joined;
    const candidates = [...new Set([...verbPhraseInfinitives(phrase), ...germanPastTenseCandidates(form), ...germanRegularVerbCandidates(form)])];
    for (const candidate of candidates) {
      const slug = verbformenSlug(candidate);
      if (!slug) continue;
      const found = await inspect(`https://www.verbformen.com/conjugation/${slug}.htm`);
      if (found) return found;
    }
    return inspect(`https://www.verbformen.com/conjugation/?w=${encodeURIComponent(form)}&l=11`);
  }
  for (const path of [nounSelection ? "declension/nouns/" : "conjugation/", "search/"]) {
    const found = await inspect(`https://www.verbformen.com/${path}?w=${encodeURIComponent(normalizedWord)}&l=11`);
    if (found) return found;
  }
  const inspectVerb = (candidate: string) => {
    const slug = verbformenSlug(candidate);
    return inspect(slug ? `https://www.verbformen.com/conjugation/${slug}.htm`
      : `https://www.verbformen.com/conjugation/?w=${encodeURIComponent(candidate)}&l=11`);
  };
  for (const candidate of nounSelection || regularVerbCandidates.length ? [] : finiteVerbCandidates) {
    const found = await inspectVerb(candidate);
    if (found) return found;
  }
  const inspectAdjective = (candidate: string) => inspect(verbformenSlug(candidate)
    ? `https://www.verbformen.com/declension/adjectives/${verbformenSlug(candidate)}.htm`
    : `https://www.verbformen.com/declension/adjectives/?w=${encodeURIComponent(candidate)}&l=11`);
  if (!nounSelection && adjectiveCandidates.length) {
    const found = await inspectAdjective(adjectiveCandidates[0]);
    if (found) return found;
  }
  // A -t form may be an adjective or a verb form. Prefer its exact adjective
  // entry, then verify plausible infinitives rather than appending to the -t.
  const remainingVerbs = [...new Set([...regularVerbCandidates, ...finiteVerbCandidates])];
  for (const candidate of !nounSelection && regularVerbCandidates.length ? remainingVerbs : []) {
    const found = await inspectVerb(candidate);
    if (found) return found;
  }
  // Query routes can miss a noun even when its dedicated page exists. Try
  // the unchanged noun before stripping endings that may be part of its stem.
  const nounCandidates = /^[\p{L}-]{2,60}$/u.test(normalizedWord)
    ? [...new Set([normalizedWord.replace(/^./u, (letter) => letter.toLocaleUpperCase("de-DE")), ...nounStems])]
    : [];
  const inspectNoun = (candidate: string) => {
    const url = verbformenSlug(candidate)
      ? `https://www.verbformen.com/declension/nouns/${verbformenSlug(candidate)}.htm`
      : `https://www.verbformen.com/declension/nouns/?w=${encodeURIComponent(candidate)}&l=11`;
    return inspect(url);
  };
  // Preserve room for the second adjective candidate before spending an extra
  // request on a third noun stem for lowercase, ambiguous selections.
  for (const candidate of nounSelection ? nounCandidates : nounCandidates.slice(0, 3)) {
    const found = await inspectNoun(candidate);
    if (found) return found;
  }
  for (const candidate of nounSelection ? remainingVerbs : []) {
    const found = await inspectVerb(candidate);
    if (found) return found;
  }
  for (const candidate of adjectiveCandidates.slice(nounSelection ? 0 : 1)) {
    const found = await inspectAdjective(candidate);
    if (found) return found;
  }
  for (const candidate of nounSelection ? [] : nounCandidates.slice(3)) {
    const found = await inspectNoun(candidate);
    if (found) return found;
  }
  for (const candidate of germanImperativeCandidates(word)) {
    const found = await inspect(`https://www.verbformen.com/conjugation/?w=${encodeURIComponent(candidate)}&l=11`);
    // inspect still validates against the ORIGINAL selection, never the guess.
    if (found) return found;
  }
  return null;
}

export function germanAdjectiveCandidates(word: string) {
  word = word.normalize("NFC");
  if (!/^[\p{L}-]{3,60}$/u.test(word)) return [];
  const value = word.normalize("NFC").toLocaleLowerCase("de-DE");
  if (value.endsWith("t")) return [value];
  const match = value.match(/^(.{2,})(en|em|er|es|e)$/u);
  if (!match) return [];
  const [, stem, ending] = match;
  const candidates = value.includes("ge") && /(?:en|t)$/.test(value) ? [value, stem] : [stem];
  // Retain at most two candidates for final-e or contracted stems and
  // comparison endings. Try a regular superlative's positive base first.
  if (stem.endsWith("st") && stem.length > 5) candidates.unshift(stem.slice(0, stem.endsWith("est") ? -3 : -2));
  else if (stem.endsWith("er") && stem.length > 4) candidates.push(stem.slice(0, -2));
  else if (/[lr]$/.test(stem)) candidates.push(`${stem.slice(0, -1)}e${stem.at(-1)}`);
  else if (ending !== "e" && !/[aeiouyäöü]$/.test(stem)) candidates.push(`${stem}e`);
  return [...new Set(candidates)].filter(candidate => candidate.length >= 2).slice(0, 2);
}

export function verbformenSlug(word: string) {
  const encoded = word.normalize("NFC").replace(/[äöüÄÖÜßẞ]/g, letter => ({
    ä: "a3", ö: "o3", ü: "u3", Ä: "A3", Ö: "O3", Ü: "U3", ß: "s5", ẞ: "S5",
  } as Record<string, string>)[letter]);
  return /^[A-Za-z0-9-]+$/.test(encoded) ? encoded : null;
}

export function germanPastTenseCandidates(word: string) {
  word = word.normalize("NFC");
  if (!/^[\p{L}]{4,60}$/u.test(word)) return [];
  const match = word.normalize("NFC").toLocaleLowerCase("de-DE").match(/^(.{2,})(?:test|tet|ten|te)$/u);
  if (!match) return [];
  const stem = match[1];
  return [infinitiveFromStem(stem)];
}

export function infinitiveFromStem(stem: string) {
  return /(?:e|el|er)$/.test(stem) ? `${stem}n` : `${stem}en`;
}

export function germanRegularVerbCandidates(word: string) {
  word = word.normalize("NFC");
  if (!/^[\p{L}]{4,60}$/u.test(word)) return [];
  const value = word.normalize("NFC").toLocaleLowerCase("de-DE");
  if (!value.endsWith("t")) return [];
  const stems = [];
  const simple = value.match(/^ge(.+)t$/u);
  // Suggest removing an internal ge- without restricting particles to a fixed
  // list. A source-listed form must still verify the original selection.
  const separated = value.match(/^(.{2,})ge(.+)t$/u);
  if (separated) stems.push(separated[1] + separated[2]);
  if (simple) stems.push(simple[1]);
  // Inseparable prefixes such as ver-/be- do not require ge-. Also retain
  // literal stems where 'ge' belongs to the verb rather than the participle.
  stems.push(value.slice(0, -1));
  return [...new Set(stems.filter(stem => stem.length >= 2).map(infinitiveFromStem))].slice(0, 2);
}

export function germanNounCandidates(word: string) {
  word = word.normalize("NFC");
  if (!/^[\p{L}-]{3,60}$/u.test(word)) return [];
  const value = word.normalize("NFC");
  const capitalize = (text: string) => text[0].toLocaleUpperCase("de-DE") + text.slice(1);
  const withoutUmlaut = (text: string) => text.replace(/[äöüÄÖÜ]/g, (letter) => ({ ä: "a", ö: "o", ü: "u", Ä: "A", Ö: "O", Ü: "U" } as Record<string, string>)[letter]);
  let stems: string[] = [];
  if (/nisse[ns]?$/i.test(value)) stems = [value.replace(/nisse[ns]?$/i, "nis")];
  else if (/innen$/i.test(value)) stems = [value.slice(0, -3)];
  else if (/ern$/i.test(value)) stems = [withoutUmlaut(value.slice(0, -1)), withoutUmlaut(value.slice(0, -3))];
  else if (/n$/i.test(value)) stems = [value.slice(0, -1), value.replace(/en$/i, ""), withoutUmlaut(value.slice(0, /en$/i.test(value) ? -2 : -1))];
  else if (/er$/i.test(value) && !/ier$/i.test(value)) stems = [withoutUmlaut(value.slice(0, -2)), value.slice(0, -2)];
  else if (/es$/i.test(value)) stems = [value.slice(0, -2), value.slice(0, -1)];
  else if (/[es]$/i.test(value)) stems = [value.slice(0, -1), withoutUmlaut(value.slice(0, -1))];
  return [...new Set(stems.filter((stem) => stem.length >= 2 && stem !== value).map(capitalize))].slice(0, 3);
}

export function mergeNounVariants(data: DictionaryEntry, extra: NounVariant[]) {
  const seen = new Set();
  return [...(data.variants || []), ...extra].filter((variant) => {
    if (!variant.lemma || variant.lemma.toLowerCase() !== data.lemma.toLowerCase()) return false;
    const key = `${variant.article}|${variant.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

export function germanImperativeCandidates(word: string) {
  word = word.normalize("NFC");
  if (!/^[\p{L}]{3,60}$/u.test(word) || /en$/i.test(word)) return [];
  const stem = word.toLocaleLowerCase("de-DE");
  return /(?:el|er)$/i.test(stem) && !/ier$/i.test(stem)
    ? [`${stem}n`, `${stem}en`]
    : [`${stem}en`, `${stem}n`];
}

export function fullDictionaryEntryUrl(href: unknown, baseUrl: string) {
  const accepted = dictionaryEntryUrl(href, baseUrl);
  if (!accepted) return null;
  const url = new URL(accepted);
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.origin === "https://www.woerter.net") url.pathname = `/${parts[0]}/${parts.at(-1)}`;
  else if (parts[0] === "conjugation") url.pathname = `/conjugation/${parts.at(-1)}`;
  else url.pathname = `/declension/${parts[1]}/${parts.at(-1)}`;
  return url.href;
}

export interface LookupParsers {
  parseVerbformen: typeof parseVerbformen;
  parseGermanSearchEntries: typeof parseGermanSearchEntries;
}
const defaultParsers: LookupParsers = { parseVerbformen, parseGermanSearchEntries };
export function createGermanLookup(parsers: LookupParsers = defaultParsers) {
  return (word: string, loadPage: LoadPage, signal: AbortSignal, options: { recover?: boolean; cache?: PageCache } = {}) => resolveGermanEntry(word, loadPage, signal, options, parsers);
}
export const lookupGermanEntry = createGermanLookup();

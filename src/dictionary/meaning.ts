import { normalizeGermanForm, parseDictionaryDocument } from './parser';
import { safeMeaningSource } from '../shared/saved-words';
import { isRecord, type StorageArea } from '../shared/storage';
import type { MeaningResult } from '../shared/dictionary-types';

interface FallbackOptions {
  fetchImpl?: typeof fetch;
  storage?: StorageArea;
  timeoutMs?: number;
}
export interface MeaningEntry { lemma: string; partOfSpeech: string; article?: string; meaning?: string }
export interface ParsedMeaning { meaning: string; related: string[] }
export interface WiktionaryPayload { parse: { title: string; text: string; revid?: number } }
interface CachedMeaning { expires: number; value: MeaningResult | null }

function wiktionaryPayload(value: unknown): WiktionaryPayload | null {
  if (!isRecord(value) || value.error || !isRecord(value.parse)) return null;
  if (typeof value.parse.title !== 'string' || typeof value.parse.text !== 'string') return null;
  return { ...value, parse: { ...value.parse, title: value.parse.title, text: value.parse.text,
    revid: typeof value.parse.revid === 'number' && Number.isInteger(value.parse.revid) && value.parse.revid > 0 ? value.parse.revid : undefined } };
}

function cachedMeanings(value: unknown): [string, CachedMeaning][] {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) => {
    if (!isRecord(item) || typeof item.expires !== 'number' || item.expires <= Date.now()) return [];
    if (item.value === null) return [[key, { expires: item.expires, value: null }] as [string, CachedMeaning]];
    if (!isRecord(item.value) || typeof item.value.meaning !== 'string' || !item.value.meaning || item.value.meaning.length > 4000) return [];
    const source = safeMeaningSource(item.value.meaningSource);
    return source ? [[key, { expires: item.expires, value: { meaning: item.value.meaning, meaningSource: source } }] as [string, CachedMeaning]] : [];
  });
}

const MEANING_LICENSE = "https://creativecommons.org/licenses/by-sa/4.0/";

export function decodeTranslationText(text: string) {
  const entities: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (entity, name) => {
    if (!name.startsWith("#")) return entities[name.toLowerCase()];
    const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
  }).replace(/\s+/g, " ").trim();
}

export function createBasicTranslationFallback({ fetchImpl = fetch, storage, timeoutMs = 4000 }: FallbackOptions = {}) {
  const cache = new Map<string, CachedMeaning>();
  return async function translateGerman(word: string, parentSignal?: AbortSignal): Promise<MeaningResult | null> {
    const text = word.normalize("NFC").trim();
    if (!text || text.length > 160 || new TextEncoder().encode(text).length > 500 || /[\u0000-\u001f\u007f]/.test(text)) return null;
    const controller = new AbortController();
    const cancel = () => controller.abort(parentSignal?.reason);
    parentSignal?.throwIfAborted();
    parentSignal?.addEventListener("abort", cancel, { once: true });
    let onAbort = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    const timer = setTimeout(() => controller.abort(new Error("Translation timed out")), timeoutMs);
    const work = async (): Promise<MeaningResult | null> => {
      if (!cache.size && storage) {
        const stored = await storage.get("translationCache").catch(() => ({}));
        const entries = cachedMeanings("translationCache" in stored ? stored.translationCache : null);
        for (const [key, item] of entries.slice(-100)) if (item?.expires > Date.now()) cache.set(key, item);
      }
      controller.signal.throwIfAborted();
      const cached = cache.get(text);
      if (cached && cached.expires > Date.now()) return cached.value;
      const url = new URL("https://api.mymemory.translated.net/get");
      url.search = new URLSearchParams({ q: text, langpair: "de|en" }).toString();
      const response = await fetchImpl(url.href, { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/json" } });
      if (response.url && new URL(response.url).origin !== url.origin) throw new Error("Unexpected translation-source redirect.");
      if (!response.ok) return null;
      const payload: unknown = await response.json();
      controller.signal.throwIfAborted();
      if (!isRecord(payload) || !isRecord(payload.responseData)) return null;
      const raw = payload.responseData.translatedText;
      if (Number(payload.responseStatus) !== 200 || payload.quotaFinished || typeof raw !== "string" || raw.length > 4000) return null;
      const meaning = decodeTranslationText(raw).normalize("NFC");
      const value: MeaningResult | null = meaning && meaning.toLocaleLowerCase("de-DE") !== text.toLocaleLowerCase("de-DE")
        ? { meaning, meaningSource: { provider: "MyMemory", url: "https://mymemory.translated.net/" } } : null;
      cache.set(text, { value, expires: Date.now() + (value ? 86400000 : 300000) });
      while (cache.size > 100) cache.delete(cache.keys().next().value!);
      if (storage) storage.set({ translationCache: Object.fromEntries(cache) }).catch(() => {});
      return value;
    };
    try { return await Promise.race([work(), aborted]); }
    catch (error) { if (parentSignal?.aborted) throw error; return null; }
    finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", cancel);
      controller.signal.removeEventListener("abort", onAbort);
    }
  };
}

export function wiktionaryTitle(href: string | null) {
  try {
    const url = new URL(href || "", "https://en.wiktionary.org");
    if (url.origin !== "https://en.wiktionary.org" || !url.pathname.startsWith("/wiki/")) return null;
    const title = decodeURIComponent(url.pathname.slice(6)).replace(/_/g, " ");
    return /^[\p{L}][\p{L} '-]{0,159}$/u.test(title) ? title : null;
  } catch { return null; }
}

export function headingSection(heading: Element, headings: Element[], root: DocumentFragment) {
  const next = headings.find(node => heading.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
  const boundary = (node: Element) => node.closest(".mw-heading") || node;
  const range = document.createRange();
  range.setStartAfter(boundary(heading));
  if (next) range.setEndBefore(boundary(next));
  else range.setEnd(root, root.childNodes.length);
  const section = range.cloneContents();
  range.detach();
  return section;
}

export function parseWiktionaryMeaning(payload: WiktionaryPayload, entry: MeaningEntry): ParsedMeaning {
  if (!payload?.parse || typeof payload.parse.text !== "string") return { meaning: "", related: [] };
  if (normalizeGermanForm(payload.parse.title) !== normalizeGermanForm(entry.lemma)) return { meaning: "", related: [] };
  const doc = parseDictionaryDocument(payload.parse.text);
  const languages = [...doc.querySelectorAll("h2")];
  const german = languages.find(node => node.id === "German" || node.querySelector('[id="German"]') || node.textContent.replace(/\[edit\]/g, "").trim() === "German");
  if (!german) return { meaning: "", related: [] };
  const section = headingSection(german, languages, doc);
  const headings = [...section.querySelectorAll("h3,h4,h5,h6")];
  const related = new Set<string>();
  const expectedGender = ({ der: "m", die: "f", das: "n" } as Record<string, string>)[entry.article || ""];
  const meanings = [];
  for (const heading of headings) {
    const type = heading.textContent.replace(/\[edit\]/g, "").trim().toLowerCase().replace(/^proper noun$/, "noun");
    if (type !== entry.partOfSpeech) continue;
    const block = headingSection(heading, headings, section);
    const line = block.querySelector(".headword-line") || block.querySelector(".headword")?.closest("p");
    const headword = line?.querySelector(".headword");
    if (!line || !headword || normalizeGermanForm(headword.textContent) !== normalizeGermanForm(entry.lemma)) continue;
    const genders = [...line.querySelectorAll(".gender")].flatMap(node => node.textContent.split(/[^mfn]+/)).filter(Boolean);
    const genderMatches = !expectedGender || genders.includes(expectedGender);
    // Only attested relationships can lead to a second page. Ordinary links
    // in definitions (e.g. the English word 'learner') are never followed.
    const links = [...block.querySelectorAll(".form-of-definition-link a, a.form-of-definition-link, .form-of-definition a[lang='de']")];
    for (const link of line.querySelectorAll("a[href]")) {
      const title = wiktionaryTitle(link.getAttribute("href"));
      const family = (value: string) => normalizeGermanForm(value).replace(/(?:er|en|e|r|n|m)$/, "");
      if (title && family(title) === family(entry.lemma)) links.push(link);
    }
    for (const link of links) {
      const title = wiktionaryTitle(link.getAttribute("href"));
      if (title && title !== entry.lemma && (entry.partOfSpeech !== "noun" || /^\p{Lu}/u.test(title))) related.add(title);
    }
    if (!genderMatches) continue;
    const lists = [...block.querySelectorAll("ol")].filter(node => !node.parentElement?.closest("li"));
    for (const list of lists) for (const item of list.children) {
      if (item.tagName !== "LI") continue;
      const copy = item.cloneNode(true) as Element;
      copy.querySelectorAll("ol,ul,dl,sup,.quotation,.usage-example,.HQToggle,.nyms-toggle").forEach(node => node.remove());
      let text = copy.textContent.replace(/\s+/g, " ").trim();
      if (/^(?:inflection|plural|singular|past participle|present participle|alternative (?:form|spelling)) of\b/i.test(text)) continue;
      if (/^(?:nominalization|female equivalent|male equivalent) of\b/i.test(text)) text = text.includes(":") ? text.slice(text.indexOf(":") + 1).trim() : "";
      if (text && text.length <= 1000) meanings.push(text);
    }
  }
  const candidates = [...related];
  if (expectedGender === "m") candidates.sort((a, b) => Number(b === `${entry.lemma}r`) - Number(a === `${entry.lemma}r`));
  return { meaning: [...new Set(meanings)].slice(0, 3).join("; "), related: candidates };
}

export function createEnglishMeaningFallback({ fetchImpl = fetch, parsePage = parseWiktionaryMeaning, storage, timeoutMs = 4000 }: FallbackOptions & { parsePage?: (payload: WiktionaryPayload, entry: MeaningEntry) => ParsedMeaning } = {}) {
  const cache = new Map<string, CachedMeaning>();
  return async function findEnglishMeaning(entry: MeaningEntry, parentSignal?: AbortSignal): Promise<MeaningResult | null> {
    if (entry.meaning || !entry.lemma || !entry.partOfSpeech) return null;
    const key = JSON.stringify([entry.lemma.normalize("NFC"), entry.partOfSpeech, entry.article || ""]);
    const controller = new AbortController();
    const cancel = () => controller.abort(parentSignal?.reason);
    if (parentSignal?.aborted) throw parentSignal.reason;
    parentSignal?.addEventListener("abort", cancel, { once: true });
    let abortListener = () => {};
    const abortPromise = new Promise<never>((_resolve, reject) => {
      abortListener = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", abortListener, { once: true });
    });
    const timer = setTimeout(() => controller.abort(new Error("Meaning lookup timed out")), timeoutMs);
    const work = async (): Promise<MeaningResult | null> => {
      if (!cache.size && storage) {
        const stored = await storage.get("meaningCache").catch(() => ({}));
        const entries = cachedMeanings("meaningCache" in stored ? stored.meaningCache : null);
        for (const [id, item] of entries.slice(-100)) if (item?.expires > Date.now()) cache.set(id, item);
      }
      controller.signal.throwIfAborted();
      const cached = cache.get(key);
      if (cached && cached.expires > Date.now()) return cached.value;
      let title: string | undefined = entry.lemma;
      const seen = new Set();
      let value: MeaningResult | null = null;
      for (let count = 0; count < 2 && title && !seen.has(title); count++) {
        seen.add(title);
        const url = new URL("https://en.wiktionary.org/w/api.php");
        url.search = new URLSearchParams({ action: "parse", page: title, prop: "text", redirects: "1", format: "json", formatversion: "2" }).toString();
        const response = await fetchImpl(url.href, { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/json" } });
        if (response.url && new URL(response.url).origin !== "https://en.wiktionary.org") throw new Error("Unexpected meaning-source redirect.");
        // An unavailable service is not evidence of an absent definition.
        // Leave it uncached so Retry can recover as soon as the service does.
        if (!response.ok) return null;
        const rawPayload: unknown = await response.json();
        const payload = wiktionaryPayload(rawPayload);
        controller.signal.throwIfAborted();
        if (!payload) return null;
        const parsed = parsePage(payload, { ...entry, lemma: title });
        if (parsed.meaning) {
          const source = new URL("https://en.wiktionary.org/w/index.php");
          source.searchParams.set("title", payload.parse.title);
          if (Number.isInteger(payload.parse.revid)) source.searchParams.set("oldid", String(payload.parse.revid));
          value = { meaning: parsed.meaning, meaningSource: { provider: "Wiktionary", url: source.href, revisionId: payload.parse.revid, license: "CC BY-SA 4.0", licenseUrl: MEANING_LICENSE } };
          break;
        }
        title = (parsed.related || []).find(candidate => !seen.has(candidate));
      }
      controller.signal.throwIfAborted();
      cache.set(key, { value, expires: Date.now() + (value ? 86400000 : 300000) });
      while (cache.size > 100) cache.delete(cache.keys().next().value!);
      if (storage) storage.set({ meaningCache: Object.fromEntries(cache) }).catch(() => {});
      return value;
    };
    try { return await Promise.race([work(), abortPromise]); }
    catch (error) { if (parentSignal?.aborted) throw error; return null; }
    finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", cancel);
      controller.signal.removeEventListener("abort", abortListener);
    }
  };
}

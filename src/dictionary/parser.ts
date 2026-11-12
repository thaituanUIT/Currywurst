import { normalizeGermanForm, expandGermanForms } from "./german-forms";
import { analyzeGermanVerbPhrase, matchesGermanVerbPhrase, matchesReflexiveVerbForm } from "./verb-structure";
import { dictionaryEntryUrl, dictionaryEntryType } from "../shared/dictionary-sources";
import type { DictionaryEntry, InflectionTable, EntryChoice, ComparisonVariant, NounVariant, SearchEntry } from "../shared/dictionary-types";

export { normalizeGermanForm, expandGermanForms } from "./german-forms";

type DictionaryRoot = Element | DocumentFragment;
type CandidateTable = InflectionTable & { node?: HTMLTableElement };

export const DICTIONARY_WORD_TYPES = "verb|noun|adjective|adverb|pronoun|article|preposition|conjunction|particle|numeral|interjection";

export function parseVerbformen(html: string, word: string, sourceUrl: string): DictionaryEntry {
  const doc = parseDictionaryDocument(html);
  const cleanText = cleanDictionaryText;
  const heading = doc.querySelector("h1");
  const title = cleanText(heading?.textContent || "") || word;
  let lemma = extractLemma(title, word);
  const main = heading?.closest("main, article") || heading?.parentElement?.parentElement || doc;
  const text = cleanText(dictionaryText(main));
  const headingIndex = text.indexOf(title);
  const entryText = headingIndex >= 0 ? text.slice(headingIndex).trim() : text;
  const audio = [
    ...main.querySelectorAll("audio[src], audio source[src], a[href]"),
  ]
    .map((node) => node.getAttribute("src") || node.getAttribute("href"))
    .filter((src) => {
      if (!src) return false;
      try {
        const url = new URL(src, sourceUrl);
        return ["https://www.verbformen.com", "https://www.woerter.net"].includes(url.origin) && !url.username && !url.password && /\.(mp3|ogg|wav|m4a)(?:$|[?#])/i.test(url.pathname + url.search);
      }
      catch { return false; }
    })
    .map((src) => new URL(src!, sourceUrl).href);
  // Feedback prompts are site UI, not dictionary content. Remove them from
  // extracted text and exclude their headings before finding section titles.
  const ipa = [...entryText.matchAll(/\/[^/\n]{1,40}\//g)]
    .map((match) => match[0])
    .filter((value) => /[ˈˌəɐɛɪɔʊʃçʁøœyɡŋ]/u.test(value))
    .slice(0, 5);
  const lines = entryText.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const summaryPattern = new RegExp(`^(?:[ABC][12]\\s*·\\s*)?(?:${DICTIONARY_WORD_TYPES}|regular|irregular|haben|sein)(?:\\s*·|$)`, "i");
  const summaryNode = [...main.querySelectorAll("p,small"), ...main.querySelectorAll("div,span")].find((node) => {
    const value = cleanText(node.textContent).replace(/\s+/g, " ");
    return value.length < 220 && summaryPattern.test(value);
  });
  const grammarLine = summaryNode ? cleanText(summaryNode.textContent) : lines.find((line) => summaryPattern.test(line)) || "";
  const { level, partOfSpeech, grammarTags } = parseGrammarSummary(grammarLine, title);
  const reflexiveCases = partOfSpeech === 'verb' ? extractReflexiveCases(main) : [];
  const comparisonVariants = partOfSpeech === "adjective" ? extractComparisonVariants(doc, sourceUrl) : [];
  const positive = comparisonVariants.find(variant => variant.degree === "positive");
  if (positive) lemma = positive.form;
  const grammar = grammarTags.join(" · ");
  const principalParts = ["verb", "adjective"].includes(partOfSpeech) ? lines.find((line) => {
    const parts = line.split("·").map((part) => part.trim());
    return parts.length === 3 && line.length < 180 && !/^[ABC][12]\b/.test(line)
      && parts.every((part) => /^[\p{L}\s()'"/⁰¹²³⁴⁵⁶⁷⁸⁹-]+$/u.test(part))
      && !/\b(?:regular|irregular|verb|noun|adjective|separable|inseparable)\b/i.test(line);
  }) || "" : "";
  const meaning = extractEnglishMeaning(doc, heading, cleanText);
  const formStart = lines.findIndex((line) => /^(?:[ABC][12]\s*·|(?:noun|verb|adjective)\s*·)/i.test(line)) + 1;
  const formLines = formStart >= 0 ? lines.slice(formStart, formStart + 8) : [];
  const article = formLines.find((line) => /^(der|die|das)\s+/i.test(line) && line.toLowerCase().includes(word.toLowerCase())) || "";
  const matchingForms = formLines.filter((line) => line.toLowerCase() === word.toLowerCase() || /^[\p{L}äöüÄÖÜß-]+$/u.test(line) && line.length > 2);
  const forms: Record<string, string> = { Article: article, Singular: matchingForms[0] || word, Plural: matchingForms[1] || "" };
  const nounArticle = partOfSpeech === "noun" ? nounArticleFromTags(grammarTags) : "";
  const headerForms = partOfSpeech === "noun" ? (formLines.find((line) => {
    const values = line.split("·");
    return values.length === 2 && values.every((value) => /^[\p{L}\s()/'"⁰¹²³⁴⁵⁶⁷⁸⁹-]+$/u.test(value.trim()));
  }) || "").split("·").map((value) => value.trim()).filter(Boolean) : [];
  const statedForms = partOfSpeech === "noun" ? extractStatedNounForms(entryText.slice(0, 2000)) : [];
  const headwordForms = [...new Set([...headerForms, ...statedForms])];
  if (nounArticle) forms.Article = `${nounArticle} ${lemma}`;
  if (partOfSpeech === "noun") {
    forms.Singular = lemma;
    forms.Genitive = headerForms[0] || statedForms[0] || "";
    forms.Plural = headerForms[1] || statedForms[1] || "";
  }
  const variants = partOfSpeech === "noun" ? extractNounVariants(doc, lemma, sourceUrl) : [];
  const usageNotes = [...new Set(lines.filter((line) => /^[⁰¹²³⁴⁵⁶⁷⁸⁹0-9]+\s+/.test(line) && /\b(?:regional|southern|austria|switzerland|colloquial|obsolete|rare|usage|depends|only)\b/i.test(line)).map((line) => line.replace(/^[⁰¹²³⁴⁵⁶⁷⁸⁹0-9]+\s+/, "")))].slice(0, 4);
  const caseLabels = /^(nom\.?|gen\.?|dat\.?|acc\.?|nominativ|genitiv|dativ|akkusativ)$/i;
  const verbLabels = /^(ich|du|er|sie|es|wir|ihr|Sie|infinitive|participle|imperative|present|imperfect|past|perfect|future|present subj\.?|imperf\.? subj\.?|infinitiv|partizip|imperativ|konjunktiv|präsens|präteritum|perfekt|futur)$/i;
  const adjectiveLabels = /^(masculine|feminine|neutral|neuter|plural|masc\.?|fem\.?|neut\.?|singular)$/i;
  const sectionHeadings = [...doc.querySelectorAll("h2,h3,h4,h5")].filter((heading) => cleanText(heading.textContent));
  const tableCandidates: CandidateTable[] = [...doc.querySelectorAll("table")].map((table) => {
    const path = headingPathFor(table, sectionHeadings);
    const rowData = [...table.rows].map((row) => [...row.cells]).filter((cells) => cells.length);
    const rows = rowData.map((cells) => cells.map((cell) => cleanText(cell.textContent).replace(/\s+/g, " ")));
    const labelRows = rows.filter((row) => caseLabels.test(row[0]) || verbLabels.test(row[0]) || adjectiveLabels.test(row[0]));
    const labels = labelRows.map((row) => row[0]);
    const isCaseTable = labels.filter((label) => caseLabels.test(label)).length >= 3;
    const verbRowCount = labels.filter((label) => /^(ich|du|er|sie|es|wir|ihr|Sie)$/i.test(label)).length;
    const hasVerbFormLabels = labels.some((label) => /^(infinitive|participle|imperative|present|imperfect|past|perfect|future|present subj\.?|imperf\.? subj\.?|infinitiv|partizip|imperativ|konjunktiv|präsens|präteritum|perfekt|futur)$/i.test(label));
    const isVerbTable = verbRowCount >= 3 || hasVerbFormLabels;
    const isAdjectiveTable = labels.some((label) => adjectiveLabels.test(label));
    const shortVerbForms = partOfSpeech === "verb" && path.some((label) => /^(?:Imperative|Infinitive(?:\/Participle| I{1,2})?|Participle(?: I{1,2})?)$/i.test(label));
    if (!isCaseTable && !isVerbTable && !isAdjectiveTable && !shortVerbForms) return null;
    const title = path.at(-1) || (isVerbTable ? "Conjugation" : "Declension");
    const group = path.slice(0, -1).join(" · ");
    const cells = rowData.map(row => row.map(cell => ({header: cell.tagName === "TH", colSpan: cell.colSpan, rowSpan: cell.rowSpan})));
    return { title, group, rows: rows.slice(0, 25), cells: cells.slice(0, 25), node: table };
  }).filter((table): table is NonNullable<typeof table> => Boolean(table));
  if (partOfSpeech === "verb") {
    tableCandidates.push(...extractNonfiniteSections(doc, sectionHeadings, tableCandidates));
  }
  const inflectionTables = deduplicateInflections(tableCandidates).map(({ node: _node, ...table }) => table);
  const matchedRow = inflectionTables.flatMap((table) => table.rows.map((row) => ({ title: table.title, row })))
    .find(({ row }) => row.some((cell) => cell.toLocaleLowerCase() === word.toLocaleLowerCase()));
  const matchedForm = matchedRow ? `${matchedRow.row[0]} · ${matchedRow.title}` : "";
  return {
    word,
    lemma,
    matchedForm,
    title,
    level: level.replace(/[·.]$/, ""),
    partOfSpeech,
    grammar,
    grammarTags,
    reflexiveCases,
    principalParts,
    meaning,
    forms,
    article: nounArticle,
    headwordForms,
    variants,
    comparisonVariants,
    entryChoices: new RegExp(`\\b(?:${DICTIONARY_WORD_TYPES})\\s+`, "i").test(title)
      ? extractWordTypeVariants(doc, lemma, partOfSpeech, sourceUrl, positive?.url || variants.find(variant => variant.article === nounArticle)?.url) : [],
    usageNotes,
    inflectionTables,
    excerpt: entryText.replace(/\s+/g, " ").slice(0, 900),
    ipa: [...new Set(ipa)],
    audio: [...new Set(audio)],
    sourceUrl,
  };
}

export function extractEnglishMeaning(doc: DictionaryRoot, heading: Element | null, cleanText: (value: string | null) => string) {
  // A comma-separated Latin alphabet list may belong to any language. Read
  // the text beside the English flag instead of guessing from punctuation.
  const headings = [...doc.querySelectorAll("h2,h3,h4,h5")];
  const isAfterHeading = (node: Element) => (!heading || Boolean(heading.compareDocumentPosition(node!) & Node.DOCUMENT_POSITION_FOLLOWING))
    && !headingPathFor(node, headings).some(title => /\b(?:examples|sentences)\b/i.test(title));
  const markers = [...doc.querySelectorAll("img[alt], img[title]")].filter((image) =>
    /^(English|Englisch)$/i.test((image.getAttribute("alt") || "").trim()) ||
    /^(English|Englisch)$/i.test((image.getAttribute("title") || "").trim()),
  );
  for (const marker of markers.filter(isAfterHeading)) {
    if (/»/.test(marker.closest("p,li")?.textContent || "")) continue;
    let container = marker.parentElement;
    for (let depth = 0; container && depth < 4; depth++, container = container.parentElement) {
      // Stop before combining an entire multilingual translation panel.
      const hasOtherLanguage = [...container.querySelectorAll("img[alt]")].some((image) => {
        const label = image.getAttribute("alt")?.trim();
        return label && !/^(English|Englisch)$/i.test(label);
      });
      if (hasOtherLanguage) break;
      const text = cleanText(container.textContent).replace(/\s+/g, " ").replace(/^(English|Englisch)\s*[:–-]?\s*/i, "").trim();
      if (text && !/^(English|Englisch)$/i.test(text)) return text;
    }
  }
  // Some entries mark the translation text with a language attribute instead.
  const englishText = [...doc.querySelectorAll('p[lang="en"], span[lang="en"], dd[lang="en"], li[lang="en"]')]
    .filter(isAfterHeading)
    .map((node) => cleanText(node.textContent).replace(/\s+/g, " "))
    .find(Boolean);
  return englishText || "";
}

export function dictionaryText(root: DictionaryRoot) {
  const copy = root.cloneNode(true) as DictionaryRoot;
  copy.querySelectorAll("script,style,noscript,nav,button,form").forEach((node) => node.remove());
  copy.querySelectorAll("br").forEach((node) => node.replaceWith(document.createTextNode("\n")));
  copy.querySelectorAll("p,div,section,li,tr,h1,h2,h3,h4,h5").forEach((node) => node.appendChild(document.createTextNode("\n")));
  return copy.textContent || "";
}

export function extractLemma(title: string, fallback: string) {
  const match = title.replace(/\s+/g, " ").match(new RegExp(`\\b(${DICTIONARY_WORD_TYPES})\\s+(.+?)(?:\\s+with plural\\b.*|\\s*⟨.*|$)`, "iu"));
  if (!match) return fallback;
  const lemma = cleanHeadword(match[2]).replace(/^(?:der|die|das)\s+/i, "");
  if (match[1].toLowerCase() !== 'verb') return lemma;
  return joinVerbLemma(lemma);
}

function joinVerbLemma(lemma: string): string {
  return /^sich\s+/i.test(lemma) ? `sich ${lemma.replace(/^sich\s+/i, '').replace(/\s+/g, '')}` : lemma.replace(/\s+/g, '');
}

export function extractReflexiveCases(root: DictionaryRoot): ('accusative' | 'dative')[] {
  const cases = new Set<'accusative' | 'dative'>();
  const headings = [...root.querySelectorAll('h2,h3,h4,h5')];
  for (const node of root.querySelectorAll('[title]')) {
    const title = node.getAttribute('title') || '';
    const match = title.match(/^with (accusative|dative) of reflexive pronoun\b/i);
    if (!match || headingPathFor(node, headings).some(title => /\b(?:examples|sentences)\b/i.test(title))) continue;
    cases.add(match[1].toLowerCase() as 'accusative' | 'dative');
  }
  return [...cases];
}

export function cleanHeadword(value: string | null) {
  return (value || "").replace(/\s*·\s*/g, "").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹„“”"]/g, "")
    .replace(/\s*<[^>]+>/g, "").replace(/\s*\((?:regelm\.?|unr\.?|regular|irregular|positive|comparative|superlative)\)/gi, "")
    .replace(/\s+/g, " ").trim();
}

export function extractComparisonVariants(doc: DictionaryRoot, sourceUrl: string): ComparisonVariant[] {
  const seen = new Set();
  return [...doc.querySelectorAll("a[href]")].flatMap(link => {
    const url = dictionaryEntryUrl(link.getAttribute("href"), sourceUrl);
    if (!url || !new URL(url).pathname.startsWith("/declension/adjectives/")) return [];
    const match = cleanHeadword(link.textContent).match(/^(positive|comparative|superlative)\s+(.+)$/i);
    if (!match) return [];
    const degree = match[1].toLowerCase();
    const form = match[2].replace(/^am\s+/, "").replace(/\s+/g, "");
    if (!/^[\p{L}-]+$/u.test(form) || seen.has(degree)) return [];
    seen.add(degree);
    return [{ degree, label: degree[0].toUpperCase() + degree.slice(1), form, url }];
  });
}

export function mergeEntryChoices(...lists: (EntryChoice[] | undefined)[]): EntryChoice[] {
  const seen = new Set();
  const adjectives = new Set();
  return lists.flatMap(list => list || []).filter(entry => {
    const key = entryChoiceKey(entry);
    const adjective = entry.partOfSpeech === "adjective" ? normalizeGermanForm(entry.lemma) : "";
    if (!key || seen.has(key) || (adjective && adjectives.has(adjective))) return false;
    seen.add(key);
    if (adjective) adjectives.add(adjective);
    return true;
  }).slice(0, 8);
}

export function entryChoiceKey(entry: EntryChoice) {
  const url = dictionaryEntryUrl(entry.url, "https://www.verbformen.com/");
  if (url) {
    const address = new URL(url);
    if (address.origin === "https://www.woerter.net") {
      const parts = address.pathname.split("/").filter(Boolean);
      address.pathname = `/${parts[0]}/${parts.at(-1)}`;
    }
    return address.href;
  }
  const data = entry.data;
  if (!data || !data.meaning || data.partOfSpeech !== entry.partOfSpeech || !isGermanEntryMatch(data, entry.lemma)) return null;
  try {
    const source = new URL(data.sourceUrl);
    if (source.origin !== "https://www.verbformen.com" || source.username || source.password) return null;
  } catch { return null; }
  return `inline:${JSON.stringify([normalizeGermanForm(data.lemma), data.partOfSpeech, data.article || "", data.meaning])}`;
}

export function extractWordTypeVariants(doc: DictionaryRoot, lemma: string, partOfSpeech: string, sourceUrl: string, canonicalUrl?: string) {
  const links = [...doc.querySelectorAll("a[href]")];
  const choices = links.flatMap(link => {
    const url = dictionaryEntryUrl(link.getAttribute("href"), sourceUrl);
    const match = cleanHeadword(link.textContent).match(new RegExp(`^(${DICTIONARY_WORD_TYPES})\\s+(.+)$`, "i"));
    if (!url || !match) return [];
    const type = match[1].toLowerCase();
    if (type === partOfSpeech || dictionaryEntryType(url) !== type) return [];
    const label = match[2];
    let headword = label.replace(/^(?:der|die|das)\s+/i, "").replace(/,\s*(?:der|die|das)$/i, "");
    if (type === "verb") headword = joinVerbLemma(headword);
    if (!/^[\p{L}]+(?:[ '-][\p{L}]+)*$/u.test(headword)) return [];
    const article = label.match(/(?:^|,\s*)(der|die|das)(?:\s|$)/i)?.[1];
    return [{ lemma: headword, partOfSpeech: type, label: `${type} · ${article ? `${article} ${headword}` : headword}`, url }];
  });
  const ownUrl = [canonicalUrl, sourceUrl].map(url => dictionaryEntryUrl(url, sourceUrl))
    .find(url => url && dictionaryEntryType(url) === partOfSpeech)
    || links.map(link => ({ text: normalizeGermanForm(cleanHeadword(link.textContent)), url: dictionaryEntryUrl(link.getAttribute("href"), sourceUrl) }))
      .find(link => link.text === normalizeGermanForm(lemma) && link.url && dictionaryEntryType(link.url) === partOfSpeech)?.url;
  const own = ownUrl ? [{ lemma, partOfSpeech, label: `${partOfSpeech} · ${lemma}`, url: ownUrl }] : [];
  return mergeEntryChoices(own, choices);
}

export function parseGrammarSummary(summary: string, title: string) {
  const parts = summary.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, "").replace(/\s+/g, " ").split("·").map((part) => part.replace(/^\s*<also:\s*/i, "").replace(/[<>]/g, "").trim()).filter(Boolean);
  const level = parts.find((part) => /^[ABC][12]$/.test(part)) || "";
  const partOfSpeech = title.match(new RegExp(`\\b(${DICTIONARY_WORD_TYPES})\\s+`, "i"))?.[1]?.toLowerCase()
    || parts.find((part) => new RegExp(`^(${DICTIONARY_WORD_TYPES})$`, "i").test(part))?.toLowerCase() || "";
  // Accept grammar labels, never arbitrary paragraphs that happen to contain
  // the word 'verb' and a separable-word marker.
  const grammarTags = [...new Set(parts.filter((part) => /^(?:irregular|regular|haben|sein|separable|inseparable|not separable|masculine|feminine|neutral|neuter|strong|weak|mixed|positive|comparative|superlative|not comparable|comparable|indeclinable|reflexive|transitive|intransitive|passive|only singular|only plural|personal pronoun|reflexive pronoun|possessive|relative|demonstrative|interrogative|indefinite|definite|coordinating|subordinating|accusative|dative|genitive)$/i.test(part)))];
  return { level, partOfSpeech, grammarTags };
}

export function headingPathFor(node: Node, headings: Element[]) {
  const path: { level: number; text: string }[] = [];
  for (const heading of headings) {
    if (heading !== node && !(heading.compareDocumentPosition(node!) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    const text = cleanDictionaryText(heading.textContent).replace(/\s+/g, " ");
    if (!text || text.length > 100) continue;
    const level = Number(heading.tagName.slice(1));
    while (path.length && path.at(-1)!.level >= level) path.pop();
    path.push({ level, text });
  }
  return path.map((heading) => heading.text);
}

export function extractNonfiniteSections(doc: DictionaryRoot, headings: Element[], tables: CandidateTable[]): CandidateTable[] {
  const sections: CandidateTable[] = [];
  for (const heading of headings) {
    const label = cleanDictionaryText(heading.textContent).replace(/\s+/g, " ");
    if (!/^(?:Infinitive|Participle)(?: I{1,2})?$/i.test(label)) continue;
    const nextHeading = headings.find((other) => heading.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (tables.some(({ node }) => (heading.compareDocumentPosition(node!) & Node.DOCUMENT_POSITION_FOLLOWING) && (!nextHeading || (node!.compareDocumentPosition(nextHeading) & Node.DOCUMENT_POSITION_FOLLOWING)))) continue;
    const range = document.createRange();
    range.setStartAfter(heading);
    if (nextHeading) range.setEndBefore(nextHeading);
    else range.setEnd(doc, doc.childNodes.length);
    const values = [...new Set(dictionaryText(range.cloneContents()).split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => /^[\p{L}-]+(?:\s+[\p{L}-]+){0,3}$/u.test(line) && !/^(?:Definitions|Rules|Resources|Video|PDF|Our|Handy|The|Infinitive|Participle)\b/i.test(line)))].slice(0, 2);
    range.detach();
    if (!values.length) continue;
    const path = headingPathFor(heading, headings);
    sections.push({ title: label, group: path.slice(0, -1).join(" · "), rows: values.map((value) => [value]), cells: values.map(() => [{ header: false, colSpan: 1, rowSpan: 1 }]) });
  }
  return sections;
}

export function deduplicateInflections<T extends InflectionTable>(tables: T[]): T[] {
  const detailedRows = new Set(tables.filter((table) => table.group).map((table) => JSON.stringify(table.rows)));
  const seen = new Set();
  return tables.filter((table) => {
    const rows = JSON.stringify(table.rows);
    if (!table.group && detailedRows.has(rows)) return false;
    const signature = JSON.stringify([table.group || "", table.title, table.rows]);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}


export function parseDictionaryDocument(html: string) {
  // Strip executable markup before parsing. The extension CSP blocks inline
  // event handlers, and none of the page's scripts are needed for text lookup.
  const safeHtml = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "");
  const template = document.createElement("template");
  template.innerHTML = safeHtml;
  return template.content;
}

export function cleanDictionaryText(value: string | null) {
  return (value || "").replace(/Do\s+you\s+like\s+the\s+following\s+translation\s*\?/gi, "").trim();
}

export function englishGlossMatches(gloss: string, query: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/^to\s+/, "").replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
  const needle = normalize(query);
  return Boolean(needle) && gloss.split(/[,;]+/).some((sense) => normalize(sense) === needle);
}

export function isGermanEntryMatch(entry: Partial<DictionaryEntry>, word: string) {
  const knownTitle = new RegExp(`\\b(?:${DICTIONARY_WORD_TYPES})\\s+`, "i").test(entry.title || "");
  if (!knownTitle || (!entry.meaning && !entry.inflectionTables?.length && !dictionaryEntryUrl(entry.sourceUrl, "https://www.verbformen.com/"))) return false;
  const query = normalizeGermanForm(word);
  if (!query) return false;
  const verb = entry.partOfSpeech === "verb" || /\bverb\s/i.test(entry.title || "");
  const phrase = analyzeGermanVerbPhrase(word);
  if (phrase) return verb && matchesGermanVerbPhrase(entry, phrase);
  if (verb && matchesReflexiveVerbForm(entry, word)) return true;
  const auxiliary = /^(?:hab(?:e|en|t|est|et)|hast|hat|hatt(?:e|est|et|en)|hätt(?:e|est|et|en)|bin|bist|ist|sind|seid|sei(?:est|et|en)?|war(?:st|t|en)?|wär(?:e|est|et|en)|werd(?:e|en|et)|wirst|wird|wurd(?:e|est|et|en)|würd(?:e|est|et|en)|sein)$/i;
  const withoutAuxiliaries = (form: string) => {
    const words = form.split(" ");
    return words.length > 1 ? words.filter(word => !auxiliary.test(word)).join(" ") : form;
  };
  if (expandGermanForms((entry.lemma || "")).includes(query)) return true;
  if ((entry.comparisonVariants || []).some(variant => expandGermanForms(variant.form).includes(query))) return true;
  if ((entry.headwordForms || []).some((form) => expandGermanForms(form).includes(query))) return true;
  if ((entry.principalParts || "").split("·").some((part) => expandGermanForms(part).some((form) => {
    const lexical = verb ? withoutAuxiliaries(form) : form.replace(/^am\s+/, "");
    if (form === query || lexical === query) return true;
    const words = lexical.split(" ");
    const lemma = normalizeGermanForm(entry.lemma);
    return verb && words.length === 2 && lemma !== words[1] && lemma.startsWith(words[1]) && words[1] + words[0] === query;
  }))) return true;
  return (entry.inflectionTables || []).some((table) => table.rows.some((row, rowIndex) => {
    if (table.cells?.[rowIndex]?.length && table.cells[rowIndex].every(cell => cell.header)) return false;
    // Labels, articles, and subjects identify a row; they are not evidence that
    // this entry is an inflection of the selected word.
    const label = /^(?:nom\.?|gen\.?|dat\.?|acc\.?|nominativ|genitiv|dativ|akkusativ|masc\.?|fem\.?|neut\.?|masculine|feminine|neutral|neuter|plural|singular|present|past|perfect|infinitive|participle|imperative)$/i;
    const subject = /^(?:ich|du|er(?:\/sie\/es)?|sie|es|wir|ihr|mich|dich|sich|uns|euch|mir|dir|\((?:du|ihr|sie|wir)\))$/i;
    let values = row.filter((cell, index) => !(index === 0 && label.test(normalizeGermanForm(cell))) && !(verb && subject.test(normalizeGermanForm(cell))));
    const declined = entry.partOfSpeech === "noun" || entry.partOfSpeech === "adjective" || /\b(?:noun|adjective)\s/i.test(entry.title || "");
    if (declined && values.length > 1 && expandGermanForms(values[0]).every(form => /^(?:d(?:er|ie|as|es|em|en)|(?:k?ein|mein|dein|sein|ihr|unser|euer)(?:e|er|es|em|en)?)$/i.test(form))) values = values.slice(1);
    if (expandGermanForms(values.join(" ")).includes(query)) return true;
    // Preserve the meaning-bearing particle when comparing separated verbs.
    const last = normalizeGermanForm(values.at(-1) || "");
    const lemma = normalizeGermanForm(entry.lemma);
    const particle = verb && values.length >= 2 && /^[\p{L}-]+$/u.test(last) && lemma !== last && lemma.startsWith(last) ? last : "";
    const matchesForm = (form: string) => particle ? query === particle + form || query === `${form} ${particle}` : query === form;
    const lexicalValues = particle ? values.slice(0, -1) : values;
    if (lexicalValues.some(cell => expandGermanForms(cell).some(form => {
      if (verb && values.length > 1 && auxiliary.test(form)) return false;
      return matchesForm(verb ? withoutAuxiliaries(form) : form);
    }))) return true;
    if (!verb) return false;
    // Accept a shortened du-imperative only when the source explicitly lists
    // that imperative. Do not drop mandatory e in arbeite, rede, atme, etc.
    const imperative = /imperativ/i.test(`${table.group || ""} ${table.title}`);
    if (!imperative || !row.some((cell) => /^(?:\(du\)|du)$/i.test(cell.trim()))) return false;
    const imperativeForm = /^du$/i.test(row[0].trim()) ? row[1] || "" : row[0];
    return expandGermanForms(imperativeForm).some((form) => {
      if (!form.endsWith("e")) return false;
      const stem = form.slice(0, -1);
      return matchesForm(stem) && !/(?:[dt]|[bcdfghjklpqstvwxz][mn])$/i.test(stem);
    });
  }));
}

export function parseEnglishSearchForm(html: string, sourceUrl: string) {
  const doc = parseDictionaryDocument(html);
  const form = [...doc.querySelectorAll("form")].find((node) => node.querySelector('[name="w"]'));
  const fields: [string, string][] = [];
  if (form) {
    for (const control of form.querySelectorAll<HTMLInputElement>("input[name], select[name]")) {
      const type = (control.getAttribute("type") || "text").toLowerCase();
      if (control.disabled || ["submit", "button", "reset", "image"].includes(type)) continue;
      if (["checkbox", "radio"].includes(type) && !control.checked) continue;
      fields.push([control.getAttribute("name")!,  control.value || ""]);
    }
  }
  const action = new URL(form?.getAttribute("action") || sourceUrl, sourceUrl);
  if (action.origin !== "https://www.verbformen.com") throw Object.assign(new Error("Unexpected dictionary search address."), { messageKey: "dictionary_search_address_error" });
  return { action: action.href, method: form?.getAttribute("method")?.toUpperCase() === "POST" ? "POST" : "GET", fields };
}

export function parseEnglishResults(html: string, query: string, sourceUrl: string): SearchEntry[] {
  const doc = parseDictionaryDocument(html);
  const heading = doc.querySelector("h1");
  const linksIn = (node: Element) => [...node.querySelectorAll("a[href]")].map((link) => ({ link, url: dictionaryEntryUrl(link.getAttribute("href"), sourceUrl) })).filter((entry) => entry.url);
  const markers = [...doc.querySelectorAll('img[alt], img[title], p[lang="en"], span[lang="en"]')].filter((node) =>
    node.getAttribute("lang") === "en" || /^(English|Englisch)$/i.test(node.getAttribute("alt") || node.getAttribute("title") || ""),
  ).filter((node) => !heading || Boolean(heading.compareDocumentPosition(node!) & Node.DOCUMENT_POSITION_FOLLOWING));
  const results: SearchEntry[] = [];
  const seen = new Set();
  for (const marker of markers) {
    let card = marker.parentElement;
    for (let depth = 0; card && depth < 7; depth++, card = card.parentElement) {
      const links = linksIn(card);
      const uniqueUrls = new Set(links.map((entry) => entry.url));
      if (!uniqueUrls.size) continue;
      if (uniqueUrls.size > 4) break;
      const gloss = extractEnglishMeaning(card, null, cleanDictionaryText);
      if (!englishGlossMatches(gloss, query)) break;
      // Entries link their German headword to its conjugation/declension page.
      const candidate = links.find(({ link }) => /^[\p{L}\s·'-]+(?:,\s*(?:der|die|das))?$/u.test(link.textContent.trim()));
      if (!candidate) continue;
      const text = cleanDictionaryText(card.textContent).replace(/\s+/g, " ");
      const pos = text.match(new RegExp(`\\b(${DICTIONARY_WORD_TYPES})\\b`, "i"))?.[1]?.toLowerCase() || "";
      const label = candidate.link.textContent.replace(/·/g, "").replace(/\s+/g, " ").trim();
      const lemma = label.replace(/^(?:der|die|das)\s+/i, "").replace(/,\s*(?:der|die|das)$/i, "");
      const article = pos === "noun" ? text.match(/\b(der|die|das)\b/)?.[1] || (text.includes("feminine") ? "die" : text.includes("masculine") ? "der" : /\b(neutral|neuter)\b/.test(text) ? "das" : "") : "";
      const signature = `${candidate.url}|${pos}|${lemma}|${article}|${gloss}`;
      if (!seen.has(signature)) {
        results.push({ lemma, label: article ? `${article} ${lemma}` : lemma, partOfSpeech: pos, meaning: gloss, url: candidate.url! });
        seen.add(signature);
      }
      break;
    }
  }
  for (const entry of parseSearchCards(html, sourceUrl)) {
    const signature = `${entry.url}|${entry.partOfSpeech}|${entry.lemma}|${entry.data?.article || ""}|${entry.meaning}`;
    if (englishGlossMatches(entry.meaning, query) && !seen.has(signature)) {
      results.push(entry);
      seen.add(signature);
    }
  }
  // A search with one match can redirect straight to the German entry.
  if (!results.length && new RegExp(`\\b(?:${DICTIONARY_WORD_TYPES})\\s+`, "i").test(heading?.textContent || "")) {
    const entry = parseVerbformen(html, query, sourceUrl);
    if (englishGlossMatches(entry.meaning, query)) {
      results.push({ lemma: entry.lemma, label: entry.forms?.Article || entry.lemma, partOfSpeech: entry.partOfSpeech, meaning: entry.meaning, url: dictionaryEntryUrl(sourceUrl, sourceUrl) || `https://www.verbformen.com/?w=${encodeURIComponent(entry.lemma)}` });
    }
  }
  return results;
}

export function searchCardSummaries(doc: DictionaryRoot) {
  const summaryPattern = new RegExp(`^(?:[ABC][12]\\s*·\\s*)?(?:${DICTIONARY_WORD_TYPES})(?:\\s*·|$)`, "i");
  const text = (node: Element) => cleanDictionaryText(node.textContent).replace(/\s+/g, " ");
  const normalized = (node: Element) => text(node).replace(/^[ABC][12]\s*·\s*/i, "");
  const candidates = [...doc.querySelectorAll("p,small")].filter(node => text(node).length < 220 && summaryPattern.test(text(node)));
  // A paragraph and its nested small element can describe the same summary.
  // Keep the outer equivalent node (and its CEFR level), not two candidates.
  return candidates.filter(node => !candidates.some(other => other !== node && node.contains(other) && normalized(node) !== normalized(other))
    && !candidates.some(other => other !== node && other.contains(node) && normalized(node) === normalized(other)));
}

export function searchCardSections(doc: DictionaryRoot) {
  const summaries = searchCardSummaries(doc);
  return summaries.map((summary, index) => {
    const range = document.createRange();
    range.setStartBefore(summary);
    if (summaries[index + 1]) range.setEndBefore(summaries[index + 1]);
    else range.setEnd(doc, doc.childNodes.length);
    const template = document.createElement("template");
    template.innerHTML = "<section></section>";
    const card = template.content.firstElementChild!;
    card.appendChild(range.cloneContents());
    range.detach();
    return { summary, card };
  });
}

export function parseSearchCards(html: string, sourceUrl: string): SearchEntry[] {
  const doc = parseDictionaryDocument(html);
  const cards: SearchEntry[] = [];
  const seen = new Set();
  for (const { summary, card } of searchCardSections(doc)) {
    const meaning = extractEnglishMeaning(card, null, cleanDictionaryText);
    const summaryText = cleanDictionaryText(summary.textContent).replace(/\s+/g, " ");
    const lines = dictionaryText(card).split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
    const index = lines.findIndex((line) => line === summaryText);
    if (index < 0 || !lines[index + 1]) continue;
    const rawLabel = cleanHeadword(lines[index + 1]);
    const lemma = rawLabel.replace(/^(?:der|die|das)\s+/i, "").replace(/,\s*(?:der|die|das)$/i, "").replace(/\s*·\s*/g, "");
    if (!/^[\p{L}]+(?:[ '-][\p{L}]+)*$/u.test(lemma)) continue;
    const metadata = parseGrammarSummary(summaryText, "");
    const type = metadata.partOfSpeech;
    if (!type) continue;
    const encode = (value: string) => value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" } as Record<string, string>)[char]);
    const entryHtml = `<main><h1>German ${type} ${encode(lemma)}</h1>${card.outerHTML}</main>`;
    const data = parseVerbformen(entryHtml, lemma, sourceUrl);
    const links = [...card.querySelectorAll("a[href]")].map((link) => ({ text: normalizeGermanForm(cleanHeadword(link.textContent)), url: dictionaryEntryUrl(link.getAttribute("href"), sourceUrl) })).filter((entry) => entry.url);
    const urls = [...new Set(links.map((entry) => entry.url))];
    const detailUrl = links.find((entry) => entry.text === normalizeGermanForm(lemma) || entry.text.endsWith(` ${normalizeGermanForm(lemma)}`))?.url || (urls.length === 1 ? urls[0] : null);
    if (!meaning && !detailUrl && !data.inflectionTables.length) continue;
    const article = type === "noun" ? rawLabel.match(/\b(der|die|das)\b/i)?.[1] || (metadata.grammarTags.includes("feminine") ? "die" : metadata.grammarTags.includes("masculine") ? "der" : metadata.grammarTags.some((tag) => /^(neutral|neuter)$/.test(tag)) ? "das" : "") : "";
    const url = detailUrl || sourceUrl;
    const signature = `${type}|${lemma}|${article}|${detailUrl || ""}|${meaning}`;
    if (!seen.has(signature)) {
      cards.push({ lemma, label: article ? `${article} ${lemma}` : lemma, partOfSpeech: type, meaning, url, detailUrl, data });
      seen.add(signature);
    }
  }
  return cards;
}

export function parseGermanSearchEntries(html: string, query: string, sourceUrl: string): (SearchEntry & { data: DictionaryEntry })[] {
  const cards = parseSearchCards(html, sourceUrl) as (SearchEntry & { data: DictionaryEntry })[];
  const seen = new Set(cards.map(entry => entry.detailUrl).filter(Boolean));
  const doc = parseDictionaryDocument(html);
  for (const link of doc.querySelectorAll("a[href]")) {
    const url = dictionaryEntryUrl(link.getAttribute("href"), sourceUrl);
    if (!url || seen.has(url)) continue;
    const type = dictionaryEntryType(url);
    const label = cleanHeadword(link.textContent).replace(new RegExp(`^(?:${DICTIONARY_WORD_TYPES})\\s+`, "i"), "");
    const lemma = label.replace(/^(?:der|die|das)\s+/i, "").replace(/,\s*(?:der|die|das)$/i, "");
    if (normalizeGermanForm(lemma) !== normalizeGermanForm(query)) continue;
    const encoded = lemma.replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" } as Record<string, string>)[char]);
    const data = parseVerbformen(`<h1>German ${type} ${encoded}</h1>`, query, url);
    cards.push({ lemma, label, partOfSpeech: type, meaning: "", url, detailUrl: url, data: { ...data, linkOnly: true } });
    seen.add(url);
  }
  return cards.filter(entry => isGermanEntryMatch({ ...entry.data, sourceUrl: entry.detailUrl || entry.url }, query));
}

export function nounArticleFromTags(tags: string[] = []) {
  for (const tag of tags) {
    if (tag === "feminine") return "die";
    if (tag === "masculine") return "der";
    if (tag === "neutral" || tag === "neuter") return "das";
  }
  return "";
}

export function extractStatedNounForms(text: string) {
  const match = text.replace(/\s+/g, " ").match(/\bgenitive singular\s+["“„]?([\p{L}()/'’-]+)["”]?\s+and\s+nominative plural\s+["“„]?([\p{L}()/'’-]+)["”]?/iu);
  return match ? [match[1], match[2]] : [];
}

export function nounVariantArticle(label: string | null, lemma: string) {
  const text = (label || "").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹„“”"]/g, "").replace(/\s+/g, " ").trim();
  const escaped = lemma.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`(?:^|[\\s,])${escaped}\\s*,\\s*(der|die|das)\\b`, "iu"))?.[1]?.toLowerCase()
    || text.match(new RegExp(`(?:^|[\\s,])(der|die|das)\\s+${escaped}(?=$|[\\s,])`, "iu"))?.[1]?.toLowerCase() || "";
}

export function extractNounVariants(doc: DictionaryRoot, lemma: string, sourceUrl: string): NounVariant[] {
  const seen = new Set();
  return [...doc.querySelectorAll("a[href]")].flatMap((link) => {
    const url = dictionaryEntryUrl(link.getAttribute("href"), sourceUrl);
    if (!url || !new URL(url).pathname.startsWith("/declension/nouns/")) return [];
    const label = link.cloneNode(true) as Element;
    label.querySelectorAll("sup").forEach((node) => node.remove());
    const article = nounVariantArticle(label.textContent, lemma);
    if (!article) return [];
    const key = `${article}|${url}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ article, label: `${article} ${lemma}`, lemma, url }];
  }).slice(0, 8);
}


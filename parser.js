const DICTIONARY_WORD_TYPES = "verb|noun|adjective|adverb|pronoun|article|preposition|conjunction|particle|numeral|interjection";

function parseVerbformen(html, word, sourceUrl) {
  const doc = parseDictionaryDocument(html);
  const cleanText = cleanDictionaryText;
  const heading = doc.querySelector("h1");
  const title = cleanText(heading?.textContent || "") || word;
  const lemma = extractLemma(title, word);
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
        return url.origin === "https://www.verbformen.com" && /\.(mp3|ogg|wav|m4a)(?:$|[?#])/i.test(url.pathname + url.search);
      }
      catch { return false; }
    })
    .map((src) => new URL(src, sourceUrl).href);
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
  const matchingForms = formLines.filter((line) => line.toLowerCase() === word.toLowerCase() || /^[\p{L}äöüÄÖÜß-]+$/.test(line) && line.length > 2);
  const forms = { Article: article, Singular: matchingForms[0] || word, Plural: matchingForms[1] || "" };
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
  const tableCandidates = [...doc.querySelectorAll("table")].map((table) => {
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
  }).filter(Boolean);
  if (partOfSpeech === "verb") {
    tableCandidates.push(...extractNonfiniteSections(doc, sectionHeadings, tableCandidates));
  }
  const inflectionTables = deduplicateInflections(tableCandidates).map(({ node, ...table }) => table);
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
    principalParts,
    meaning,
    forms,
    article: nounArticle,
    headwordForms,
    variants,
    usageNotes,
    inflectionTables,
    excerpt: entryText.replace(/\s+/g, " ").slice(0, 900),
    ipa: [...new Set(ipa)],
    audio: [...new Set(audio)],
    sourceUrl,
  };
}

function extractEnglishMeaning(doc, heading, cleanText) {
  // A comma-separated Latin alphabet list may belong to any language. Read
  // the text beside the English flag instead of guessing from punctuation.
  const isAfterHeading = (node) => !heading || Boolean(heading.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
  const markers = [...doc.querySelectorAll("img[alt], img[title]")].filter((image) =>
    /^(English|Englisch)$/i.test((image.getAttribute("alt") || "").trim()) ||
    /^(English|Englisch)$/i.test((image.getAttribute("title") || "").trim()),
  );
  for (const marker of markers.filter(isAfterHeading)) {
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

function dictionaryText(root) {
  const copy = root.cloneNode(true);
  copy.querySelectorAll("script,style,noscript,nav,button,form").forEach((node) => node.remove());
  copy.querySelectorAll("br").forEach((node) => node.replaceWith(document.createTextNode("\n")));
  copy.querySelectorAll("p,div,section,li,tr,h1,h2,h3,h4,h5").forEach((node) => node.appendChild(document.createTextNode("\n")));
  return copy.textContent || "";
}

function extractLemma(title, fallback) {
  const match = title.replace(/\s+/g, " ").match(new RegExp(`\\b(${DICTIONARY_WORD_TYPES})\\s+(.+?)(?:\\s+with plural\\b.*|\\s*⟨.*|$)`, "iu"));
  if (!match) return fallback;
  const lemma = match[2].replace(/\s*·\s*/g, "").replace(/^(?:der|die|das)\s+/i, "").trim();
  return match[1].toLowerCase() === "verb" ? lemma.replace(/\s+/g, "") : lemma;
}

function parseGrammarSummary(summary, title) {
  const parts = summary.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, "").replace(/\s+/g, " ").split("·").map((part) => part.replace(/^\s*<also:\s*/i, "").replace(/[<>]/g, "").trim()).filter(Boolean);
  const level = parts.find((part) => /^[ABC][12]$/.test(part)) || "";
  const partOfSpeech = title.match(new RegExp(`\\b(${DICTIONARY_WORD_TYPES})\\s+`, "i"))?.[1]?.toLowerCase()
    || parts.find((part) => new RegExp(`^(${DICTIONARY_WORD_TYPES})$`, "i").test(part))?.toLowerCase() || "";
  // Accept grammar labels, never arbitrary paragraphs that happen to contain
  // the word 'verb' and a separable-word marker.
  const grammarTags = [...new Set(parts.filter((part) => /^(?:irregular|regular|haben|sein|separable|inseparable|not separable|masculine|feminine|neutral|neuter|strong|weak|mixed|positive|comparative|superlative|not comparable|comparable|indeclinable|reflexive|transitive|intransitive|passive|only singular|only plural|personal pronoun|reflexive pronoun|possessive|relative|demonstrative|interrogative|indefinite|definite|coordinating|subordinating|accusative|dative|genitive)$/i.test(part)))];
  return { level, partOfSpeech, grammarTags };
}

function headingPathFor(node, headings) {
  const path = [];
  for (const heading of headings) {
    if (heading !== node && !(heading.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    const text = cleanDictionaryText(heading.textContent).replace(/\s+/g, " ");
    if (!text || text.length > 100) continue;
    const level = Number(heading.tagName.slice(1));
    while (path.length && path.at(-1).level >= level) path.pop();
    path.push({ level, text });
  }
  return path.map((heading) => heading.text);
}

function extractNonfiniteSections(doc, headings, tables) {
  const sections = [];
  for (const heading of headings) {
    const label = cleanDictionaryText(heading.textContent).replace(/\s+/g, " ");
    if (!/^(?:Infinitive|Participle)(?: I{1,2})?$/i.test(label)) continue;
    const nextHeading = headings.find((other) => heading.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (tables.some(({ node }) => (heading.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) && (!nextHeading || (node.compareDocumentPosition(nextHeading) & Node.DOCUMENT_POSITION_FOLLOWING)))) continue;
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

function deduplicateInflections(tables) {
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


function parseDictionaryDocument(html) {
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

function cleanDictionaryText(value) {
  return value.replace(/Do\s+you\s+like\s+the\s+following\s+translation\s*\?/gi, "").trim();
}

function englishGlossMatches(gloss, query) {
  const normalize = (value) => value.toLowerCase().replace(/^to\s+/, "").replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
  const needle = normalize(query);
  return Boolean(needle) && gloss.split(/[,;]+/).some((sense) => normalize(sense) === needle);
}

function normalizeGermanForm(value) {
  return String(value).normalize("NFC").toLocaleLowerCase("de-DE")
    .replace(/[·⁰¹²³⁴⁵⁶⁷⁸⁹]/g, "").replace(/[„“”"']/g, "").replace(/\s+/g, " ").trim();
}

function expandGermanForms(value) {
  let forms = [normalizeGermanForm(value).replace(/\((?:du|ihr|sie|wir)\)/gi, "").trim()];
  // Parentheses indicate optional letters: geh(e), aß(es)t, and(e)r(e)n.
  for (let depth = 0; depth < 5 && forms.some((form) => /\([\p{L}]+\)/u.test(form)); depth++) {
    forms = forms.flatMap((form) => {
      const match = form.match(/\(([\p{L}]+)\)/u);
      return match ? [form.replace(match[0], ""), form.replace(match[0], match[1])] : [form];
    }).slice(0, 32);
  }
  return [...new Set(forms.flatMap((form) => form.split(/\s*[/;]\s*/)).map((form) => form.trim()).filter(Boolean))];
}

function isGermanEntryMatch(entry, word) {
  const knownTitle = new RegExp(`\\b(?:${DICTIONARY_WORD_TYPES})\\s+`, "i").test(entry.title || "");
  if (!knownTitle || (!entry.meaning && !entry.inflectionTables?.length)) return false;
  const query = normalizeGermanForm(word);
  if (!query) return false;
  if (expandGermanForms(entry.lemma).includes(query)) return true;
  if ((entry.headwordForms || []).some((form) => expandGermanForms(form).includes(query))) return true;
  if ((entry.principalParts || "").split("·").some((part) => expandGermanForms(part).some((form) => form === query || form.split(" ").includes(query)))) return true;
  return (entry.inflectionTables || []).some((table) => table.rows.some((row) => {
    if (row.some((cell) => expandGermanForms(cell).includes(query))) return true;
    if (expandGermanForms(row.join(" ")).some((form) => form === query || form.endsWith(` ${query}`) || form.split(" ").includes(query))) return true;
    const verb = entry.partOfSpeech === "verb" || /\bverb\s/i.test(entry.title);
    if (!verb) return false;
    // A separated particle can rejoin its verb in a subordinate clause.
    const prefix = normalizeGermanForm(row.at(-1));
    if (row.length >= 3 && prefix && normalizeGermanForm(entry.lemma).startsWith(prefix)
      && expandGermanForms(row[1]).some((form) => prefix + form === query)) return true;
    // Accept a shortened du-imperative only when the source explicitly lists
    // that imperative. Do not drop mandatory e in arbeite, rede, atme, etc.
    const imperative = /imperativ/i.test(`${table.group || ""} ${table.title}`);
    if (!imperative || !row.some((cell) => /^(?:\(du\)|du)$/i.test(cell.trim()))) return false;
    const imperativeForm = /^du$/i.test(row[0].trim()) ? row[1] || "" : row[0];
    return expandGermanForms(imperativeForm).some((form) => {
      if (!form.endsWith("e")) return false;
      const stem = form.slice(0, -1);
      return stem === query && !/(?:[dt]|[bcdfghjklpqstvwxz][mn])$/i.test(stem);
    });
  }));
}

function dictionaryEntryUrl(href, baseUrl) {
  try {
    const url = new URL(href, baseUrl);
    if (url.origin !== "https://www.verbformen.com") return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.some((part) => /^(?:examples|worksheets|worksheets-exercises|downloads|search)$/i.test(part))) return null;
    const conjugation = segments[0] === "conjugation" && segments.length >= 2;
    const declension = segments[0] === "declension" && ["nouns", "adjectives", "pronouns", "articles"].includes(segments[1]) && segments.length >= 3;
    return (conjugation || declension) && segments.length <= 7 && /^[^/]+\.htm$/i.test(segments.at(-1)) ? url.href : null;
  } catch { return null; }
}

function parseEnglishSearchForm(html, sourceUrl) {
  const doc = parseDictionaryDocument(html);
  const form = [...doc.querySelectorAll("form")].find((node) => node.querySelector('[name="w"]'));
  const fields = [];
  if (form) {
    for (const control of form.querySelectorAll("input[name], select[name]")) {
      const type = (control.getAttribute("type") || "text").toLowerCase();
      if (control.disabled || ["submit", "button", "reset", "image"].includes(type)) continue;
      if (["checkbox", "radio"].includes(type) && !control.checked) continue;
      fields.push([control.getAttribute("name"), control.value || ""]);
    }
  }
  const action = new URL(form?.getAttribute("action") || sourceUrl, sourceUrl);
  if (action.origin !== "https://www.verbformen.com") throw new Error("Unexpected dictionary search address.");
  return { action: action.href, method: form?.getAttribute("method")?.toUpperCase() === "POST" ? "POST" : "GET", fields };
}

function parseEnglishResults(html, query, sourceUrl) {
  const doc = parseDictionaryDocument(html);
  const heading = doc.querySelector("h1");
  const linksIn = (node) => [...node.querySelectorAll("a[href]")].map((link) => ({ link, url: dictionaryEntryUrl(link.getAttribute("href"), sourceUrl) })).filter((entry) => entry.url);
  const markers = [...doc.querySelectorAll('img[alt], img[title], p[lang="en"], span[lang="en"]')].filter((node) =>
    node.getAttribute("lang") === "en" || /^(English|Englisch)$/i.test(node.getAttribute("alt") || node.getAttribute("title") || ""),
  ).filter((node) => !heading || Boolean(heading.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING));
  const results = [];
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
      const signature = `${candidate.url}|${gloss}`;
      if (!seen.has(signature)) {
        results.push({ lemma, label: article ? `${article} ${lemma}` : lemma, partOfSpeech: pos, meaning: gloss, url: candidate.url });
        seen.add(signature);
      }
      break;
    }
  }
  for (const entry of parseSearchCards(html, sourceUrl)) {
    const signature = `${entry.url}|${entry.meaning}`;
    if (englishGlossMatches(entry.meaning, query) && !seen.has(signature)) {
      results.push(entry);
      seen.add(signature);
    }
  }
  // A search with one match can redirect straight to the German entry.
  if (!results.length && new RegExp(`\\b(?:${DICTIONARY_WORD_TYPES})\\s+`, "i").test(heading?.textContent || "")) {
    const entry = parseVerbformen(html, query, sourceUrl);
    if (englishGlossMatches(entry.meaning, query)) {
      results.push({ lemma: entry.lemma, label: entry.forms.Article || entry.lemma, partOfSpeech: entry.partOfSpeech, meaning: entry.meaning, url: dictionaryEntryUrl(sourceUrl, sourceUrl) || `https://www.verbformen.com/?w=${encodeURIComponent(entry.lemma)}` });
    }
  }
  return results;
}

function parseSearchCards(html, sourceUrl) {
  const doc = parseDictionaryDocument(html);
  const summaryPattern = new RegExp(`^(?:[ABC][12]\\s*·\\s*)?(?:${DICTIONARY_WORD_TYPES})(?:\\s*·|$)`, "i");
  const summaries = [...doc.querySelectorAll("p,small")].filter((node) => summaryPattern.test(cleanDictionaryText(node.textContent).replace(/\s+/g, " ")));
  const cards = [];
  const seen = new Set();
  for (const summary of summaries) {
    let card = summary.parentElement;
    for (let depth = 0; card && depth < 7; depth++, card = card.parentElement) {
      if (summaries.filter((node) => card.contains(node)).length > 1) break;
      const meaning = extractEnglishMeaning(card, null, cleanDictionaryText);
      if (!meaning) continue;
      const summaryText = cleanDictionaryText(summary.textContent).replace(/\s+/g, " ");
      const lines = dictionaryText(card).split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
      const index = lines.findIndex((line) => line === summaryText);
      if (index < 0 || !lines[index + 1]) continue;
      const rawLabel = lines[index + 1].replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹„“”"]/g, "").replace(/\s*<[^>]+>/g, "").trim();
      const lemma = rawLabel.replace(/^(?:der|die|das)\s+/i, "").replace(/,\s*(?:der|die|das)$/i, "").replace(/\s*·\s*/g, "");
      if (!/^[\p{L}]+(?:[ '-][\p{L}]+)*$/u.test(lemma)) continue;
      const metadata = parseGrammarSummary(summaryText, "");
      const type = metadata.partOfSpeech;
      if (!type) continue;
      const encode = (value) => value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]);
      const entryHtml = `<main><h1>German ${type} ${encode(lemma)}</h1>${card.outerHTML}</main>`;
      const data = parseVerbformen(entryHtml, lemma, sourceUrl);
      const links = [...card.querySelectorAll("a[href]")].map((link) => ({ text: normalizeGermanForm(link.textContent), url: dictionaryEntryUrl(link.getAttribute("href"), sourceUrl) })).filter((entry) => entry.url);
      const urls = [...new Set(links.map((entry) => entry.url))];
      const detailUrl = links.find((entry) => entry.text === normalizeGermanForm(lemma) || entry.text.endsWith(` ${normalizeGermanForm(lemma)}`))?.url || (urls.length === 1 ? urls[0] : null);
      const article = type === "noun" ? rawLabel.match(/\b(der|die|das)\b/i)?.[1] || (metadata.grammarTags.includes("feminine") ? "die" : metadata.grammarTags.includes("masculine") ? "der" : metadata.grammarTags.some((tag) => /^(neutral|neuter)$/.test(tag)) ? "das" : "") : "";
      const url = detailUrl || sourceUrl;
      const signature = `${type}|${lemma}|${article}|${detailUrl || ""}|${meaning}`;
      if (!seen.has(signature)) {
        cards.push({ lemma, label: article ? `${article} ${lemma}` : lemma, partOfSpeech: type, meaning, url, detailUrl, data });
        seen.add(signature);
      }
      break;
    }
  }
  return cards;
}

function parseGermanSearchEntries(html, query, sourceUrl) {
  return parseSearchCards(html, sourceUrl).filter((entry) => isGermanEntryMatch(entry.data, query));
}

function nounArticleFromTags(tags = []) {
  for (const tag of tags) {
    if (tag === "feminine") return "die";
    if (tag === "masculine") return "der";
    if (tag === "neutral" || tag === "neuter") return "das";
  }
  return "";
}

function extractStatedNounForms(text) {
  const match = text.replace(/\s+/g, " ").match(/\bgenitive singular\s+["“„]?([\p{L}()/'’-]+)["”]?\s+and\s+nominative plural\s+["“„]?([\p{L}()/'’-]+)["”]?/iu);
  return match ? [match[1], match[2]] : [];
}

function nounVariantArticle(label, lemma) {
  const text = label.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹„“”"]/g, "").replace(/\s+/g, " ").trim();
  const escaped = lemma.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`(?:^|[\\s,])${escaped}\\s*,\\s*(der|die|das)\\b`, "iu"))?.[1]?.toLowerCase()
    || text.match(new RegExp(`(?:^|[\\s,])(der|die|das)\\s+${escaped}(?=$|[\\s,])`, "iu"))?.[1]?.toLowerCase() || "";
}

function extractNounVariants(doc, lemma, sourceUrl) {
  const seen = new Set();
  return [...doc.querySelectorAll("a[href]")].flatMap((link) => {
    const url = dictionaryEntryUrl(link.getAttribute("href"), sourceUrl);
    if (!url || !new URL(url).pathname.startsWith("/declension/nouns/")) return [];
    const label = link.cloneNode(true);
    label.querySelectorAll("sup").forEach((node) => node.remove());
    const article = nounVariantArticle(label.textContent, lemma);
    if (!article) return [];
    const key = `${article}|${url}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ article, label: `${article} ${lemma}`, lemma, url }];
  }).slice(0, 8);
}


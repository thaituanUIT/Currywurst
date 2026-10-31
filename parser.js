function parseVerbformen(html, word, sourceUrl) {
  const doc = parseDictionaryDocument(html);
  const cleanText = cleanDictionaryText;
  const heading = doc.querySelector("h1");
  const title = cleanText(heading?.textContent || "") || word;
  const lemma = title.match(/\b(?:verb|noun|adjective|adverb|pronoun|article)\s+([\p{L}äöüÄÖÜß-]+)/iu)?.[1] || word;
  const main = heading?.closest("main, article") || heading?.parentElement?.parentElement || doc;
  const text = cleanText(main?.innerText || main?.textContent || "");
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
  const level = lines.find((line) => /^(A1|A2|B1|B2|C1|C2)\s*[·.]?$/i.test(line)) || "";
  const grammarLine = lines.find((line) => /\b(noun|verb|adjective|pronoun|article)\b/i.test(line) && /·/.test(line)) || "";
  const grammarParts = grammarLine.split("·").map((part) => part.trim()).filter(Boolean);
  const partOfSpeech = grammarParts[0] || "";
  const grammar = grammarParts.slice(1, 3).join(" · ");
  const meaning = extractEnglishMeaning(doc, heading, cleanText);
  const formStart = grammarLine ? lines.indexOf(grammarLine) + 1 : -1;
  const formLines = formStart >= 0 ? lines.slice(formStart, formStart + 8) : [];
  const article = formLines.find((line) => /^(der|die|das)\s+/i.test(line) && line.toLowerCase().includes(word.toLowerCase())) || "";
  const matchingForms = formLines.filter((line) => line.toLowerCase() === word.toLowerCase() || /^[\p{L}äöüÄÖÜß-]+$/.test(line) && line.length > 2);
  const forms = { Article: article, Singular: matchingForms[0] || word, Plural: matchingForms[1] || "" };
  const caseLabels = /^(nom\.?|gen\.?|dat\.?|acc\.?|nominativ|genitiv|dativ|akkusativ)$/i;
  const verbLabels = /^(ich|du|er|sie|es|wir|ihr|Sie|infinitive|participle|imperative|present|imperfect|past|perfect|future|present subj\.?|imperf\.? subj\.?|infinitiv|partizip|imperativ|konjunktiv|präsens|präteritum|perfekt|futur)$/i;
  const adjectiveLabels = /^(masculine|feminine|neutral|neuter|plural|masc\.?|fem\.?|neut\.?|singular)$/i;
  const sectionHeadings = [...doc.querySelectorAll("h2,h3,h4,h5")].filter((heading) => cleanText(heading.textContent));
  const tableCandidates = [...doc.querySelectorAll("table")].map((table) => {
    const rows = [...table.querySelectorAll("tr")].map((row) => [...row.querySelectorAll("th,td")].map((cell) => cleanText(cell.textContent).replace(/\s+/g, " "))).filter((row) => row.length > 1);
    const labelRows = rows.filter((row) => caseLabels.test(row[0]) || verbLabels.test(row[0]) || adjectiveLabels.test(row[0]));
    const labels = labelRows.map((row) => row[0]);
    const isCaseTable = labels.filter((label) => caseLabels.test(label)).length >= 3;
    const verbRowCount = labels.filter((label) => /^(ich|du|er|sie|es|wir|ihr|Sie)$/i.test(label)).length;
    const hasVerbFormLabels = labels.some((label) => /^(infinitive|participle|imperative|present|imperfect|past|perfect|future|present subj\.?|imperf\.? subj\.?|infinitiv|partizip|imperativ|konjunktiv|präsens|präteritum|perfekt|futur)$/i.test(label));
    const isVerbTable = verbRowCount >= 3 || hasVerbFormLabels;
    const isAdjectiveTable = labels.some((label) => adjectiveLabels.test(label));
    if (!isCaseTable && !isVerbTable && !isAdjectiveTable) return null;
    let title = isVerbTable ? "Conjugation" : "Declension";
    const precedingHeadings = sectionHeadings.filter((heading) => heading.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).slice(-2);
    if (precedingHeadings.length) title = precedingHeadings.map((heading) => cleanText(heading.textContent).replace(/\s+/g, " ")).filter(Boolean).join(" · ");
    const cells = [...table.rows].map(row => [...row.cells].map(cell => ({header: cell.tagName === "TH", colSpan: cell.colSpan, rowSpan: cell.rowSpan}))).filter(row => row.length > 1);
    return { title, rows: rows.slice(0, 25), cells: cells.slice(0, 25) };
  }).filter(Boolean);
  const seenTables = new Set();
  const inflectionTables = tableCandidates.filter((table) => {
    const signature = JSON.stringify(table.rows);
    if (seenTables.has(signature)) return false;
    seenTables.add(signature);
    return true;
  });
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
    meaning,
    forms,
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

function isGermanEntryMatch(entry, word) {
  // Search may redirect an English query or unknown spelling to another word.
  // Only accept a German headword or an inflected form present in its tables.
  if (!/\b(?:verb|noun|adjective|adverb|pronoun|article)\s+/i.test(entry.title || "")) return false;
  if (!entry.meaning && !entry.inflectionTables?.length) return false;
  const normalize = (value) => String(value).normalize("NFC").toLocaleLowerCase("de-DE").replace(/[·⁰¹²³⁴⁵⁶⁷⁸⁹]/g, "").replace(/\s+/g, " ").trim();
  const query = normalize(word);
  if (!query) return false;
  if (normalize(entry.lemma) === query) return true;
  return (entry.inflectionTables || []).some((table) => table.rows.some((row) =>
    row.some((cell) => normalize(cell) === query) || normalize(row.join(" ")).split(" ").includes(query),
  ));
}

function dictionaryEntryUrl(href, baseUrl) {
  try {
    const url = new URL(href, baseUrl);
    if (url.origin !== "https://www.verbformen.com") return null;
    return /^\/(?:conjugation\/[^/]+|declension\/(?:nouns|adjectives|pronouns|articles)\/[^/]+)\.htm$/.test(url.pathname) ? url.href : null;
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
      const pos = text.match(/\b(noun|verb|adjective|pronoun|article|adverb)\b/i)?.[1]?.toLowerCase() || "";
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
  // A search with one match can redirect straight to the German entry.
  if (!results.length && /\b(?:verb|noun|adjective|pronoun|article)\s+/i.test(heading?.textContent || "")) {
    const entry = parseVerbformen(html, query, sourceUrl);
    if (englishGlossMatches(entry.meaning, query)) {
      results.push({ lemma: entry.lemma, label: entry.forms.Article || entry.lemma, partOfSpeech: entry.partOfSpeech, meaning: entry.meaning, url: dictionaryEntryUrl(sourceUrl, sourceUrl) || `https://www.verbformen.com/?w=${encodeURIComponent(entry.lemma)}` });
    }
  }
  return results;
}


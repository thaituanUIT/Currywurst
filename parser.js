function parseVerbformen(html, word, sourceUrl) {
  // Strip executable markup before parsing. The extension CSP blocks inline
  // event handlers, and none of the page's scripts are needed for text lookup.
  const safeHtml = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "");
  const template = document.createElement("template");
  template.innerHTML = safeHtml;
  const doc = template.content;
  const heading = doc.querySelector("h1");
  const title = heading?.textContent?.trim() || word;
  const lemma = title.match(/\b(?:verb|noun|adjective|adverb|pronoun|article)\s+([\p{L}äöüÄÖÜß-]+)/iu)?.[1] || word;
  const main = heading?.closest("main, article") || heading?.parentElement?.parentElement || doc;
  const text = main?.innerText || main?.textContent || "";
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
  const meaning = lines.find((line) => /^[A-Za-z][A-Za-z ,'-]{2,80}$/.test(line) && line.includes(",") && !/^(The |Our |Handy )/i.test(line)) || "";
  const formStart = grammarLine ? lines.indexOf(grammarLine) + 1 : -1;
  const formLines = formStart >= 0 ? lines.slice(formStart, formStart + 8) : [];
  const article = formLines.find((line) => /^(der|die|das)\s+/i.test(line) && line.toLowerCase().includes(word.toLowerCase())) || "";
  const matchingForms = formLines.filter((line) => line.toLowerCase() === word.toLowerCase() || /^[\p{L}äöüÄÖÜß-]+$/.test(line) && line.length > 2);
  const forms = { Article: article, Singular: matchingForms[0] || word, Plural: matchingForms[1] || "" };
  const caseLabels = /^(nom\.?|gen\.?|dat\.?|acc\.?|nominativ|genitiv|dativ|akkusativ)$/i;
  const verbLabels = /^(ich|du|er|sie|es|wir|ihr|Sie|infinitive|participle|imperative|present|imperfect|past|perfect|future|present subj\.?|imperf\.? subj\.?|infinitiv|partizip|imperativ|konjunktiv|präsens|präteritum|perfekt|futur)$/i;
  const adjectiveLabels = /^(masculine|feminine|neutral|neuter|plural|masc\.?|fem\.?|neut\.?|singular)$/i;
  const sectionHeadings = [...doc.querySelectorAll("h2,h3,h4,h5")];
  const tableCandidates = [...doc.querySelectorAll("table")].map((table) => {
    const rows = [...table.querySelectorAll("tr")].map((row) => [...row.querySelectorAll("th,td")].map((cell) => cell.textContent.replace(/\s+/g, " ").trim())).filter((row) => row.length > 1);
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
    if (precedingHeadings.length) title = precedingHeadings.map((heading) => heading.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).join(" · ");
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


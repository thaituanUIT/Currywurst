// Resolve only the requested word. These are bounded fallbacks, not a crawl.
async function lookupGermanEntry(word, loadPage, signal, { recover = true, cache = new Map() } = {}) {
  const load = async (url) => {
    signal.throwIfAborted();
    if (!cache.has(url)) {
      if (cache.size >= 6) return null;
      cache.set(url, loadPage(url).catch((error) => {
        if (error.status === 404) return null;
        throw error;
      }));
    }
    const page = await cache.get(url);
    signal.throwIfAborted();
    return page;
  };
  const completeEntry = async (data, sourceUrl, detailUrl = null) => {
    const fullUrl = fullDictionaryEntryUrl(detailUrl || sourceUrl, sourceUrl);
    if (fullUrl && fullUrl !== sourceUrl) {
      const full = await load(fullUrl);
      if (full) {
        const parsed = parseVerbformen(full.html, word, full.sourceUrl);
        if (isGermanEntryMatch(parsed, word)) return { data: { ...parsed, variants: mergeNounVariants(parsed, data.variants || []) }, sourceUrl: full.sourceUrl };
      }
    }
    return { data: { ...data, word }, sourceUrl };
  };
  const inspect = async (url) => {
    const page = await load(url);
    if (!page) return null;
    const data = parseVerbformen(page.html, word, page.sourceUrl);
    if (isGermanEntryMatch(data, word)) return completeEntry(data, page.sourceUrl);
    const cards = parseGermanSearchEntries(page.html, word, page.sourceUrl);
    const card = cards[0];
    if (card) {
      const variants = cards.filter((entry) => entry.data.lemma.toLowerCase() === card.data.lemma.toLowerCase()).flatMap((entry) => {
        const article = entry.data.article || entry.label?.match(/^(der|die|das)\s/i)?.[1];
        const url = dictionaryEntryUrl(entry.detailUrl || entry.url, page.sourceUrl);
        return article && url ? [{ article, label: `${article} ${entry.data.lemma}`, lemma: entry.data.lemma, url }] : [];
      });
      return completeEntry({ ...card.data, variants: mergeNounVariants(card.data, variants) }, page.sourceUrl, card.detailUrl);
    }
    return null;
  };
  const direct = await inspect(`https://www.verbformen.com/?w=${encodeURIComponent(word)}&l=11`);
  if (direct || !recover) return direct;
  const nounSelection = /^\p{Lu}/u.test(word);
  for (const path of [nounSelection ? "declension/nouns/" : "conjugation/", "search/"]) {
    const found = await inspect(`https://www.verbformen.com/${path}?w=${encodeURIComponent(word)}&l=11`);
    if (found) return found;
  }
  for (const candidate of germanNounCandidates(word)) {
    const url = /^[A-Za-z-]+$/.test(candidate)
      ? `https://www.verbformen.com/declension/nouns/${encodeURIComponent(candidate)}.htm`
      : `https://www.verbformen.com/declension/nouns/?w=${encodeURIComponent(candidate)}&l=11`;
    const found = await inspect(url);
    if (found) return found;
  }
  for (const candidate of germanImperativeCandidates(word)) {
    const found = await inspect(`https://www.verbformen.com/conjugation/?w=${encodeURIComponent(candidate)}&l=11`);
    // inspect still validates against the ORIGINAL selection, never the guess.
    if (found) return found;
  }
  return null;
}

function germanNounCandidates(word) {
  if (!/^[\p{L}-]{3,60}$/u.test(word)) return [];
  const value = word.normalize("NFC");
  const capitalize = (text) => text[0].toLocaleUpperCase("de-DE") + text.slice(1);
  const withoutUmlaut = (text) => text.replace(/[äöüÄÖÜ]/g, (letter) => ({ ä: "a", ö: "o", ü: "u", Ä: "A", Ö: "O", Ü: "U" })[letter]);
  let stems = [];
  if (/ern$/i.test(value)) stems = [withoutUmlaut(value.slice(0, -1)), withoutUmlaut(value.slice(0, -3))];
  else if (/n$/i.test(value)) stems = [value.slice(0, -1), value.replace(/en$/i, "")];
  else if (/er$/i.test(value) && !/ier$/i.test(value)) stems = [withoutUmlaut(value.slice(0, -2)), value.slice(0, -2)];
  else if (/es$/i.test(value)) stems = [value.slice(0, -2), value.slice(0, -1)];
  else if (/[es]$/i.test(value)) stems = [value.slice(0, -1)];
  return [...new Set(stems.filter((stem) => stem.length >= 2 && stem !== value).map(capitalize))].slice(0, 2);
}

function mergeNounVariants(data, extra) {
  const seen = new Set();
  return [...(data.variants || []), ...extra].filter((variant) => {
    if (!variant.lemma || variant.lemma.toLowerCase() !== data.lemma.toLowerCase()) return false;
    const key = `${variant.article}|${variant.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function germanImperativeCandidates(word) {
  if (!/^[\p{L}]{3,60}$/u.test(word) || /en$/i.test(word)) return [];
  const stem = word.toLocaleLowerCase("de-DE");
  return /(?:el|er)$/i.test(stem) && !/ier$/i.test(stem)
    ? [`${stem}n`, `${stem}en`]
    : [`${stem}en`, `${stem}n`];
}

function fullDictionaryEntryUrl(href, baseUrl) {
  const accepted = dictionaryEntryUrl(href, baseUrl);
  if (!accepted) return null;
  const url = new URL(accepted);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "conjugation") url.pathname = `/conjugation/${parts.at(-1)}`;
  else url.pathname = `/declension/${parts[1]}/${parts.at(-1)}`;
  return url.href;
}

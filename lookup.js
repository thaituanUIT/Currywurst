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
  for (const path of ["conjugation/", "search/"]) {
    const found = await inspect(`https://www.verbformen.com/${path}?w=${encodeURIComponent(word)}&l=11`);
    if (found) return found;
  }
  for (const candidate of germanImperativeCandidates(word)) {
    const found = await inspect(`https://www.verbformen.com/conjugation/?w=${encodeURIComponent(candidate)}&l=11`);
    // inspect still validates against the ORIGINAL selection, never the guess.
    if (found) return found;
  }
  return null;
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

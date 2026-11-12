// Shared by the popup, parser, and storage worker. This file does not use the DOM.
export const WOERTER_WORD_TYPES: Record<string, string> = {
  verbs: "verb", nouns: "noun", adjectives: "adjective", adverbs: "adverb",
  pronouns: "pronoun", articles: "article", prepositions: "preposition",
  conjunctions: "conjunction", particles: "particle", numerals: "numeral", interjections: "interjection",
};

export function dictionaryEntryUrl(href: unknown, baseUrl = "https://www.verbformen.com/") {
  try {
    const url = new URL(typeof href === "string" ? href : "", baseUrl);
    if (url.username || url.password) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (!/^[^/]+\.htm$/i.test(parts.at(-1) || "")) return null;
    if (url.origin === "https://www.woerter.net") {
      return Object.hasOwn(WOERTER_WORD_TYPES, parts[0])
        && (parts.length === 2 || (parts.length === 3 && ["meanings", "translations"].includes(parts[1]))) ? url.href : null;
    }
    if (url.origin !== "https://www.verbformen.com" || parts.length > 7
      || parts.some(part => /^(?:examples|worksheets|worksheets-exercises|downloads|search)$/i.test(part))) return null;
    const verb = parts[0] === "conjugation" && parts.length >= 2;
    const declined = parts[0] === "declension" && ["nouns", "adjectives", "pronouns", "articles"].includes(parts[1]) && parts.length >= 3;
    return verb || declined ? url.href : null;
  } catch { return null; }
}

export function dictionaryRequestUrl(href: unknown) {
  try {
    const url = new URL(typeof href === "string" ? href : "");
    if (url.username || url.password) return null;
    return url.origin === "https://www.verbformen.com" ? url.href : dictionaryEntryUrl(url.href);
  } catch { return null; }
}

export function dictionaryEntryType(href: unknown) {
  const accepted = dictionaryEntryUrl(href);
  if (!accepted) return "";
  const url = new URL(accepted);
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.origin === "https://www.woerter.net") return WOERTER_WORD_TYPES[parts[0]];
  if (parts[0] === "conjugation") return "verb";
  return ({ nouns: "noun", adjectives: "adjective", pronouns: "pronoun", articles: "article" } as Record<string, string>)[parts[1]] || "";
}

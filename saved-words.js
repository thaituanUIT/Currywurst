const SAVED_WORD_LIMIT = 100;

function savedWordId(entry) {
  return JSON.stringify([
    entry.lemma.normalize("NFC").toLocaleLowerCase("de-DE"),
    entry.partOfSpeech || "", entry.article || "",
  ]);
}

function savedWordRecord(entry, savedAt = Date.now()) {
  const lemma = typeof entry?.lemma === "string" ? entry.lemma.normalize("NFC").trim() : "";
  const meaning = typeof entry?.meaning === "string" ? entry.meaning.trim() : "";
  if (!lemma || lemma.length > 160 || !meaning || meaning.length > 4000) {
    throw Object.assign(new Error("A word and its English meaning are required."), { messageKey: "saved_word_required" });
  }
  const partOfSpeech = typeof entry.partOfSpeech === "string" ? entry.partOfSpeech.trim().toLowerCase().slice(0, 40) : "";
  const article = /^(der|die|das)$/.test(entry.article || "") ? entry.article : "";
  let sourceUrl = "";
  try {
    sourceUrl = dictionaryRequestUrl(entry.sourceUrl) || "";
  } catch { /* Search-only entries can be looked up again by their lemma. */ }
  const meaningSource = safeMeaningSource(entry.meaningSource);
  const record = { lemma, meaning, partOfSpeech, article, sourceUrl, savedAt, ...(meaningSource ? { meaningSource } : {}) };
  return { ...record, id: savedWordId(record) };
}

function safeMeaningSource(value) {
  if (value?.provider === "MyMemory" && value.url === "https://mymemory.translated.net/") {
    return { provider: "MyMemory", url: "https://mymemory.translated.net/" };
  }
  if (value?.provider !== "Wiktionary") return null;
  try {
    const url = new URL(value.url);
    if (url.origin !== "https://en.wiktionary.org" || url.username || url.password
      || !(url.pathname.startsWith("/wiki/") || url.pathname === "/w/index.php")) return null;
    return {
      provider: "Wiktionary", url: url.href,
      ...(Number.isInteger(value.revisionId) && value.revisionId > 0 ? { revisionId: value.revisionId } : {}),
      license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    };
  } catch { return null; }
}

// The background worker owns this queue so separate popup windows cannot
// overwrite each other's additions or race past the limit.
function createSavedWordsStore(storage) {
  let queue = Promise.resolve();
  const read = async () => {
    const { savedWords = [] } = await storage.get("savedWords");
    if (!Array.isArray(savedWords)) throw Object.assign(new Error("Could not read your saved words."), { messageKey: "saved_read_error" });
    const seen = new Set();
    return savedWords.map(entry => savedWordRecord(entry, Number.isFinite(entry.savedAt) ? entry.savedAt : 0))
      .filter(entry => !seen.has(entry.id) && seen.add(entry.id))
      .sort((a, b) => b.savedAt - a.savedAt);
  };
  const enqueue = operation => {
    const task = queue.then(operation);
    queue = task.catch(() => {});
    return task;
  };
  const add = (entry, restoring) => enqueue(async () => {
    const words = await read();
    const record = savedWordRecord(entry, restoring && Number.isFinite(entry.savedAt) ? entry.savedAt : Date.now());
    if (words.some(word => word.id === record.id)) return { words };
    if (words.length >= SAVED_WORD_LIMIT) throw Object.assign(new Error("List full. Delete a word to save another."), { messageKey: "saved_list_full" });
    const next = [record, ...words].sort((a, b) => b.savedAt - a.savedAt);
    await storage.set({ savedWords: next });
    return { words: next };
  });
  return {
    list: () => enqueue(async () => ({ words: await read() })),
    add: entry => add(entry, false),
    restore: entry => add(entry, true),
    remove: id => enqueue(async () => {
      const words = await read();
      const removed = words.find(word => word.id === id);
      if (removed) await storage.set({ savedWords: words.filter(word => word.id !== id) });
      return { words: words.filter(word => word.id !== id), removed };
    }),
  };
}

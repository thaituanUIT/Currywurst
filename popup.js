const input = document.querySelector("#word");
const result = document.querySelector("#result");
const sourceLink = document.querySelector("#source");
const modeToggle = document.querySelector("#mode-toggle");
const searchLabel = document.querySelector(".search-label");
let mode = "de-en";
let lookupSequence = 0;
let activeController;
let activeAudio;
let inputEdited = false;
let englishForm;
let activeMeaningController;
const tabEntryCache = new Map();
const findEnglishMeaning = createEnglishMeaningFallback({ storage: chrome.storage.session });
const findBasicTranslation = createBasicTranslationFallback({ storage: chrome.storage.session });
let view = "lookup";
let currentEntry;
let savedWords = [];
let savedReady = false;
let savedBusy = false;
let savedSequence = 0;
let saveError = "";
let savedLoadError = "";
let removedWord;
let undoTimer;

const savedList = document.querySelector("#saved-list");
const savedStatus = document.querySelector("#saved-status");
const undoButton = document.querySelector("#undo-delete");

document.querySelector("#lookup-tab").addEventListener("click", () => setView("lookup"));
document.querySelector("#saved-tab").addEventListener("click", () => {
  inputEdited = true;
  cancelLookup();
  if (result.querySelector(".loading")) renderEmptyState();
  setView("saved");
  renderSavedWords();
  if (!savedBusy) loadSavedWords();
});
undoButton.addEventListener("click", undoDelete);
loadSavedWords();

function setView(nextView) {
  view = nextView;
  document.querySelector("#lookup-view").hidden = view !== "lookup";
  document.querySelector("#saved-view").hidden = view !== "saved";
  document.querySelector("#lookup-tab").setAttribute("aria-pressed", String(view === "lookup"));
  document.querySelector("#saved-tab").setAttribute("aria-pressed", String(view === "saved"));
  modeToggle.hidden = view === "saved";
  sourceLink.hidden = view === "saved";
  updateSaveButton();
}

async function savedWordsRequest(action, values = {}) {
  const sequence = ++savedSequence;
  const response = await chrome.runtime.sendMessage({ type: "savedWords", action, ...values });
  if (!response?.ok) throw new Error(response?.error || "Could not access saved words. Please try again.");
  if (sequence === savedSequence) {
    savedWords = response.words;
    savedReady = true;
    document.querySelector("#saved-count").textContent = `${savedWords.length}/${SAVED_WORD_LIMIT}`;
    updateSaveButton();
  }
  return response;
}

async function loadSavedWords() {
  const sequence = savedSequence + 1;
  try {
    await savedWordsRequest("list");
    if (sequence !== savedSequence) return;
    savedLoadError = "";
    updateSaveButton();
    if (view === "saved") {
      if (!removedWord) setSavedStatus("");
      renderSavedWords();
    }
  } catch (error) {
    if (sequence !== savedSequence) return;
    savedLoadError = error.message;
    updateSaveButton();
    if (view === "saved") setSavedStatus(error.message, true);
  }
}

function setSavedStatus(message, error = false) {
  savedStatus.textContent = message;
  savedStatus.className = error ? "error" : "muted";
}

function updateSaveButton() {
  const button = result.querySelector("#save-word");
  if (!button || !currentEntry) return;
  const alreadySaved = savedWords.some(word => word.id === savedWordId(currentEntry));
  const full = savedWords.length >= SAVED_WORD_LIMIT;
  button.textContent = alreadySaved ? "Saved" : savedBusy ? "Saving…" : "Save";
  button.disabled = !savedReady || savedBusy || alreadySaved || full;
  button.title = alreadySaved ? "Already saved" : full ? "List full. Delete a word to save another." : "Save this word";
  const status = result.querySelector("#save-status");
  if (status) status.textContent = saveError || savedLoadError || (full && !alreadySaved ? "List full. Delete a word to save another." : "");
}

async function saveCurrentWord() {
  if (!currentEntry || !savedReady || savedBusy) return;
  const entry = currentEntry;
  savedBusy = true;
  saveError = "";
  updateSaveButton();
  try {
    const sourceUrl = entry.comparisonVariants?.find(variant => variant.degree === "positive")?.url || entry.sourceUrl || sourceLink.href;
    await savedWordsRequest("add", { entry: savedWordRecord({ ...entry, sourceUrl }) });
  } catch (error) {
    if (entry === currentEntry) saveError = error.message;
  } finally {
    savedBusy = false;
    updateSaveButton();
    if (view === "saved") renderSavedWords();
  }
}

function renderSavedWords() {
  const words = savedWords;
  savedList.innerHTML = !savedReady ? `<p class="muted">${escapeHtml(savedLoadError || "Loading saved words…")}</p>`
    : !words.length ? '<p class="hint">No saved words yet.</p>'
    : words.map((word, index) => {
      const label = word.article ? `${word.article} ${word.lemma}` : word.lemma;
      return `<article class="saved-row" role="listitem"><div class="saved-word-block"><button class="saved-word" data-saved-word="${index}"><span lang="de">${escapeHtml(label)}</span><span class="saved-meaning">${escapeHtml(word.meaning)}</span></button>${meaningAttribution(word.meaningSource)}</div><button class="delete-word" data-delete-word="${index}" aria-label="Delete ${escapeHtml(label)}" title="Delete word" ${savedBusy ? "disabled" : ""}>${uiIcon("close")}</button></article>`;
    }).join("");
  savedList.querySelectorAll("[data-saved-word]").forEach(button => button.addEventListener("click", () => openSavedWord(words[Number(button.dataset.savedWord)])));
  savedList.querySelectorAll("[data-delete-word]").forEach(button => button.addEventListener("click", () => deleteSavedWord(words[Number(button.dataset.deleteWord)].id)));
  undoButton.disabled = savedBusy;
}

function openSavedWord(entry) {
  inputEdited = true;
  setView("lookup");
  setMode("de-en");
  input.value = entry.lemma;
  chrome.storage.local.set({ lookupWord: entry.lemma, lookupMode: "de-en" }).catch(() => {});
  const url = dictionaryEntryUrl(entry.sourceUrl, "https://www.verbformen.com/");
  return runLookup(entry.lemma, url ? { entry: { ...entry, url }, savedEntry: true } : null);
}

async function deleteSavedWord(id) {
  if (savedBusy) return;
  savedBusy = true;
  setSavedStatus("");
  renderSavedWords();
  try {
    const { removed } = await savedWordsRequest("remove", { id });
    if (removed) {
      clearTimeout(undoTimer);
      removedWord = removed;
      undoButton.hidden = false;
      setSavedStatus(`Deleted ${removed.lemma}.`);
      undoTimer = setTimeout(() => { removedWord = undefined; undoButton.hidden = true; }, 5000);
    }
  } catch (error) {
    setSavedStatus(error.message, true);
  } finally {
    savedBusy = false;
    renderSavedWords();
    updateSaveButton();
  }
}

async function undoDelete() {
  if (!removedWord || savedBusy) return;
  savedBusy = true;
  renderSavedWords();
  try {
    await savedWordsRequest("restore", { entry: removedWord });
    clearTimeout(undoTimer);
    removedWord = undefined;
    undoButton.hidden = true;
    setSavedStatus("");
  } catch (error) {
    setSavedStatus(error.message, true);
  } finally {
    savedBusy = false;
    renderSavedWords();
    updateSaveButton();
  }
}

input.addEventListener("input", () => { inputEdited = true; });
// A saved word is input history, not a request to contact the dictionary.
// Only a fresh context-menu action may start a lookup when the popup opens.
Promise.all([
  chrome.storage.local.get(["lookupWord", "lookupMode"]).catch(() => ({})),
  chrome.storage.session.get("pendingLookup").catch(() => ({})),
]).then(async ([{ lookupWord, lookupMode }, { pendingLookup }]) => {
  const consumed = pendingLookup
    ? await chrome.storage.session.remove("pendingLookup").then(() => true, () => false)
    : false;
  if (inputEdited || lookupSequence !== 0) return;
  setMode(lookupMode === "en-de" ? "en-de" : "de-en");
  const age = Date.now() - pendingLookup?.createdAt;
  const fresh = consumed && typeof pendingLookup.word === "string" && pendingLookup.word.trim()
    && Number.isFinite(pendingLookup.createdAt) && age >= 0 && age < 60000;
  if (fresh) {
    input.value = pendingLookup.word;
    runLookup(pendingLookup.word, null, { automatic: true, hint: pendingLookup.hint });
  } else {
    input.value = typeof lookupWord === "string" ? lookupWord : "";
    renderEmptyState();
  }
});

modeToggle.addEventListener("click", () => {
  inputEdited = true;
  cancelLookup();
  tabEntryCache.clear();
  input.value = "";
  setMode(mode === "de-en" ? "en-de" : "de-en");
  chrome.storage.local.set({ lookupWord: "", lookupMode: mode }).catch(() => {});
  renderEmptyState();
  input.focus();
});
document.querySelector("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  runLookup(input.value.trim());
});

function setMode(nextMode) {
  mode = nextMode;
  const english = mode === "en-de";
  document.documentElement.dataset.mode = mode;
  modeToggle.innerHTML = `<span>${english ? "EN" : "DE"}</span>${uiIcon("arrow-right")}<span>${english ? "DE" : "EN"}</span>`;
  modeToggle.setAttribute("aria-pressed", String(english));
  modeToggle.setAttribute("aria-label", `${english ? "English to German" : "German to English"}. Click to switch to ${english ? "German to English" : "English to German"}`);
  searchLabel.textContent = english ? "YOUR ENGLISH WORD" : "YOUR GERMAN WORD";
  input.setAttribute("aria-label", english ? "English word" : "German word");
  sourceLink.href = english ? "https://www.verbformen.com/en-de/" : "https://www.verbformen.com/";
}

function renderEmptyState() {
  stopMeaningLookup();
  currentEntry = undefined;
  result.scrollTop = 0;
  const message = input.value.trim()
    ? "Press Look up to search this word again."
    : "Type a word, or select text and right-click to look it up.";
  result.innerHTML = `<div class="empty-state"><p class="hint">${message}</p></div>`;
}

function stopPronunciation() {
  activeAudio?.pause();
  activeAudio = undefined;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function cancelLookup() {
  lookupSequence++;
  activeController?.abort();
  stopMeaningLookup();
  stopPronunciation();
}

function stopMeaningLookup() {
  activeMeaningController?.abort();
  activeMeaningController = undefined;
}

function meaningAttribution(value) {
  const source = safeMeaningSource(value);
  if (!source) return "";
  if (source.provider === "MyMemory") return `<p class="meaning-source">Translation from <a href="${source.url}" target="_blank" rel="noreferrer">MyMemory</a></p>`;
  return `<p class="meaning-source">Meaning from <a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">Wiktionary</a> · <a href="${escapeHtml(source.licenseUrl)}" target="_blank" rel="noreferrer">CC BY-SA 4.0</a></p>`;
}

function tabEntryKey(href) {
  const address = fullDictionaryEntryUrl(href, "https://www.verbformen.com/");
  if (!address) return null;
  const url = new URL(address);
  url.search = "";
  url.hash = "";
  return url.href;
}

function cacheRenderedEntry(data) {
  const direct = tabEntryKey(data.sourceUrl);
  if (direct) {
    tabEntryCache.set(direct, { ...data, sourceUrl: direct });
    return;
  }
  // Query pages can render an entry without redirecting to its canonical URL.
  // Alias only the source-linked tab that matches the displayed entry.
  const aliases = [];
  const genders = (data.variants || []).filter(entry => entry.article === data.article && entry.lemma === data.lemma);
  if (genders.length === 1) aliases.push(genders[0].url);
  const degree = (data.comparisonVariants || []).find(entry => data.grammarTags?.includes(entry.degree))
    || (data.comparisonVariants || []).find(entry => entry.form === data.word)
    || (data.comparisonVariants || []).find(entry => entry.degree === "positive");
  if (degree) aliases.push(degree.url);
  const choices = (data.entryChoices || []).filter(entry => entry.lemma === data.lemma && entry.partOfSpeech === data.partOfSpeech);
  if (!aliases.length && choices.length === 1) aliases.push(choices[0].url);
  for (const address of aliases) {
    const key = tabEntryKey(address);
    if (key) tabEntryCache.set(key, { ...data, sourceUrl: key });
  }
}

function loadMissingMeaning(data, backState, message) {
  const controller = new AbortController();
  activeMeaningController = controller;
  const sequence = lookupSequence;
  findEnglishMeaning(data, controller.signal).then(translation => {
    if (controller.signal.aborted || sequence !== lookupSequence || currentEntry !== data || view !== "lookup") return;
    const scroll = result.scrollTop;
    renderGermanEntry({ ...data, ...(translation || {}), meaningState: translation ? "ready" : "unavailable" }, backState, message);
    result.scrollTop = scroll;
  }).catch(() => {
    if (controller.signal.aborted || sequence !== lookupSequence || currentEntry !== data || view !== "lookup") return;
    renderGermanEntry({ ...data, meaningState: "unavailable" }, backState, message);
  });
}

async function fetchPage(url, controller, options = {}) {
  if (new URL(url).origin !== "https://www.verbformen.com") throw new Error("Unexpected dictionary address.");
  const response = await fetch(url, { ...options, headers: { Accept: "text/html", ...options.headers }, signal: controller.signal });
  if (!response.ok) {
    const error = new Error(`Verbformen returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  if (new URL(response.url || url).origin !== "https://www.verbformen.com") throw new Error("Unexpected dictionary redirect.");
  return { html: await response.text(), sourceUrl: response.url || url };
}

async function searchEnglish(word, controller) {
  if (!englishForm) {
    const page = await fetchPage("https://www.verbformen.com/en-de/", controller);
    controller.signal.throwIfAborted();
    englishForm = parseEnglishSearchForm(page.html, page.sourceUrl);
  }
  const fields = new URLSearchParams(englishForm.fields);
  fields.set("w", word);
  fields.set("l", "11");
  if (englishForm.method === "POST") {
    return fetchPage(englishForm.action, controller, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: fields.toString() });
  }
  const url = new URL(englishForm.action);
  for (const [key, value] of fields) url.searchParams.set(key, value);
  return fetchPage(url.href, controller);
}

async function detectAndLookup(word, hint, preferredMode, controller) {
  const cache = new Map();
  const loadPage = (url) => fetchPage(url, controller);
  const firstMode = /[äöüß]/i.test(word) ? "de-en" : hint === "en" ? "en-de" : hint === "de" ? "de-en" : preferredMode;
  const directions = [firstMode, firstMode === "de-en" ? "en-de" : "de-en"];
  for (const direction of directions) {
    controller.signal.throwIfAborted();
    if (direction === "de-en") {
      const found = await lookupGermanEntry(word, loadPage, controller.signal, { recover: hint === "de", cache });
      if (found) return { mode: direction, ...found };
    } else {
      const page = await searchEnglish(word, controller);
      controller.signal.throwIfAborted();
      const entries = parseEnglishResults(page.html, word, page.sourceUrl);
      if (entries.length) return { mode: direction, state: { query: word, entries, sourceUrl: page.sourceUrl } };
    }
  }
  const recovered = await lookupGermanEntry(word, loadPage, controller.signal, { cache });
  return recovered ? { mode: "de-en", ...recovered } : null;
}

async function runLookup(word, detail = null, options = {}) {
  if (!word) return;
  if (!detail?.previousData) tabEntryCache.clear();
  const cached = detail?.previousData ? tabEntryCache.get(tabEntryKey(detail.entry.url)) : null;
  setView("lookup");
  currentEntry = undefined;
  saveError = "";
  cancelLookup();
  const sequence = lookupSequence;
  let translationAttempted = false;
  const controller = new AbortController();
  activeController = controller;
  const requestedMode = mode;
  const timeout = setTimeout(() => controller.abort(), options.automatic ? 25000 : 15000);
  const showBasicTranslation = async () => {
    translationAttempted = true;
    result.innerHTML = '<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span><span>Finding a translation…</span></div>';
    const translation = await findBasicTranslation(word, controller.signal);
    if (sequence !== lookupSequence || !translation) return false;
    setMode("de-en");
    if (options.automatic) chrome.storage.local.set({ lookupMode: "de-en" }).catch(() => {});
    const sourceUrl = `https://www.verbformen.com/?w=${encodeURIComponent(word)}&l=11`;
    sourceLink.href = sourceUrl;
    renderGermanEntry({ word, lemma: word, title: word, ...translation, basicTranslation: true,
      sourceUrl, ipa: [], audio: [], partOfSpeech: "", grammarTags: [], inflectionTables: [] });
    return true;
  };
  if (!detail) chrome.storage.local.set(options.automatic
    ? { lookupWord: word }
    : { lookupWord: word, lookupMode: mode }).catch(() => {});
  sourceLink.href = detail?.entry.url || `https://www.verbformen.com/${mode === "en-de" ? "en-de/" : ""}?w=${encodeURIComponent(word)}`;
  const message = loadingMessage(word, detail, options, requestedMode);
  if (!cached) result.innerHTML = `<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span><span>${escapeHtml(message)}</span></div>`;
  result.scrollTop = 0;
  try {
    if (options.automatic && !detail) {
      const match = await detectAndLookup(word, options.hint, requestedMode, controller);
      if (sequence !== lookupSequence) return;
      if (!match) {
        if (await showBasicTranslation() || sequence !== lookupSequence) return;
        result.innerHTML = '<p class="muted">No dictionary entry or translation found. Try another spelling or choose a direction using the language button above.</p>';
        return;
      }
      setMode(match.mode);
      chrome.storage.local.set({ lookupMode: match.mode }).catch(() => {});
      if (match.state) renderSearchResults(match.state);
      else {
        sourceLink.href = match.sourceUrl;
        renderGermanEntry(match.data);
      }
    } else if (requestedMode === "en-de" && !detail) {
      const page = await searchEnglish(word, controller);
      const entries = parseEnglishResults(page.html, word, page.sourceUrl);
      if (sequence !== lookupSequence) return;
      renderSearchResults({ query: word, entries, sourceUrl: page.sourceUrl });
    } else {
      let found;
      if (cached) found = { data: { ...cached, word }, sourceUrl: cached.sourceUrl };
      else if (!detail) {
        found = await lookupGermanEntry(word, (url) => fetchPage(url, controller), controller.signal);
      } else {
        const page = await fetchPage(fullDictionaryEntryUrl(detail.entry.url, detail.entry.url) || detail.entry.url, controller);
        found = { data: parseVerbformen(page.html, word, page.sourceUrl), sourceUrl: page.sourceUrl };
      }
      if (sequence !== lookupSequence) return;
      if (detail?.previousData && !detail.variantKind && found && found.data.lemma.toLowerCase() !== detail.entry.lemma.toLowerCase()) throw new Error("This noun variant could not be found.");
      if (detail?.variantKind && found && (!isGermanEntryMatch(found.data, detail.variantKind === "entry" ? detail.entry.lemma : word)
        || (detail.variantKind === "entry" && found.data.partOfSpeech !== detail.entry.partOfSpeech))) throw new Error("This entry could not be verified.");
      if (detail?.savedEntry && found && !isGermanEntryMatch(found.data, word)) throw new Error("This saved word could not be found.");
      if (!found) {
        if (!detail && (await showBasicTranslation() || sequence !== lookupSequence)) return;
        result.innerHTML = '<p class="muted">No dictionary entry or translation found. Try another spelling or switch to EN → DE.</p>';
        return;
      }
      sourceLink.href = found.sourceUrl;
      if (detail?.previousData) {
        found.data.entryChoices = mergeEntryChoices(detail.previousData.entryChoices, found.data.entryChoices);
        if (detail.variantKind === "comparison" && !found.data.comparisonVariants?.length) found.data.comparisonVariants = detail.previousData.comparisonVariants;
      }
      renderGermanEntry(found.data, detail?.backState);
    }
  } catch (error) {
    if (sequence !== lookupSequence) return;
    if (!detail && !translationAttempted && !controller.signal.aborted && (requestedMode === "de-en" || options.automatic)) {
      try { if (await showBasicTranslation()) return; } catch { /* Keep the original lookup error if fallback is unavailable. */ }
      if (sequence !== lookupSequence) return;
    }
    if (detail?.previousData) {
      sourceLink.href = detail.previousData.sourceUrl;
      renderGermanEntry(detail.previousData, detail.backState, detail.variantKind ? "Could not load this entry. Please try again." : "Could not load this noun variant. Please try again.");
      return;
    }
    result.innerHTML = `${detail?.backState ? backButton() : ""}<p class="error">${escapeHtml(controller.signal.aborted ? "Lookup timed out. Please try again." : error.message)}</p><button id="retry">Retry</button>`;
    document.querySelector("#retry").addEventListener("click", () => runLookup(word, detail, options));
    if (detail?.backState) document.querySelector("#back-results").addEventListener("click", () => { cancelLookup(); renderSearchResults(detail.backState); });
  } finally {
    clearTimeout(timeout);
  }
}

function loadingMessage(word, detail, options, direction) {
  if (detail?.variantKind === "comparison") return `Loading ${detail.entry.degree} forms…`;
  if (detail?.variantKind === "entry") return `Loading ${detail.entry.partOfSpeech || "dictionary"} entry…`;
  if (detail?.previousData) return `Loading ${detail.entry.label || detail.entry.lemma}…`;
  if (detail) return `Loading grammar for ${detail.entry.lemma}…`;
  if (options.automatic) return "Checking language and meaning…";
  if (direction === "en-de") return `Finding translations for ${word}…`;
  return `Looking up ${word}…`;
}

function speakerButton(word, language, recording = "") {
  return `<button class="word-audio" data-speak="${escapeHtml(word)}" data-language="${language}" data-recording="${escapeHtml(recording)}" aria-label="Play ${escapeHtml(word)} pronunciation" title="Play ${escapeHtml(word)}">${uiIcon("play")}</button>`;
}

function backButton() {
  return `<button class="back-button" id="back-results">${uiIcon("arrow-left")}<span>Back to results</span></button>`;
}

function uiIcon(name) {
  const paths = {
    play: '<path d="m5 3 8 5-8 5Z" fill="currentColor" stroke="none"/>',
    "arrow-right": '<path d="M3 8h10m-4-4 4 4-4 4"/>',
    "arrow-left": '<path d="M13 8H3m4-4-4 4 4 4"/>',
    "arrow-up-right": '<path d="M4 12l8-8M4 4h8v8"/>',
    close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  };
  return `<svg class="ui-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}

function renderSearchResults(state) {
  stopMeaningLookup();
  currentEntry = undefined;
  sourceLink.href = state.sourceUrl;
  result.scrollTop = 0;
  const description = state.entries.length ? `${state.entries.length} German ${state.entries.length === 1 ? "match" : "matches"}` : "No German matches found.";
  result.innerHTML = `<div class="result-head"><div><p class="eyebrow">ENGLISH → GERMAN</p><h1 class="word-title">${escapeHtml(state.query)}</h1></div>${speakerButton(state.query, "en-GB")}</div><p class="results-count muted">${description}</p><div class="translation-list">${state.entries.map((entry, index) => `<article class="translation-card"><button class="open-entry" data-entry="${index}" aria-label="Open grammar for ${escapeHtml(entry.label)}"><span class="translation-word">${escapeHtml(entry.label)}</span>${entry.partOfSpeech ? `<span class="translation-pos">${escapeHtml(entry.partOfSpeech)}</span>` : ""}<span class="translation-meaning">${escapeHtml(entry.meaning)}</span><span class="translation-action">${["verb", "noun", "adjective", "pronoun", "article"].includes(entry.partOfSpeech) ? "Forms & grammar" : "View meaning"} ${uiIcon("arrow-up-right")}</span></button>${speakerButton(entry.lemma, "de-DE")}</article>`).join("")}</div><p class="audio-status muted" role="status"></p>`;
  result.querySelectorAll("[data-entry]").forEach((button) => button.addEventListener("click", () => {
    const entry = state.entries[Number(button.dataset.entry)];
    if (entry.data && !entry.detailUrl) {
      cancelLookup();
      tabEntryCache.clear();
      sourceLink.href = entry.url;
      result.scrollTop = 0;
      renderGermanEntry(entry.data, state);
    } else runLookup(entry.lemma, { entry, backState: state });
  }));
  bindPronunciation();
}

function renderGermanEntry(data, backState, message = "") {
  stopMeaningLookup();
  if (!message) cacheRenderedEntry(data);
  currentEntry = data;
  saveError = "";
  const saveButton = data.lemma && data.meaning?.trim() ? '<button id="save-word" class="save-word" type="button">Save</button>' : "";
  const separateForm = data.lemma.toLocaleLowerCase() !== data.word.toLocaleLowerCase();
  const audioButtons = `<div class="audio-controls">${speakerButton(data.lemma, "de-DE", data.audio?.[0])}<span>${escapeHtml(data.lemma)}</span>${separateForm ? `${speakerButton(data.word, "de-DE")}<span>${escapeHtml(data.word)}</span>` : ""}</div>`;
  const tags = [data.level, data.partOfSpeech, ...(data.grammarTags || [data.grammar])].filter(Boolean).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const tables = renderInflections(data.inflectionTables, data.partOfSpeech);
  const sourcePath = data.sourceUrl ? new URL(data.sourceUrl).pathname : "";
  const variantList = data.variants || [];
  const selectedByUrl = variantList.findIndex((variant) => new URL(variant.url).pathname === sourcePath);
  const selectedVariant = selectedByUrl >= 0 ? selectedByUrl : variantList.findIndex((variant) => variant.article === data.article);
  const variants = variantList.length > 1 ? `<div class="noun-variants" role="group" aria-label="Noun articles">${variantList.map((variant, index) => `<button type="button" class="noun-variant" data-noun-variant="${index}" aria-pressed="${index === selectedVariant}">${escapeHtml(variant.label)}</button>`).join("")}</div>` : "";
  const notes = (data.usageNotes || []).map((note) => `<p class="usage-note">${escapeHtml(note)}</p>`).join("");
  const degrees = data.comparisonVariants || [];
  const selectedDegree = degrees.findIndex(entry => new URL(entry.url).pathname === sourcePath);
  const comparison = degrees.length > 1 ? `<div class="noun-variants" role="group" aria-label="Adjective degree">${degrees.map((entry, index) => `<button type="button" class="noun-variant" data-degree="${index}" aria-pressed="${index === (selectedDegree >= 0 ? selectedDegree : 0)}">${escapeHtml(entry.label)}</button>`).join("")}</div>` : "";
  const choices = mergeEntryChoices(data.entryChoices);
  const selectedChoiceByUrl = choices.findIndex(entry => new URL(entry.url).pathname === sourcePath);
  const selectedChoice = selectedChoiceByUrl >= 0 ? selectedChoiceByUrl : choices.findIndex(entry => entry.partOfSpeech === data.partOfSpeech && normalizeGermanForm(entry.lemma) === normalizeGermanForm(data.lemma));
  const choiceButtons = new Set(choices.map(entry => entry.partOfSpeech)).size > 1 ? `<div class="noun-variants" role="group" aria-label="Dictionary entries">${choices.map((entry, index) => `<button type="button" class="noun-variant" data-entry-choice="${index}" aria-pressed="${index === selectedChoice}">${escapeHtml(entry.label)}</button>`).join("")}</div>` : "";
  const meaning = data.meaning || (data.meaningState === "unavailable" ? "English meaning unavailable." : "Finding English meaning…");
  result.innerHTML = `${backState ? backButton() : ""}<div class="result-head"><div><div class="word-heading"><h1 class="word-title">${escapeHtml(data.lemma)}</h1>${saveButton}</div><p class="ipa">${escapeHtml(data.ipa[0] || "")}</p></div>${audioButtons}</div>${choiceButtons}${variants}${comparison}<p class="gloss">${escapeHtml(meaning)}</p>${meaningAttribution(data.meaningSource)}${tags ? `<div class="grammar">${tags}</div>` : ""}${notes}${message ? `<p class="error variant-error">${escapeHtml(message)}</p>` : ""}${data.principalParts ? `<p class="principal-parts">${escapeHtml(data.principalParts)}</p>` : ""}${tables ? `<div class="inflection-grid">${tables}</div>` : ""}<p class="audio-status muted" role="status"></p>`;
  for (const [selector, entries, variantKind] of [["[data-degree]", degrees, "comparison"], ["[data-entry-choice]", choices, "entry"]]) {
    result.querySelectorAll(selector).forEach(button => button.addEventListener("click", () => {
      if (button.getAttribute("aria-pressed") === "true") return;
      const index = Number(variantKind === "comparison" ? button.dataset.degree : button.dataset.entryChoice);
      const entry = entries[index];
      if (!dictionaryEntryUrl(entry.url, data.sourceUrl)) return;
      runLookup(data.word, { entry, previousData: data, backState, variantKind });
    }));
  }
  result.querySelectorAll("[data-noun-variant]").forEach((button) => button.addEventListener("click", () => {
    if (button.getAttribute("aria-pressed") === "true") return;
    const variant = data.variants[Number(button.dataset.nounVariant)];
    runLookup(data.word, { entry: variant, backState, previousData: data });
  }));
  if (backState) document.querySelector("#back-results").addEventListener("click", () => { cancelLookup(); renderSearchResults(backState); });
  bindPronunciation();
  if (saveButton) {
    result.insertAdjacentHTML("beforeend", '<p id="save-status" class="muted save-status" role="status"></p>');
    result.querySelector("#save-word").addEventListener("click", saveCurrentWord);
    updateSaveButton();
  }
  if (!data.meaning && !data.meaningState) loadMissingMeaning(data, backState, message);
}

function inflectionColumns(table, partOfSpeech) {
  const cases = table.rows.filter(row => /^(?:Nom\.?|Gen\.?|Dat\.?|Acc\.?)$/i.test(row[0]));
  const article = ["noun", "adjective"].includes(partOfSpeech) && cases.length >= 3
    && cases.every(row => row.length === 3 && /^(?:der|die|das|des|dem|den|ein|eine|einer|eines|einem|einen|kein|keine|keiner|keines|keinem|keinen)$/i.test(row[1]));
  return `<col class="label-column">${article ? '<col class="article-column"><col>' : ""}`;
}

function renderInflections(tables, partOfSpeech) {
  const groups = new Map();
  for (const table of tables) {
    const group = table.group || "";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(table);
  }
  return [...groups].map(([group, tables]) => `<section class="inflection-group">${group ? `<h2 class="group-title">${escapeHtml(group)}</h2>` : ""}${tables.map((table) => `<section class="inflection"><h3>${escapeHtml(table.title)}</h3><div class="table-scroll"><table lang="de"><colgroup>${inflectionColumns(table, partOfSpeech)}</colgroup>${table.rows.map((row, ri) => `<tr>${row.map((cell, ci) => { const meta = table.cells[ri][ci]; const tag = meta.header ? "th" : "td"; return `<${tag} lang="${meta.header ? "en" : "de"}" colspan="${meta.colSpan}" rowspan="${meta.rowSpan}">${escapeHtml(cell).replace(/\//g, "/<wbr>")}</${tag}>`; }).join("")}</tr>`).join("")}</table></div></section>`).join("")}</section>`).join("");
}

function bindPronunciation() {
  result.querySelectorAll("[data-speak]").forEach((button) => button.addEventListener("click", async () => {
    stopPronunciation();
    const sequence = lookupSequence;
    const status = result.querySelector(".audio-status");
    status.textContent = "";
    if (button.dataset.recording) {
      const recording = new Audio(button.dataset.recording);
      activeAudio = recording;
      try { await recording.play(); return; } catch { recording.pause(); }
      if (sequence !== lookupSequence || activeAudio !== recording) return;
    }
    if (!("speechSynthesis" in window)) { status.textContent = "Speech playback is unavailable in this browser."; return; }
    const utterance = new SpeechSynthesisUtterance(button.dataset.speak);
    utterance.lang = button.dataset.language;
    const voice = window.speechSynthesis.getVoices().find((candidate) => candidate.lang.toLowerCase().startsWith(utterance.lang.slice(0, 2)));
    if (voice) utterance.voice = voice;
    utterance.onerror = (event) => { if (event.error !== "canceled" && event.error !== "interrupted") status.textContent = "Could not play this word. Check your browser's speech voices."; };
    window.speechSynthesis.speak(utterance);
  }));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

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

input.addEventListener("input", () => { inputEdited = true; });
chrome.storage.local.get(["lookupWord", "lookupMode", "lookupAuto", "lookupHint"]).then(({ lookupWord, lookupMode, lookupAuto, lookupHint }) => {
  if (inputEdited || lookupSequence !== 0) return;
  setMode(lookupMode === "en-de" ? "en-de" : "de-en");
  if (lookupWord) {
    input.value = lookupWord;
    runLookup(lookupWord, null, { automatic: lookupAuto === true, hint: lookupHint });
  } else renderEmptyState();
});

modeToggle.addEventListener("click", () => {
  inputEdited = true;
  cancelLookup();
  setMode(mode === "de-en" ? "en-de" : "de-en");
  chrome.storage.local.set({ lookupMode: mode, lookupAuto: false }).catch(() => {});
  if (input.value.trim()) runLookup(input.value.trim());
  else renderEmptyState();
});
document.querySelector("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  runLookup(input.value.trim());
});

function setMode(nextMode) {
  mode = nextMode;
  const english = mode === "en-de";
  document.documentElement.dataset.mode = mode;
  modeToggle.textContent = english ? "EN → DE" : "DE → EN";
  modeToggle.setAttribute("aria-pressed", String(english));
  modeToggle.setAttribute("aria-label", `${english ? "English to German" : "German to English"}. Click to switch to ${english ? "German to English" : "English to German"}`);
  searchLabel.textContent = english ? "YOUR ENGLISH WORD" : "YOUR GERMAN WORD";
  input.placeholder = english ? "e.g. small, brother, make" : "e.g. schön, Haus, gehen";
  input.setAttribute("aria-label", english ? "English word" : "German word");
  sourceLink.href = english ? "https://www.verbformen.com/en-de/" : "https://www.verbformen.com/";
}

function renderEmptyState() {
  result.innerHTML = `<div class="empty-state"><p class="eyebrow">A little clarity, word by word</p><h1>${mode === "en-de" ? "Find the German word." : "Make German make sense."}</h1><p class="hint">Select text on a page and choose <strong>Look up with Currywurst</strong>. The language is detected automatically. For typed searches, click the language button to choose the direction.</p></div>`;
}

function stopPronunciation() {
  activeAudio?.pause();
  activeAudio = undefined;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function cancelLookup() {
  lookupSequence++;
  activeController?.abort();
  stopPronunciation();
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
  cancelLookup();
  const sequence = lookupSequence;
  const controller = new AbortController();
  activeController = controller;
  const requestedMode = mode;
  const timeout = setTimeout(() => controller.abort(), options.automatic ? 25000 : 15000);
  if (!detail) chrome.storage.local.set(options.automatic
    ? { lookupWord: word, lookupAuto: true, lookupHint: options.hint || "" }
    : { lookupWord: word, lookupMode: mode, lookupAuto: false }).catch(() => {});
  sourceLink.href = detail?.entry.url || `https://www.verbformen.com/${mode === "en-de" ? "en-de/" : ""}?w=${encodeURIComponent(word)}`;
  result.innerHTML = '<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span>Finding your word…</div>';
  result.scrollTop = 0;
  try {
    if (options.automatic && !detail) {
      const match = await detectAndLookup(word, options.hint, requestedMode, controller);
      if (sequence !== lookupSequence) return;
      if (!match) {
        result.innerHTML = '<p class="muted">No matching German or English entry found. Try another spelling or choose a direction using the language button above.</p>';
        return;
      }
      setMode(match.mode);
      chrome.storage.local.set({ lookupMode: match.mode, lookupAuto: false }).catch(() => {});
      if (match.state) renderEnglishResults(match.state);
      else {
        sourceLink.href = match.sourceUrl;
        renderGermanEntry(match.data);
      }
    } else if (requestedMode === "en-de" && !detail) {
      const page = await searchEnglish(word, controller);
      const entries = parseEnglishResults(page.html, word, page.sourceUrl);
      if (sequence !== lookupSequence) return;
      renderEnglishResults({ query: word, entries, sourceUrl: page.sourceUrl });
    } else {
      const found = detail
        ? await fetchPage(fullDictionaryEntryUrl(detail.entry.url, detail.entry.url) || detail.entry.url, controller).then((page) => ({ data: parseVerbformen(page.html, word, page.sourceUrl), sourceUrl: page.sourceUrl }))
        : await lookupGermanEntry(word, (url) => fetchPage(url, controller), controller.signal);
      if (sequence !== lookupSequence) return;
      if (!found) {
        result.innerHTML = '<p class="muted">No matching German entry found. Try another spelling or switch to EN → DE.</p>';
        return;
      }
      sourceLink.href = found.sourceUrl;
      renderGermanEntry(found.data, detail?.backState);
    }
  } catch (error) {
    if (sequence !== lookupSequence) return;
    result.innerHTML = `${detail ? '<button class="back-button" id="back-results">← Back to results</button>' : ""}<p class="error">${escapeHtml(controller.signal.aborted ? "Lookup timed out. Please try again." : error.message)}</p><p class="muted">You can also open the dictionary using the source link below.</p><button id="retry">Retry</button>`;
    document.querySelector("#retry").addEventListener("click", () => runLookup(word, detail, options));
    if (detail) document.querySelector("#back-results").addEventListener("click", () => { cancelLookup(); renderEnglishResults(detail.backState); });
  } finally {
    clearTimeout(timeout);
  }
}

function speakerButton(word, language, recording = "") {
  return `<button class="word-audio" data-speak="${escapeHtml(word)}" data-language="${language}" data-recording="${escapeHtml(recording)}" aria-label="Play ${escapeHtml(word)} pronunciation" title="Play ${escapeHtml(word)}">▶</button>`;
}

function renderEnglishResults(state) {
  sourceLink.href = state.sourceUrl;
  result.scrollTop = 0;
  result.innerHTML = `<div class="result-head"><div><p class="eyebrow">ENGLISH → GERMAN</p><h1 class="word-title">${escapeHtml(state.query)}</h1></div>${speakerButton(state.query, "en-GB")}</div><p class="results-count muted">${state.entries.length ? `${state.entries.length} German ${state.entries.length === 1 ? "match" : "matches"} · choose one to see its forms` : "No German matches found. Try another word or check Verbformen below."}</p><div class="translation-list">${state.entries.map((entry, index) => `<article class="translation-card"><button class="open-entry" data-entry="${index}" aria-label="Open grammar for ${escapeHtml(entry.label)}"><span class="translation-word">${escapeHtml(entry.label)}</span>${entry.partOfSpeech ? `<span class="translation-pos">${escapeHtml(entry.partOfSpeech)}</span>` : ""}<span class="translation-meaning">${escapeHtml(entry.meaning)}</span><span class="translation-action">${["verb", "noun", "adjective", "pronoun", "article"].includes(entry.partOfSpeech) ? "Forms & grammar" : "View meaning"} ↗</span></button>${speakerButton(entry.lemma, "de-DE")}</article>`).join("")}</div><p class="audio-status muted" role="status"></p>`;
  result.querySelectorAll("[data-entry]").forEach((button) => button.addEventListener("click", () => {
    const entry = state.entries[Number(button.dataset.entry)];
    if (entry.data && !entry.detailUrl) {
      cancelLookup();
      sourceLink.href = entry.url;
      result.scrollTop = 0;
      renderGermanEntry(entry.data, state);
    } else runLookup(entry.lemma, { entry, backState: state });
  }));
  bindPronunciation();
}

function renderGermanEntry(data, backState) {
  const separateForm = data.lemma.toLocaleLowerCase() !== data.word.toLocaleLowerCase();
  const audioButtons = `<div class="audio-controls">${speakerButton(data.lemma, "de-DE", data.audio?.[0])}<span>${escapeHtml(data.lemma)}</span>${separateForm ? `${speakerButton(data.word, "de-DE")}<span>${escapeHtml(data.word)}</span>` : ""}</div>`;
  const tags = [data.level, data.partOfSpeech, ...(data.grammarTags || [data.grammar])].filter(Boolean).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const tables = renderInflections(data.inflectionTables);
  result.innerHTML = `${backState ? '<button class="back-button" id="back-results">← Back to results</button>' : ""}<div class="result-head"><div><h1 class="word-title">${escapeHtml(data.lemma)}</h1><p class="ipa">${escapeHtml(data.ipa[0] || "")}</p></div>${audioButtons}</div><p class="gloss">${escapeHtml(data.meaning || "Meaning not found")}</p>${tags ? `<div class="grammar">${tags}</div>` : ""}${data.principalParts ? `<p class="principal-parts">${escapeHtml(data.principalParts)}</p>` : ""}${tables ? `<div class="inflection-grid">${tables}</div>` : ""}<p class="audio-status muted" role="status"></p>`;
  if (backState) document.querySelector("#back-results").addEventListener("click", () => { cancelLookup(); renderEnglishResults(backState); });
  bindPronunciation();
}

function renderInflections(tables) {
  const groups = new Map();
  for (const table of tables) {
    const group = table.group || "";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(table);
  }
  return [...groups].map(([group, tables]) => `<section class="inflection-group">${group ? `<h2 class="group-title">${escapeHtml(group)}</h2>` : ""}${tables.map((table) => `<section class="inflection"><h3>${escapeHtml(table.title)}</h3><div class="table-scroll"><table><colgroup><col class="label-column"></colgroup>${table.rows.map((row, ri) => `<tr>${row.map((cell, ci) => { const meta = table.cells[ri][ci]; const tag = meta.header ? "th" : "td"; return `<${tag} colspan="${meta.colSpan}" rowspan="${meta.rowSpan}">${escapeHtml(cell)}</${tag}>`; }).join("")}</tr>`).join("")}</table></div></section>`).join("")}</section>`).join("");
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

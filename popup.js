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
chrome.storage.local.get(["lookupWord", "lookupMode"]).then(({ lookupWord, lookupMode }) => {
  if (inputEdited || lookupSequence !== 0) return;
  setMode(lookupMode === "en-de" ? "en-de" : "de-en");
  if (lookupWord) {
    input.value = lookupWord;
    runLookup(lookupWord);
  } else renderEmptyState();
});

modeToggle.addEventListener("click", () => {
  inputEdited = true;
  cancelLookup();
  setMode(mode === "de-en" ? "en-de" : "de-en");
  chrome.storage.local.set({ lookupMode: mode }).catch(() => {});
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
  modeToggle.innerHTML = `${english ? "EN → DE" : "DE → EN"} <span aria-hidden="true">⇄</span>`;
  modeToggle.setAttribute("aria-pressed", String(english));
  modeToggle.setAttribute("aria-label", `Switch to ${english ? "German to English" : "English to German"}`);
  searchLabel.textContent = english ? "YOUR ENGLISH WORD" : "YOUR GERMAN WORD";
  input.placeholder = english ? "e.g. small, brother, make" : "e.g. schön, Haus, gehen";
  input.setAttribute("aria-label", english ? "English word" : "German word");
  sourceLink.href = english ? "https://www.verbformen.com/en-de/" : "https://www.verbformen.com/";
}

function renderEmptyState() {
  result.innerHTML = `<div class="empty-state"><p class="eyebrow">A little clarity, word by word</p><h1>${mode === "en-de" ? "Find the German word." : "Make German make sense."}</h1><p class="hint">Type a word above, or select text on a page and choose a Currywurst lookup from the right-click menu.</p></div>`;
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
  if (!response.ok) throw new Error(`Verbformen returned HTTP ${response.status}`);
  return { html: await response.text(), sourceUrl: response.url || url };
}

async function searchEnglish(word, controller) {
  if (!englishForm) {
    const page = await fetchPage("https://www.verbformen.com/en-de/", controller);
    englishForm = parseEnglishSearchForm(page.html, page.sourceUrl);
  }
  const fields = new URLSearchParams(englishForm.fields);
  fields.set("w", word);
  if (englishForm.method === "POST") {
    return fetchPage(englishForm.action, controller, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: fields.toString() });
  }
  const url = new URL(englishForm.action);
  for (const [key, value] of fields) url.searchParams.set(key, value);
  return fetchPage(url.href, controller);
}

async function runLookup(word, detail = null) {
  if (!word) return;
  cancelLookup();
  const sequence = lookupSequence;
  const controller = new AbortController();
  activeController = controller;
  const timeout = setTimeout(() => controller.abort(), 15000);
  if (!detail) chrome.storage.local.set({ lookupWord: word, lookupMode: mode }).catch(() => {});
  sourceLink.href = detail?.entry.url || `https://www.verbformen.com/${mode === "en-de" ? "en-de/" : ""}?w=${encodeURIComponent(word)}`;
  result.innerHTML = '<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span>Finding your word…</div>';
  result.scrollTop = 0;
  try {
    if (mode === "en-de" && !detail) {
      const page = await searchEnglish(word, controller);
      const entries = parseEnglishResults(page.html, word, page.sourceUrl);
      if (sequence !== lookupSequence) return;
      renderEnglishResults({ query: word, entries, sourceUrl: page.sourceUrl });
    } else {
      const page = await fetchPage(detail?.entry.url || `https://www.verbformen.com/?w=${encodeURIComponent(word)}`, controller);
      const data = parseVerbformen(page.html, word, page.sourceUrl);
      if (sequence !== lookupSequence) return;
      sourceLink.href = page.sourceUrl;
      renderGermanEntry(data, detail?.backState);
    }
  } catch (error) {
    if (sequence !== lookupSequence) return;
    result.innerHTML = `${detail ? '<button class="back-button" id="back-results">← Back to results</button>' : ""}<p class="error">${escapeHtml(controller.signal.aborted ? "Lookup timed out. Please try again." : error.message)}</p><p class="muted">You can also open the dictionary using the source link below.</p><button id="retry">Retry</button>`;
    document.querySelector("#retry").addEventListener("click", () => runLookup(word, detail));
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
  result.innerHTML = `<div class="result-head"><div><p class="eyebrow">ENGLISH → GERMAN</p><h1 class="word-title">${escapeHtml(state.query)}</h1></div>${speakerButton(state.query, "en-GB")}</div><p class="results-count muted">${state.entries.length ? `${state.entries.length} German ${state.entries.length === 1 ? "match" : "matches"} · choose one to see its forms` : "No German matches found. Try another word or check Verbformen below."}</p><div class="translation-list">${state.entries.map((entry, index) => `<article class="translation-card"><button class="open-entry" data-entry="${index}" aria-label="Open grammar for ${escapeHtml(entry.label)}"><span class="translation-word">${escapeHtml(entry.label)}</span>${entry.partOfSpeech ? `<span class="translation-pos">${escapeHtml(entry.partOfSpeech)}</span>` : ""}<span class="translation-meaning">${escapeHtml(entry.meaning)}</span><span class="translation-action">Forms & grammar ↗</span></button>${speakerButton(entry.lemma, "de-DE")}</article>`).join("")}</div><p class="audio-status muted" role="status"></p>`;
  result.querySelectorAll("[data-entry]").forEach((button) => button.addEventListener("click", () => {
    const entry = state.entries[Number(button.dataset.entry)];
    runLookup(entry.lemma, { entry, backState: state });
  }));
  bindPronunciation();
}

function renderGermanEntry(data, backState) {
  const separateForm = data.lemma.toLocaleLowerCase() !== data.word.toLocaleLowerCase();
  const audioButtons = `<div class="audio-controls">${speakerButton(data.lemma, "de-DE", data.audio?.[0])}<span>${escapeHtml(data.lemma)}</span>${separateForm ? `${speakerButton(data.word, "de-DE")}<span>${escapeHtml(data.word)}</span>` : ""}</div>`;
  const tags = [data.level, data.partOfSpeech, data.grammar].filter(Boolean).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const tables = data.inflectionTables.map((table) => `<section class="inflection"><h2>${escapeHtml(table.title)}</h2><div class="table-scroll"><table><colgroup><col class="label-column"></colgroup>${table.rows.map((row, ri) => `<tr>${row.map((cell, ci) => { const meta = table.cells[ri][ci]; const tag = meta.header ? "th" : "td"; return `<${tag} colspan="${meta.colSpan}" rowspan="${meta.rowSpan}">${escapeHtml(cell)}</${tag}>`; }).join("")}</tr>`).join("")}</table></div></section>`).join("");
  result.innerHTML = `${backState ? '<button class="back-button" id="back-results">← Back to results</button>' : ""}<div class="result-head"><div><h1 class="word-title">${escapeHtml(data.lemma)}</h1><p class="ipa">${escapeHtml(data.ipa[0] || "")}</p></div>${audioButtons}</div><p class="gloss">${escapeHtml(data.meaning || "Meaning not found")}</p>${tags ? `<div class="grammar">${tags}</div>` : ""}${tables ? `<div class="inflection-grid">${tables}</div>` : ""}<p class="audio-status muted" role="status"></p>`;
  if (backState) document.querySelector("#back-results").addEventListener("click", () => { cancelLookup(); renderEnglishResults(backState); });
  bindPronunciation();
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
    status.textContent = "Synthesized pronunciation";
    window.speechSynthesis.speak(utterance);
  }));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

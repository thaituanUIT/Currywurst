const input = document.querySelector("#word");
const result = document.querySelector("#result");
const sourceLink = document.querySelector("#source");

let lookupSequence = 0;
let activeController;
let inputEdited = false;
input.addEventListener("input", () => { inputEdited = true; });
chrome.storage.local.get("lookupWord").then(({ lookupWord }) => {
  if (lookupWord && !inputEdited && lookupSequence === 0) {
    input.value = lookupWord;
    runLookup(lookupWord);
  }
});

document.querySelector("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  runLookup(input.value.trim());
});

async function runLookup(word) {
  if (!word) return;
  const sequence = ++lookupSequence;
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  const timeout = setTimeout(() => controller.abort(), 15000);
  chrome.storage.local.set({ lookupWord: word }).catch(() => {});
  result.innerHTML = '<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span>Finding your word…</div>';
  sourceLink.href = `https://www.verbformen.com/?w=${encodeURIComponent(word)}`;
  let data;
  try {
    const response = await fetch(
      `https://www.verbformen.com/?w=${encodeURIComponent(word)}`,
      { headers: { Accept: "text/html" }, signal: controller.signal },
    );
    if (!response.ok)
      throw new Error(`Verbformen returned HTTP ${response.status}`);
    data = parseVerbformen(await response.text(), word, response.url);
  } catch (error) {
    data = { error: controller.signal.aborted ? "Lookup timed out. Please try again." : error.message };
  } finally {
    clearTimeout(timeout);
  }
  if (sequence !== lookupSequence) return;
  if (!data || data.error) {
    result.innerHTML = `<p class="error">${escapeHtml(data?.error || "Lookup failed")}</p><p class="muted">Open the Verbformen result to view the complete entry.</p><button id="retry">Retry</button>`;
    document.querySelector("#retry").addEventListener("click", () => runLookup(word));
    return;
  }
  const hasSeparateForm = data.lemma.toLocaleLowerCase() !== data.word.toLocaleLowerCase();
  const audioButtons = `<div class="audio-controls"><button class="word-audio" data-speak="${escapeAttr(data.lemma)}" data-recording="${escapeAttr(data.audio?.[0] || "")}" aria-label="Play ${escapeAttr(data.lemma)} pronunciation" title="Play ${escapeAttr(data.lemma)}">▶</button><span>${escapeHtml(data.lemma)}</span>${hasSeparateForm ? `<button class="word-audio" data-speak="${escapeAttr(data.word)}" aria-label="Play ${escapeAttr(data.word)} pronunciation" title="Play ${escapeAttr(data.word)}">▶</button><span>${escapeHtml(data.word)}</span>` : ""}</div>`;
  const tags = [data.level, data.partOfSpeech, data.grammar].filter(Boolean).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const inflectionSections = data.inflectionTables.map((table) => `<section class="inflection"><h2>${escapeHtml(table.title)}</h2><div class="table-scroll"><table>${table.rows.map((row, ri) => `<tr>${row.map((cell, ci) => { const meta = table.cells[ri][ci]; const tag = meta.header ? "th" : "td"; return `<${tag} colspan="${meta.colSpan}" rowspan="${meta.rowSpan}">${escapeHtml(cell)}</${tag}>`; }).join("")}</tr>`).join("")}</table></div></section>`).join("");
  result.innerHTML = `<div class="result-head"><div><h1 class="word-title">${escapeHtml(data.lemma)}</h1><p class="ipa">${escapeHtml(data.ipa[0] || "")}</p></div>${audioButtons}</div><p class="gloss">${escapeHtml(data.meaning || "Meaning not found")}</p>${tags ? `<div class="grammar">${tags}</div>` : ""}${inflectionSections ? `<div class="inflection-grid">${inflectionSections}</div>` : ""}`;
  result.querySelectorAll("[data-speak]").forEach((button) => button.addEventListener("click", async () => {
    const recording = button.dataset.recording;
    if (recording) {
      try { await new Audio(recording).play(); return; } catch { /* fall back to German speech */ }
    }
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(button.dataset.speak);
    utterance.lang = "de-DE";
    const voice = speechSynthesis.getVoices().find((candidate) => candidate.lang.toLowerCase().startsWith("de"));
    if (voice) utterance.voice = voice;
    speechSynthesis.speak(utterance);
  }));
}


function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}
function escapeAttr(value) {
  return escapeHtml(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

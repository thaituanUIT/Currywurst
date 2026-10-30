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
  const audioButton = '<button class="word-audio" id="play-audio" aria-label="Play pronunciation" title="Play German pronunciation">▶</button>';
  const tags = [data.level, data.partOfSpeech, data.grammar].filter(Boolean).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const inflectionSections = data.inflectionTables.map((table) => `<section class="inflection"><h2>${escapeHtml(table.title)}</h2><div class="table-scroll"><table>${table.rows.map((row, ri) => `<tr>${row.map((cell, ci) => { const meta = table.cells[ri][ci]; const tag = meta.header ? "th" : "td"; return `<${tag} colspan="${meta.colSpan}" rowspan="${meta.rowSpan}">${escapeHtml(cell)}</${tag}>`; }).join("")}</tr>`).join("")}</table></div></section>`).join("");
  const formNote = data.lemma.toLowerCase() !== data.word.toLowerCase() ? `<p class="form-note">${escapeHtml(data.word)}${data.matchedForm ? ` · ${escapeHtml(data.matchedForm)}` : ""} is a form of <strong>${escapeHtml(data.lemma)}</strong></p>` : "";
  result.innerHTML = `<div class="result-head"><div><h1 class="word-title">${escapeHtml(data.lemma)}</h1>${formNote}<p class="ipa">${escapeHtml(data.ipa[0] || "")}</p></div>${audioButton}</div><p class="gloss">${escapeHtml(data.meaning || "Meaning not found")}</p>${tags ? `<div class="grammar">${tags}</div>` : ""}${inflectionSections}`;
  document.querySelector("#play-audio").addEventListener("click", async () => {
    if (data.audio.length) {
      try { await new Audio(data.audio[0]).play(); return; } catch { /* use speech fallback */ }
    }
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(data.word);
      utterance.lang = "de-DE";
      const germanVoice = speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("de"));
      if (germanVoice) utterance.voice = germanVoice;
      speechSynthesis.speak(utterance);
    }
  });
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

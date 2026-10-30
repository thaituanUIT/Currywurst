const input = document.querySelector("#word");
const result = document.querySelector("#result");
const sourceLink = document.querySelector("#source");

chrome.storage.local.get("lookupWord").then(({ lookupWord }) => {
  if (lookupWord) {
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
  result.textContent = "Looking up…";
  sourceLink.href = `https://www.verbformen.com/?w=${encodeURIComponent(word)}`;
  const data = await chrome.runtime.sendMessage({ type: "lookup", word });
  if (!data || data.error) {
    result.innerHTML = `<p class="error">${escapeHtml(data?.error || "Lookup failed")}</p><p class="muted">Open the Verbformen result to view the complete entry.</p>`;
    return;
  }
  const buttons = data.audio.map((url) => `<button class="play" data-audio="${escapeAttr(url)}" title="Play pronunciation">▶</button>`).join("");
  const ipa = data.ipa.length ? data.ipa.join(" · ") : "Pronunciation transcription unavailable";
  const entries = data.linkedEntries.map((entry) => `<a target="_blank" rel="noreferrer" href="${escapeAttr(entry.url)}">${escapeHtml(entry.label || "Related form")}</a>`).join("");
  result.innerHTML = `<div class="wordline"><h1>${escapeHtml(data.title)}</h1>${buttons}</div><p class="ipa">${escapeHtml(ipa)}</p><p class="definition">${escapeHtml(data.description || data.excerpt || "No entry text found. Use the source link for the full result.")}</p>${entries ? `<div class="links">${entries}</div>` : ""}`;
  result.querySelectorAll("[data-audio]").forEach((button) => button.addEventListener("click", () => new Audio(button.dataset.audio).play()));
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
function escapeAttr(value) { return escapeHtml(value); }

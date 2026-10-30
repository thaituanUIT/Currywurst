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
  let data;
  try {
    const response = await fetch(`https://www.verbformen.com/?w=${encodeURIComponent(word)}`, { headers: { Accept: "text/html" } });
    if (!response.ok) throw new Error(`Verbformen returned HTTP ${response.status}`);
    data = parseVerbformen(await response.text(), word, response.url);
  } catch (error) {
    data = { error: error.message };
  }
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

function parseVerbformen(html, word, sourceUrl) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = doc.querySelector("h1")?.textContent?.trim() || word;
  const description = doc.querySelector('meta[name="description"]')?.content?.trim() || "";
  const text = doc.body?.innerText || "";
  const audio = [...doc.querySelectorAll("audio source, audio, a[href$='.mp3'], a[href$='.ogg']")]
    .map((node) => node.src || node.href)
    .filter((src) => src && /^https:\/\//.test(src));
  const ipa = [...text.matchAll(/\/[ˈˌa-zɐ-ʒɡŋɔɛœɪʊʃçʁəːˑ̯̃̈.\-]+\//giu)].slice(0, 5).map((match) => match[0]);
  const linkedEntries = [...doc.querySelectorAll("a[href]")]
    .filter((link) => /\/conjugation\/|\/declension\//.test(new URL(link.href).pathname))
    .slice(0, 5)
    .map((link) => ({ label: link.textContent.trim(), url: new URL(link.href).href }));
  return { word, title, description, excerpt: text.replace(/\s+/g, " ").slice(0, 900), ipa: [...new Set(ipa)], audio: [...new Set(audio)], linkedEntries, sourceUrl };
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }
function escapeAttr(value) { return escapeHtml(value); }

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
    const response = await fetch(
      `https://www.verbformen.com/?w=${encodeURIComponent(word)}`,
      { headers: { Accept: "text/html" } },
    );
    if (!response.ok)
      throw new Error(`Verbformen returned HTTP ${response.status}`);
    data = parseVerbformen(await response.text(), word, response.url);
  } catch (error) {
    data = { error: error.message };
  }
  if (!data || data.error) {
    result.innerHTML = `<p class="error">${escapeHtml(data?.error || "Lookup failed")}</p><p class="muted">Open the Verbformen result to view the complete entry.</p>`;
    return;
  }
  const buttons = data.audio
    .map(
      (url) =>
        `<button class="play" data-audio="${escapeAttr(url)}" title="Play pronunciation">▶</button>`,
    )
    .join("");
  const ipa = data.ipa.length
    ? data.ipa.join(" · ")
    : "Pronunciation transcription unavailable";
  const entries = data.linkedEntries
    .map(
      (entry) =>
        `<a target="_blank" rel="noreferrer" href="${escapeAttr(entry.url)}">${escapeHtml(entry.label || "Related form")}</a>`,
    )
    .join("");
  result.innerHTML = `<div class="wordline"><h1>${escapeHtml(data.title)}</h1>${buttons}</div><p class="ipa">${escapeHtml(ipa)}</p><p class="definition">${escapeHtml(data.description || data.excerpt || "No entry text found. Use the source link for the full result.")}</p>${entries ? `<div class="links">${entries}</div>` : ""}`;
  result
    .querySelectorAll("[data-audio]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        new Audio(button.dataset.audio).play(),
      ),
    );
}

function parseVerbformen(html, word, sourceUrl) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const heading = doc.querySelector("h1");
  const title = heading?.textContent?.trim() || word;
  const main = heading?.closest("main, article") || heading?.parentElement?.parentElement || doc.body;
  const text = main?.innerText || "";
  const headingIndex = text.indexOf(title);
  let entryText = headingIndex >= 0 ? text.slice(headingIndex, headingIndex + 2600).trim() : text.slice(0, 2600).trim();
  const tableHeading = entryText.search(new RegExp(`Declension of ${escapeRegExp(word)} in singular|Conjugation of ${escapeRegExp(word)} in`, "i"));
  if (tableHeading > 0) entryText = entryText.slice(0, tableHeading).trim();
  const audio = [
    ...main.querySelectorAll("audio[src], audio source[src], a[href]"),
  ]
    .map((node) => node.src || node.href)
    .filter((src) => {
      if (!src || !/^https:\/\//.test(src)) return false;
      try { return /\.(mp3|ogg|wav|m4a)(?:$|[?#])/i.test(new URL(src).pathname + new URL(src).search); }
      catch { return false; }
    });
  const ipa = [...entryText.matchAll(/\/[ˈˌɐ-ʒɡŋɔɛœɪʊʃçʁəːˑ̯̃̈.\-]*[ˈˌɐ-ʒɡŋɔɛœɪʊʃçʁəːˑ̯̃̈][ˈˌɐ-ʒɡŋɔɛœɪʊʃçʁəːˑ̯̃̈.\-]*\//giu)]
    .slice(0, 5)
    .map((match) => match[0]);
  const linkedEntries = [...doc.querySelectorAll("a[href]")]
    .filter((link) =>
      /\/conjugation\/|\/declension\//.test(new URL(link.href).pathname),
    )
    .slice(0, 5)
    .map((link) => ({
      label: link.textContent.trim(),
      url: new URL(link.href).href,
    }));
  const detailLines = entryText.split("\n").map((line) => line.trim()).filter(Boolean);
  const detailStart = detailLines.findIndex((line) => /^A1\s*[·.]|^[A-C][12]\s*[·.]/i.test(line));
  const relevantLines = (detailStart >= 0 ? detailLines.slice(detailStart) : detailLines)
    .filter((line) => !/^Declension of|^Conjugation of|^The most important forms|^\d+Comment|^☆|^Our website|^Handy on the go|^Help us|^Endings\b/i.test(line))
    .slice(0, 18);
  const description = relevantLines.join("\n");
  return {
    word,
    title,
    description,
    excerpt: entryText.replace(/\s+/g, " ").slice(0, 900),
    ipa: [...new Set(ipa)],
    audio: [...new Set(audio)],
    linkedEntries,
    sourceUrl,
  };
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

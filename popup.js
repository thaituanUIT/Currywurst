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
  const audioButton = data.audio.length ? '<button class="word-audio" id="play-audio" aria-label="Play pronunciation" title="Play pronunciation">▶</button>' : "";
  const tags = [data.level, data.partOfSpeech, data.grammar].filter(Boolean).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const formItems = Object.entries(data.forms).filter(([, value]) => value).map(([label, value]) => `<div class="form-item"><span class="form-label">${escapeHtml(label)}</span><span class="form-value">${escapeHtml(value)}</span></div>`).join("");
  result.innerHTML = `<div class="result-head"><div><h1 class="word-title">${escapeHtml(data.word)}</h1><p class="ipa">${escapeHtml(data.ipa[0] || "")}</p></div>${audioButton}</div><p class="gloss">${escapeHtml(data.meaning || "Meaning not found")}</p>${tags ? `<div class="grammar">${tags}</div>` : ""}${formItems ? `<div class="forms">${formItems}</div>` : ""}`;
  if (data.audio.length) {
    document.querySelector("#play-audio").addEventListener("click", async () => {
      try { await new Audio(data.audio[0]).play(); }
      catch { result.insertAdjacentHTML("beforeend", '<p class="muted">Could not play this recording.</p>'); }
    });
  }
}

function parseVerbformen(html, word, sourceUrl) {
  // Keep the fetched page inert: Verbformen markup contains inline handlers,
  // which must never be attached to the extension popup's live document.
  const template = document.createElement("template");
  template.innerHTML = html;
  const doc = template.content;
  const heading = doc.querySelector("h1");
  const title = heading?.textContent?.trim() || word;
  const main = heading?.closest("main, article") || heading?.parentElement?.parentElement || doc;
  const text = main?.innerText || main?.textContent || "";
  const headingIndex = text.indexOf(title);
  let entryText = headingIndex >= 0 ? text.slice(headingIndex, headingIndex + 2600).trim() : text.slice(0, 2600).trim();
  const tableHeading = entryText.search(new RegExp(`Declension of ${escapeRegExp(word)} in singular|Conjugation of ${escapeRegExp(word)} in`, "i"));
  if (tableHeading > 0) entryText = entryText.slice(0, tableHeading).trim();
  const audio = [
    ...main.querySelectorAll("audio[src], audio source[src], a[href]"),
  ]
    .map((node) => node.getAttribute("src") || node.getAttribute("href"))
    .filter((src) => {
      if (!src) return false;
      try {
        const url = new URL(src, sourceUrl);
        return url.origin === "https://www.verbformen.com" && /\.(mp3|ogg|wav|m4a)(?:$|[?#])/i.test(url.pathname + url.search);
      }
      catch { return false; }
    })
    .map((src) => new URL(src, sourceUrl).href);
  const ipa = [...entryText.matchAll(/\/[^/\n]{1,40}\//g)]
    .map((match) => match[0])
    .filter((value) => /[ˈˌəɐɛɪɔʊʃçʁøœyɡŋ]/u.test(value))
    .slice(0, 5);
  const lines = entryText.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const level = lines.find((line) => /^(A1|A2|B1|B2|C1|C2)\s*[·.]?$/i.test(line)) || "";
  const grammarLine = lines.find((line) => /\b(noun|verb|adjective|pronoun|article)\b/i.test(line) && /·/.test(line)) || "";
  const grammarParts = grammarLine.split("·").map((part) => part.trim()).filter(Boolean);
  const partOfSpeech = grammarParts[0] || "";
  const grammar = grammarParts.slice(1, 3).join(" · ");
  const meaning = lines.find((line) => /^[A-Za-z][A-Za-z ,'-]{2,80}$/.test(line) && line.includes(",") && !/^(The |Our |Handy )/i.test(line)) || "";
  const formStart = grammarLine ? lines.indexOf(grammarLine) + 1 : -1;
  const formLines = formStart >= 0 ? lines.slice(formStart, formStart + 8) : [];
  const article = formLines.find((line) => /^(der|die|das)\s+/i.test(line) && line.toLowerCase().includes(word.toLowerCase())) || "";
  const matchingForms = formLines.filter((line) => line.toLowerCase() === word.toLowerCase() || /^[\p{L}äöüÄÖÜß-]+$/.test(line) && line.length > 2);
  const forms = { Article: article, Singular: matchingForms[0] || word, Plural: matchingForms[1] || "" };
  return {
    word,
    title,
    level: level.replace(/[·.]$/, ""),
    partOfSpeech,
    grammar,
    meaning,
    forms,
    excerpt: entryText.replace(/\s+/g, " ").slice(0, 900),
    ipa: [...new Set(ipa)],
    audio: [...new Set(audio)],
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

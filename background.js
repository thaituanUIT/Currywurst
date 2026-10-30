const MENU_ID = "german-word-lookup";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Look up German: %s",
      contexts: ["selection"]
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;
  const word = info.selectionText.trim().split(/\s+/)[0].replace(/^[^\p{L}äöüÄÖÜß]+|[^\p{L}äöüÄÖÜß]+$/gu, "");
  if (!word) return;
  await chrome.storage.local.set({ lookupWord: word });
  chrome.action.openPopup().catch(() => {
    chrome.windows.create({ url: chrome.runtime.getURL("popup.html"), type: "popup", width: 390, height: 520 });
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "lookup" || typeof message.word !== "string") return;
  lookupVerbformen(message.word).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
  return true;
});

async function lookupVerbformen(word) {
  // Verbformen's public search form is the canonical lookup. Use the site search
  // page first; parse results client-side and keep every request user initiated.
  const url = `https://www.verbformen.com/?w=${encodeURIComponent(word)}`;
  const response = await fetch(url, { headers: { Accept: "text/html" } });
  if (!response.ok) throw new Error(`Verbformen returned HTTP ${response.status}`);
  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = doc.querySelector("h1")?.textContent?.trim() || word;
  const description = doc.querySelector('meta[name="description"]')?.content?.trim() || "";
  const text = doc.body?.innerText || "";
  const audio = [...doc.querySelectorAll("audio source, audio, a[href$='.mp3'], a[href$='.ogg']")]
    .map((node) => node.src || node.href)
    .filter((src) => src && /^https:\/\//.test(src));
  const ipa = [...text.matchAll(/\/[ˈˌa-zɐ-ʒɡŋɔɛœɪʊʃçʁəːˑ̯̃̈.\-]+\//giu)].slice(0, 5).map((m) => m[0]);
  const linkedEntries = [...doc.querySelectorAll("a[href]")]
    .filter((a) => /\/conjugation\/|\/declension\//.test(a.pathname))
    .slice(0, 5)
    .map((a) => ({ label: a.textContent.trim(), url: new URL(a.href).href }));
  return {
    word,
    title,
    description,
    excerpt: text.replace(/\s+/g, " ").slice(0, 900),
    ipa: [...new Set(ipa)],
    audio: [...new Set(audio)],
    linkedEntries,
    sourceUrl: response.url
  };
}

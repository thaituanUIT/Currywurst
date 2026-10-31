const LOOKUP_MENUS = {
  "german-word-lookup": { mode: "de-en", title: "Look up in English: %s" },
  "english-word-lookup": { mode: "en-de", title: "Look up in German: %s" },
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const [id, menu] of Object.entries(LOOKUP_MENUS)) {
      chrome.contextMenus.create({ id, title: menu.title, contexts: ["selection"] });
    }
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  const menu = LOOKUP_MENUS[info.menuItemId];
  if (!menu || !info.selectionText) return;
  const word = info.selectionText.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!word) return;
  await chrome.storage.local.set({ lookupWord: word, lookupMode: menu.mode });
  try {
    await chrome.action.openPopup();
  } catch {
    chrome.windows.create({ url: chrome.runtime.getURL("popup.html"), type: "popup", width: 580, height: 400 });
  }
});

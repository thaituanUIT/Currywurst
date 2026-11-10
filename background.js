importScripts("i18n.js");
importScripts("dictionary-sources.js");
importScripts("saved-words.js");
const savedWordsStore = createSavedWordsStore(chrome.storage.local);

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "savedWords") return;
  const actions = {
    list: () => savedWordsStore.list(),
    add: () => savedWordsStore.add(message.entry),
    remove: () => savedWordsStore.remove(message.id),
    restore: () => savedWordsStore.restore(message.entry),
  };
  Promise.resolve().then(() => {
    if (!Object.hasOwn(actions, message.action)) throw Object.assign(new Error("Unknown saved-word action."), { messageKey: "saved_unknown_action" });
    return actions[message.action]();
  }).then(value => respond({ ok: true, ...value }), error => respond({ ok: false, error: error.message, messageKey: error.messageKey }));
  return true;
});

const MENU_ID = "german-word-lookup";

function registerLookupMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ID, title: t("context_lookup"), contexts: ["selection"] });
  });
}
chrome.runtime.onInstalled.addListener(registerLookupMenu);
chrome.runtime.onStartup.addListener(registerLookupMenu);

// This function runs only after the user explicitly invokes the lookup.
// Read the language of the selection's nearest marked element, not page text.
function readSelectionLanguage() {
  const node = window.getSelection()?.anchorNode;
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  const language = element?.closest("[lang]")?.getAttribute("lang") || document.documentElement.lang || "";
  return language.toLowerCase().split(/[-_]/)[0];
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;
  const word = info.selectionText.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!word) return;
  let hint = "";
  if (tab?.id != null) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [info.frameId || 0] },
        func: readSelectionLanguage,
      });
      const language = results[0]?.result;
      if (language === "en" || language === "de") hint = language;
    } catch { /* Restricted pages can still use dictionary-based detection. */ }
  }
  await chrome.storage.local.set({ lookupWord: word });
  // Unlike persistent input history, this one-use request expires on restart.
  await chrome.storage.session.set({ pendingLookup: { word, hint, createdAt: Date.now() } });
  try {
    await chrome.action.openPopup();
  } catch {
    chrome.windows.create({ url: chrome.runtime.getURL("popup.html"), type: "popup", width: 580, height: 400 });
  }
});

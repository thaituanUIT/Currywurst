import { registerContextMenu } from './context-menu';
import { createSavedWordsHandler } from './saved-words-handler';

chrome.runtime.onMessage.addListener(createSavedWordsHandler(chrome.storage.local));
registerContextMenu();

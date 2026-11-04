# <img src="icon.svg" alt="Currywurst icon" width="48" height="48" align="center"> Currywurst

Look up German and English words while you read in Chrome or Microsoft Edge. Currywurst shows translations, pronunciation, and available German grammar and word forms from Verbformen.

When a verified entry has no English meaning on Verbformen, Currywurst tries English Wiktionary and labels the definition with its source.

When no German dictionary entry is found, Currywurst tries MyMemory for a **basic English translation**. You can listen and save it; detailed grammar and word forms are unavailable for that result.

See [CHANGELOG.md](CHANGELOG.md) for major updates, new features, and fixes.

The interface currently ships in English, with localization support ready for additional languages. Interface language is independent of the German–English lookup direction. Contributors can follow the [localization guide](docs/I18N.md) to add a language.

See [lookup coverage notes](https://github.com/thaituanUIT/Currywurst/blob/main/docs/VERBFORMEN.md) for supported word types, form matching, and known limits.

## Install the extension

Download the **Currywurst ZIP** under **Assets** on the [latest release page](https://github.com/thaituanUIT/Currywurst/releases/latest) and extract it. If the first release is not available yet, use **Code → Download ZIP** on this repository.

Keep the extracted folder in a permanent location; your browser loads the extension from it.

1. Open Chrome and go to `chrome://extensions`, or open Edge and go to `edge://extensions`.
2. Turn on **Developer mode** using the switch on the page.
3. Click **Load unpacked**.
4. Choose the extracted folder containing `manifest.json`.
5. If you do not see the extension icon, open the browser’s Extensions menu (the puzzle-piece icon) and pin **Currywurst**.

## Update the extension

New versions and their release notes appear on [GitHub Releases](https://github.com/thaituanUIT/Currywurst/releases/latest). **You need to update your installed copy manually.**

1. Download the latest **Currywurst ZIP** under **Assets** and extract it.
2. Copy its contents into your existing Currywurst folder, replacing the old files. Keep the folder in the same location.
3. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
4. Click **Reload** on the Currywurst card, then reopen the popup.

For notifications, sign in to GitHub and choose **Watch → Custom → Releases** on this repository. Notifications let you know when a version is published; follow the steps above to install it.

Automatic extension updates will be available through the future Chrome Web Store or Microsoft Edge Add-ons version. Its installation link will be added here when available. You will need to install that store version to receive automatic updates.

If you installed with Git, pull the latest changes and reload the extension. Maintainers can follow [Publishing a GitHub release](https://github.com/thaituanUIT/Currywurst/blob/main/docs/RELEASING.md) for the automated release process.

## Look up a word

1. Open a webpage that contains German or English text.
2. Select one word.
3. Right-click the selection and choose **Look up with Currywurst**. The extension uses the page's language and dictionary matches to choose the lookup direction automatically.
4. The lookup card shows the word and its meaning. Use the speaker buttons to hear the selected word and its dictionary form when they differ.
5. English searches show a list of German matches. Click a match to open its grammar, then **Back to results** to return to the list.
6. Use **Verbformen ↗** below the card to open the full source page.

You can also open the extension from the Extensions menu and type a word into the search box. The **DE → EN** button shows the current direction: German to English. Click it once to switch to **EN → DE**, and click again to switch back. Switching direction clears the previous word and results, ready for a new search. Currywurst remembers your last mode. Each mode has its own soft cream, mustard, and paprika colors.

When you reopen the popup, your last word stays in the search box. Click **Look up** to search it again. Opening the popup alone does not send another dictionary request, including after a browser restart.

Some words, such as “Gift” or “Bank”, exist in both languages. If the automatic choice is wrong, click the language button to reverse the direction and look up the word again.

Some nouns have more than one article. When article buttons appear, such as **die Vokabel** and **das Vokabel**, click one to see its meaning, usage notes, and word forms.

Adjective entries can offer **Positive**, **Comparative**, and **Superlative** buttons. If a lookup has different word types, choose the matching entry. Alternatives load when clicked.

Visited gender, comparison, and word-type tabs are kept in memory while the popup is open, so switching back shows the result immediately. Starting another lookup or switching translation direction clears this tab cache. Long table forms wrap within the table width, using German hyphenation where supported and breaks between slash-separated alternatives.

For a missing English definition, grammar appears first while Currywurst checks Wiktionary. If no suitable definition is found, the grammar remains available with **English meaning unavailable**.

If Verbformen has no matching German entry, or its lookup fails, Currywurst requests a basic translation from MyMemory instead. The card shows the translation and its source. The selected word is kept as entered, since its original dictionary form is unknown. Related-entry suggestions are not shown. MyMemory's free service has a [daily usage limit](https://mymemory.translated.net/doc/usagelimits.php); a translation may be unavailable when that limit is reached.

## Save words

Click **Save** beside a German word to keep its dictionary form and English meaning. For example, looking up **machst** saves **machen**. In English-to-German mode, open a German match first, then save it. Noun articles are retained, and different genders can be saved separately.

Open **Saved** to browse your list, newest first. The counter shows how many of the **100 available places** you have used. Clicking a word or its meaning returns to **Lookup** and starts a fresh German-to-English lookup.

Click **×** beside a saved word to delete it. **Undo** is available for five seconds. When the list is full, delete a word before adding another; existing entries are kept.

Your list stays on this browser after a restart and can be read offline. Looking up a saved word requires internet. Saving and deleting do not send dictionary requests, and the list is not synced to other browsers or devices.

Saved fallback definitions retain their Wiktionary source and licence links.

Saved basic translations retain their MyMemory attribution and the selected word.

## If something goes wrong

- **The lookup does not open:** Make sure a single word is selected, then right-click it again.
- **No result appears:** Check your internet connection and try the lookup again. Verbformen must be reachable.
- **The speaker does not sound like a recording:** When a recording is unavailable, the browser uses a speech voice in the word's language instead. Available voices depend on your computer.
- **The extension changed but the browser still shows the old version:** Open the Extensions page and click the reload button on the Currywurst card.

## Privacy and data use

This disclosure describes the current version of Currywurst in this repository.

**What the extension reads:** The text you select or type for a lookup. When you use the right-click action, it also reads the language label of the selected element or page to help choose the lookup direction. It does not send surrounding page text to the dictionary, scan pages in the background, or collect your browsing history.

**What leaves your browser:** Lookup text is sent over HTTPS to [Verbformen](https://www.verbformen.com/) to retrieve translations and word forms. Automatic language detection may try both lookup directions. If a form is not found, Currywurst may request related spellings to locate its dictionary entry. Opening a German match requests that word's entry when a separate page is available. Verbformen receives the lookup text and standard connection information, such as your IP address, and may retain its own request logs. Its own privacy terms apply to those requests.

When a verified German entry lacks an English gloss, its dictionary form is sent to the [English Wiktionary API](https://en.wiktionary.org/w/api.php). Currywurst may follow one related dictionary form explicitly linked by that source, matching the word type and noun gender. These requests omit browser credentials and send no surrounding webpage text. Wikimedia receives the requested word and standard connection information, including your IP address; its [privacy policy](https://foundation.wikimedia.org/wiki/Policy:Privacy_policy) applies. This fallback makes at most two requests within a four-second deadline.

If no German dictionary entry can be retrieved, the selected lookup text is sent to [MyMemory's translation API](https://mymemory.translated.net/doc/spec.php) with the language pair German → English. This fallback makes one HTTPS request within a four-second deadline, omits browser credentials and referrers, and sends no page URL or surrounding text. MyMemory receives the lookup text and standard connection information such as your IP address. No API key, account, or email is supplied by Currywurst; the service's [terms](https://mymemory.translated.net/doc/tos.php) and [usage limits](https://mymemory.translated.net/doc/usagelimits.php) apply. Only its lookup endpoint is used.

**Pronunciation:** Playing a dictionary recording requests an audio file from Verbformen. If a recording is unavailable, Currywurst asks the browser to speak the word. Depending on the voice and your browser or operating system, speech may be generated on your device or by a third-party speech service. That service may receive the word being spoken.

**What stays on your device:** The last lookup text and selected lookup direction are saved in the extension's local browser storage. This is not a complete lookup history and is not synced through Currywurst. Saved values remain until replaced or the browser clears the extension's data. A right-click lookup temporarily stores the selected word and its language hint in browser-session storage, then consumes that request when the popup opens. Reopening the popup restores the search text without sending it to Verbformen; click **Look up** or invoke a fresh right-click lookup to search again.

Words you choose to save are also stored locally, including their dictionary form, English meaning, word type, noun article when available, dictionary link, and save time. They remain until you delete them, clear the extension's storage, or uninstall the extension. The saved list is not uploaded or synced. Clicking a saved entry sends its dictionary form to Verbformen or opens its dictionary entry to perform a new lookup.

Wiktionary and MyMemory use separate caches in browser-session storage, each with at most 100 entries. Successful results are reused for up to 24 hours during that session; empty results for up to five minutes. Browser-session data clears on a browser restart. Saved Wiktionary definitions also retain source attribution, the source revision when available, and the [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) licence link. Saved MyMemory translations retain provider attribution without a Wiktionary licence label.

The current extension has no analytics, advertising, account system, or developer-operated lookup server. Only select or type text you are comfortable sending to the dictionary, fallback translation provider, and, when used, the speech service.

## Permissions explained

| Permission | Why Currywurst needs it |
| --- | --- |
| Context menus | Adds **Look up with Currywurst** to the right-click menu. |
| Local storage | Remembers your last lookup and direction, and keeps your saved words. |
| Active tab | Gives temporary access to the page you invoke the extension on, so it can read the selection's language label. |
| Scripting | Runs that small language-label check after your right-click lookup. |
| Access to `https://www.verbformen.com/*` | Retrieves dictionary entries, search results, and pronunciation recordings. |
| Access to `https://en.wiktionary.org/*` | Retrieves an English definition when a verified Verbformen entry has no English gloss. |
| Access to `https://api.mymemory.translated.net/*` | Retrieves a basic German-to-English translation when no dictionary entry can be retrieved. |

Currywurst does not request access to all websites, your browsing history, or the browser's cookie-management API.

## Security and reporting

Currywurst uses bundled JavaScript and the browser's standard Manifest V3 security policy. Fetched dictionary HTML is processed as data; extracted text is escaped before it is displayed in the popup. Grammar lookup destinations and dictionary-entry links are checked against Verbformen. Definition requests are restricted to English Wiktionary, and basic translation requests to MyMemory's API. Their results are displayed as escaped text with provider attribution.

The project includes automated behavior tests, but these are not an independent security audit or a guarantee that the extension is free of vulnerabilities. Browser testing, review of external HTML handling, and security scanning remain important before each public release. A passing test result should be associated with the exact version or commit that was checked.

If you find a security concern, use the repository's private vulnerability reporting option if it is enabled. Otherwise, ask the maintainer for a private contact method. Please do not post personal lookup text, credentials, or sensitive exploit details in public issues.

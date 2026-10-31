# <img src="icon.svg" alt="Currywurst icon" width="48" height="48" align="center"> Currywurst

Look up German and English words while you read in Chrome or Microsoft Edge. Currywurst shows translations, pronunciation, and available German grammar and word forms from Verbformen.

See [CHANGELOG.md](CHANGELOG.md) for major updates, new features, and fixes.

## Install the extension

This version is installed from a folder on your computer. Keep the folder where it is; the browser needs it to stay there.

1. Open Chrome and go to `chrome://extensions`, or open Edge and go to `edge://extensions`.
2. Turn on **Developer mode** using the switch on the page.
3. Click **Load unpacked**.
4. Choose the Currywurst folder you downloaded or were given.
5. If you do not see the extension icon, open the browser’s Extensions menu (the puzzle-piece icon) and pin **Currywurst**.

## Look up a word

1. Open a webpage that contains German or English text.
2. Select one word.
3. Right-click the selection and choose **Look up with Currywurst**. The extension uses the page's language and dictionary matches to choose the lookup direction automatically.
4. The lookup card shows the word and its meaning. Use the speaker buttons to hear the selected word and its dictionary form when they differ.
5. English searches show a list of German matches. Click a match to open its grammar, then **Back to results** to return to the list.
6. Use **Verbformen ↗** below the card to open the full source page.

You can also open the extension from the Extensions menu and type a word into the search box. The **DE → EN** button shows the current direction: German to English. Click it once to switch to **EN → DE**, and click again to switch back. Currywurst remembers your last mode. Each mode has its own soft cream, mustard, and paprika colors.

Some words, such as “Gift” or “Bank”, exist in both languages. If the automatic choice is wrong, click the language button to reverse the direction and look up the word again.

## If something goes wrong

- **The lookup does not open:** Make sure a single word is selected, then right-click it again.
- **No result appears:** Check your internet connection and try the lookup again. Verbformen must be reachable.
- **The speaker does not sound like a recording:** When a recording is unavailable, the browser uses a speech voice in the word's language instead. Available voices depend on your computer.
- **The extension changed but the browser still shows the old version:** Open the Extensions page and click the reload button on the Currywurst card.

## Privacy and data use

This disclosure describes the current version of Currywurst in this repository.

**What the extension reads:** The text you select or type for a lookup. When you use the right-click action, it also reads the language label of the selected element or page to help choose the lookup direction. It does not send surrounding page text to the dictionary, scan pages in the background, or collect your browsing history.

**What leaves your browser:** Lookup text is sent over HTTPS to [Verbformen](https://www.verbformen.com/) to retrieve translations and word forms. Automatic language detection may try both lookup directions. Opening a German match requests that word's entry. Verbformen receives the lookup text and standard connection information, such as your IP address, and may retain its own request logs. Its own privacy terms apply to those requests.

**Pronunciation:** Playing a dictionary recording requests an audio file from Verbformen. If a recording is unavailable, Currywurst asks the browser to speak the word. Depending on the voice and your browser or operating system, speech may be generated on your device or by a third-party speech service. That service may receive the word being spoken.

**What stays on your device:** The last lookup text, selected lookup direction, and language-detection settings are saved in the extension's local browser storage. This is not a complete lookup history and is not synced through Currywurst. Saved values remain until replaced or the browser clears the extension's data. Reopening the popup can repeat the last lookup and send that text to Verbformen again.

The current extension has no analytics, advertising, account system, or developer-operated lookup server. Only select or type text you are comfortable sending to the dictionary and, when used, the speech service.

## Permissions explained

| Permission | Why Currywurst needs it |
| --- | --- |
| Context menus | Adds **Look up with Currywurst** to the right-click menu. |
| Local storage | Remembers your last lookup and direction. |
| Active tab | Gives temporary access to the page you invoke the extension on, so it can read the selection's language label. |
| Scripting | Runs that small language-label check after your right-click lookup. |
| Access to `https://www.verbformen.com/*` | Retrieves dictionary entries, search results, and pronunciation recordings. |

Currywurst does not request access to all websites, your browsing history, or the browser's cookie-management API.

## Security and reporting

Currywurst uses bundled JavaScript and the browser's standard Manifest V3 security policy. Fetched dictionary HTML is processed as data; extracted text is escaped before it is displayed in the popup. Lookup request destinations and extracted dictionary-entry links are checked against the expected Verbformen address.

The project includes automated behavior tests, but these are not an independent security audit or a guarantee that the extension is free of vulnerabilities. Browser testing, review of external HTML handling, and security scanning remain important before each public release. A passing test result should be associated with the exact version or commit that was checked.

If you find a security concern, use the repository's private vulnerability reporting option if it is enabled. Otherwise, ask the maintainer for a private contact method. Please do not post personal lookup text, credentials, or sensitive exploit details in public issues.

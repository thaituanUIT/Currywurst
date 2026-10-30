# German Word Lookup

An on-demand Chromium extension for looking up selected German text on Verbformen. The same unpacked extension works in Chrome and Microsoft Edge.

## Install for local use

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this directory.
4. Select a German word on a page, right-click, and choose **Look up German: …**.

The extension sends one request when you explicitly trigger a lookup. It does not crawl or prefetch words. The result includes a source link; pronunciation audio is shown when a direct audio URL is exposed by the fetched result page.

## Implementation note

Verbformen page structure and lookup routes may change. The current lookup uses the site's `?w=` search URL and extracts available page metadata, IPA-like text, audio links, and conjugation/declension links. If Verbformen changes its search form or markup, update `parseVerbformen` in `parser.js`.

## Regression checks

Run `node --test tests/lookup.test.cjs` for search ordering and persistence. Open `tests/parser.html` in a browser for parser checks. The inline HTML fixtures are synthetic examples covering noun tables, an inflected verb, an adjective, and a missing entry; they do not verify current live site markup. No dependencies or build step are required.

Lookups time out after 15 seconds and offer Retry on failure. Manual searches are saved locally alongside context-menu searches.

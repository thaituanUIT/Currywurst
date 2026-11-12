# Changelog

Major features and fixes in Currywurst. Version numbers follow the extension manifest; no release dates are assumed.

## Unreleased

### Changed

- Migrate the extension to strict TypeScript modules and a React popup, retaining dictionary lookup, source verification, pronunciation, localization, saved-word storage, and the existing design.
- Build the popup and background worker with Vite. Source installations now require Node.js 24+, `npm ci`, and `npm run build`; load `dist/<version>/extension/`. Release ZIPs remain ready to load.
- Run the existing behavior and HTML parser fixtures automatically with Vitest and React DOM tests, and verify extracted release ZIPs in Chromium. Package only compiled runtime assets, catalogs, icons, and release documents.

## 1.6.2

### Fixed

- Start basic translation after a dictionary timeout with its own four-second deadline, while preserving cancellation on a new lookup or direction switch. Do not cache temporary Wiktionary failures as missing definitions; ignore malformed session-cache containers and reject unchanged German translations even when the provider uses combining umlauts. Add fallback adapter and popup integration tests with new words.
- Recover umlaut noun plurals and doubled-s endings such as **Widersprüchen → Widerspruch**, **Gedächtnissen → Gedächtnis**, and **Verhältnisses → Verhältnis**, while continuing to require source-listed evidence.
- Recover separable participles with longer particles, including **auseinandergesetzt** and **gegengesteuert**, and regular adjective superlatives such as **unwiderstehlichsten**. Normalize copied combining umlauts before generating lookup routes.
- Reject table subjects, articles, auxiliaries, and unprefixed stems as evidence for an unrelated dictionary entry. Keep joined and separated verb forms, optional letters, and shortened imperatives supported. Allow at most one additional dictionary request for lowercase words that need both adjective recovery and a third noun guess.
- Read saved words directly from local storage so opening an empty or existing list does not require a background message receiver. Show saved-list read errors once, and provide a reload instruction if the background worker is unavailable for saving, deletion, or Undo. Keep all changes serialized through the worker to protect the list across popup windows.

## 1.6.1

### Added

- Support for linked Woerter.net word definitions, including the preposition and conjunction entries for **ohne**, with source labels, saved source URLs, pronunciation support, and the required host permission and data disclosure.

### Fixed

- Follow exact candidate links even when the search page provides no full grammar card. Load and verify the selected definition before showing it, try another matching entry after a missing page, and keep unrelated words and destinations excluded.

## 1.6.0

### Fixed

- Resolve multiple exact search entries such as **ohne** as a preposition and conjunction, including entries without separate dictionary URLs. Split flat result layouts safely, avoid counting nested grammar summaries twice, and preserve distinct word types or senses even when their search URL is shared. Switch inline entries without another request and retain the selected type when reopening a saved word.

## 1.5.1

### Added

- Browser-native localization support with an English message catalog for the popup, context menu, extension metadata, accessibility labels, status messages, and grammar controls. Package locale files in release downloads and document how to add translations. Only English ships initially; interface language stays independent of dictionary content and lookup direction.

## 1.5.0

### Added

- Basic German-to-English translation via MyMemory when no Verbformen entry can be retrieved, including words such as **Pommes**. Keep pronunciation and saving, show provider attribution, and omit grammatical details that the translation source does not supply.
- Source-linked word-type choices, including **klein** (adjective) and **das Klein** (noun), with separate meanings and grammar.
- A bounded browser-session cache for fallback translations, plus the MyMemory host permission and updated data disclosure.

### Changed

- Reuse already visited gender, comparison-degree, and word-type tabs within the current lookup. Clear this in-memory cache on a new lookup or direction switch, and keep failed or cancelled loads out of it.
- Keep result cards concise, with source attribution and essential feedback. Remove related-entry suggestions.

### Fixed

- Keep one adjective word-type button while switching comparison degrees, including **klein → kleiner → am kleinsten**. Use the positive adjective as the stable type entry and keep degree-specific pages in the comparison controls.
- Recover regular **-t/-et** verb forms such as **verheiratet → verheiraten**, including forms without a **ge-** prefix. Prefer an exact adjective entry when available and verify every derived infinitive against the original selected form.
- Keep grammar tables within their fixed width, with compact article columns, automatic hyphenation, and line-break opportunities between slash-separated forms.

## 1.4.0

### Fixed

- Resolve German umlaut and sharp-s dictionary URLs, including **Übungsbuch**, and recover regular past-tense forms such as **verwendete → verwenden**.
- Prefer the exact matching headword among multiple entries, handle regular/irregular headword annotations, and preserve valid grammar when an English gloss is missing.
- Keep comparison degrees and different word types available for entries such as **ausgesprochen**, loading alternatives on demand.

### Added

- English Wiktionary fallback for verified entries without an English meaning, including gender-aware related lemmas, a four-second deadline, at most two requests, and a bounded session cache.
- Source and licence attribution for fallback definitions in lookup results and saved words, plus the narrowly scoped English Wiktionary host permission and updated disclosures.

## 1.3.0

### Added

- Save up to 100 German dictionary forms with their English meanings, with duplicate prevention and separate entries for different noun genders.
- Browse saved words offline, open a saved word in German-to-English lookup, and delete entries with a five-second Undo option.
- Keep the list in local browser storage across restarts, with serialized writes to enforce the limit across popup windows.

### Fixed

- Recover declined adjectives such as **landesweiten → landesweit** through adjective entries, verifying the selected form against source tables. Include final-e, contracted-stem, and comparative candidates within a maximum of two additional requests.

## 1.2.1

### Fixed

- Recover nouns such as **Praktikantin** when query searches fail by checking the exact noun page before removing endings, including for lowercase input.
- Recover feminine plurals ending in **-innen**, such as **Lehrerinnen → Lehrerin**, only when the source verifies the selected form.
- Keep noun recovery within the existing six-request limit and reject unrelated dictionary results.

### Added

- Automated GitHub releases on version tags, with tests, manifest-version validation, changelog notes, a downloadable extension ZIP, and a SHA-256 checksum.

### Changed

- Updated installation and update instructions to use GitHub Releases and explain release notifications and manual extension updates.

## 1.2.0 — Stable Release

### Added

- Article buttons for nouns with multiple genders, such as **die Vokabel** and **das Vokabel**.
- Separate meanings, usage notes, and declension tables for each noun variant, loaded when selected.
- Preserve alternate-gender entries even when their English translations are identical.

### Changed

- Simplified empty-state text and removed example placeholders from the search box.
- Increased the search input text size.
- Enabled language-aware hyphenation in inflection tables to avoid arbitrary letter wrapping.

### Fixed

- Recover noun singulars such as **Vokabeln → Vokabel** when plural searches return no matching entry, verifying the selected form against the source's stated forms or declension tables.
- Read explicitly stated genitive and plural forms when a noun's compact header is unavailable.
- Keep the original inflected word available for pronunciation when switching noun variants.
- Retain the current entry if loading an alternate noun variant fails.
- Preserve alternate articles when a search result opens its full dictionary entry.

## 1.1.3

### Added

- Lookup recovery through general search and conjugation routes, with bounded requests and a cache within each lookup.
- Support for search-card entries without dedicated inflection pages, including adverbs, conjunctions, particles, and prepositions when supplied by Verbformen.
- [Lookup coverage notes](docs/VERBFORMEN.md) documenting word types, researched routes, matching rules, and verification limits.

### Fixed

- Clear the search box and previous results when switching lookup direction, cancel pending requests, and focus the input without automatically searching the old word.
- Resolve shortened singular imperatives such as **buchstabier → buchstabieren**, checking the original selection against the source's imperative forms.
- Recognize optional letters, slash alternatives, and footnote markers in word forms.
- Match separated verb particles and joined subordinate-clause forms, plus irregular adjective comparison forms.
- Accept nested tense and voice routes and retrieve the complete dictionary entry when available.
- Preserve grammar labels on entries without a CEFR level and ignore footnote markers in metadata.
- Request English translations explicitly and reject unexpected redirects outside Verbformen.
- Show a clear missing-entry message rather than displaying an unrelated result.

## 1.1.2

### Fixed

- Preserve complete separable verb names, such as **aufrufen**, when looking up forms such as **aufgerufen**.
- Show verb properties including level, regularity, auxiliary verb, and separability, plus available principal forms.
- Group conjugations under their proper moods: Indicative, Subjunctive, Conditional, Imperative, and Infinitive/Participle.
- Include short imperative tables and infinitive/participle lists that the previous parser skipped.
- Replace incorrect combined titles such as “Present · Imperfect” with the actual tense heading.
- Remove duplicate overview tables while retaining distinct tenses and moods with identical forms.
- Keep descriptive page paragraphs out of grammar tags.

## 1.1.0

### Added

- English-to-German lookup with a list of German matches, pronunciation, and links to each match's grammar inside the popup.
- A one-click **DE → EN / EN → DE** toggle that remembers the selected direction.
- A second cream, mustard, and paprika palette for English-to-German mode.
- **Back to results** navigation without repeating the English search.
- Automatic direction selection for highlighted text, using the page's language label and dictionary matches.
- Temporary page access through `activeTab` and `scripting` to read that language label after a lookup is requested.
- README disclosures explaining data use, local storage, pronunciation services, permissions, and security limitations.

### Changed

- Consolidated right-click lookup into one **Look up with Currywurst** action.
- Added a fallback to the other language direction when automatic lookup finds no matching entry.
- Kept separate pronunciation controls for an inflected word and its German dictionary form.

### Fixed

- Select English translations by their language labels instead of guessing from text length or punctuation.
- Filter translation-feedback prompts out of displayed text and table headings.
- Prevent older requests from replacing newer results when searches or modes change.

## 1.0.0

### Changed

- Introduced Currywurst branding and the icon in the popup.
- Restyled the popup with a light cream palette inspired by the icon's mustard and paprika colors.
- Replaced raw page excerpts with structured meanings, pronunciation, grammar tags, and inflection tables.
- Made the popup wider and shorter, with full-width tables and a consistent first-column width.

### Fixed

- Use PNG files for browser extension icons.
- Move HTML parsing out of the background service worker and into the popup.
- Remove irrelevant navigation links that opened invalid extension addresses.
- Preprocess fetched markup to remove scripts and inline event handlers before parsing.

## 0.1.0

### Added

- Initial Chrome and Microsoft Edge extension.
- Right-click lookup of selected German words using Verbformen.
- A popup search field, dictionary results, pronunciation controls, and a link to the source entry.
- On-demand requests without bulk crawling or background collection of words.

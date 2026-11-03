# Changelog

Major features and fixes in Currywurst. Version numbers follow the extension manifest; no release dates are assumed.

## Unreleased

### Added

- Basic German-to-English translation via MyMemory when no Verbformen entry can be retrieved, including words such as **Pommes**. Keep pronunciation and saving, label the provider and missing grammar clearly, cache results within the browser session, and document the new host permission and data disclosure.

### Removed

- Related-entry candidate suggestions and their extra conjugation-search fallback.

### Changed

- Reuse already visited gender, comparison-degree, and word-type tabs within the current lookup. Clear this in-memory cache on a new lookup or direction switch, and keep failed or cancelled loads out of it.

### Fixed

- Keep one adjective word-type button while switching comparison degrees, including **klein → kleiner → am kleinsten**. Use the positive adjective as the stable type entry and keep degree-specific pages in the comparison controls.
- Show source-linked alternative word types on dictionary entries, including **klein** (adjective) and **das Klein** (noun). Keep each type's meanings and grammar separate, and reuse visited type tabs within the current lookup.
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

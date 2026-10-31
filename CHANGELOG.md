# Changelog

Major features and fixes in Currywurst. Version numbers follow the extension manifest; no release dates are assumed.

## 1.1.2 — Released

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

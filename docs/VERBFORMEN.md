# Verbformen lookup coverage

Research and implementation notes for the public Verbformen website, reviewed on 2026-11-02. These are website routes, not a documented dictionary API.

## Word types and routes

The [general search page](https://www.verbformen.com/search/) exposes nine word-type choices: verb, noun, adjective, adverb, article, pronoun, preposition, conjunction, and particle.

| Word type | Source layout and published route examples | Extension handling |
| --- | --- | --- |
| Verb | [Full conjugation](https://www.verbformen.com/conjugation/buchstabieren.htm), [imperative](https://www.verbformen.com/conjugation/imperativ/buchstabieren.htm), [indicative present](https://www.verbformen.com/conjugation/indikativ/praesens/buchstabieren.htm) | Resolve the lemma; preserve metadata, principal forms, moods, tenses, imperative, infinitive, and participles. Follow partial-page links to the complete entry. |
| Noun | [Noun declension](https://www.verbformen.com/declension/nouns/Einzelfall.htm) | Singular/plural case tables, gender, alternate endings, and optional letters. |
| Adjective | [Adjective declension and comparison](https://www.verbformen.com/declension/adjectives/adverbiell.htm) | Strong, weak, mixed, and predicative tables; comparison forms when supplied. |
| Article | [Article declension](https://www.verbformen.com/declension/articles/ein.htm) | Case tables by gender and number, including missing forms marked with a dash. |
| Pronoun | [Pronoun declension](https://www.verbformen.com/declension/pronouns/einer.htm) | Pronoun type, case tables, and slash alternatives. |
| Adverb | [Search cards](https://www.verbformen.com/search/adverbs/?l=11&w=) | Extract the matching card, English gloss, metadata, and pronunciation; no declension table is required. |
| Conjunction | [Search cards](https://www.verbformen.com/search/conjunctions/?l=11) | Extract meaning and coordinating/subordinating labels when supplied. |
| Particle | [Search cards](https://www.verbformen.com/search/particles/?l=11&w=) | Extract meaning and pronunciation without inventing an inflection table. |
| Preposition | General search lists this word type | Use the general search response and its matching card. No separate preposition-detail route was confirmed. |

The verb page also links to passive (`vpassiv`), statal-passive (`zpassiv`), interrogative (`fragesatz`), and subordinate-clause (`nebensatz`) variants. Nested dictionary links are accepted, while worksheet, example, download, PDF, and external-host links are excluded from entry resolution.

Some number words are presented as adjectives or nouns. No separate numeral or interjection route was confirmed. The parser can recognize those labels if a response provides them, but they are not claimed as independently verified source categories.

## Resolution order

Dictionary entries can link directly to other word types: [klein (adjective)](https://www.verbformen.com/declension/adjectives/klein.htm) links to [das Klein (noun)](https://www.verbformen.com/declension/nouns/Klein.htm), and the noun links back. Extract these explicit, type-labelled dictionary links as well as matching search cards. Preserve the active entry and all verified choices when completing a partial page or switching types. Load alternatives only when selected; validate the chosen lemma and word type, since the original inflected adjective need not be a form of the noun. Keep each type's meanings, article, pronunciation, comparison degrees, and inflection tables independent. Visited type pages use the current lookup's tab cache.

1. Request the selected word using the general lookup with English translations (`l=11`).
2. Accept a matching dictionary entry or a matching search card. A redirect by itself is not proof that the selected word matches.
3. If necessary, try the noun-declension search for a capitalized selection, or conjugation search otherwise, followed by general search for the same word.
4. For regular past-tense endings, try the corresponding infinitive spelling and verify the selection against its source forms; for example, [verwendete → verwenden](https://www.verbformen.com/conjugation/verwenden.htm). Capitalized selections retain noun priority. For a lowercase selection with an adjective ending (`-e`, `-en`, `-em`, `-er`, or `-es`), try its primary adjective candidate first. The [landesweit entry](https://www.verbformen.com/declension/adjectives/landesweit.htm) explicitly lists `landesweiten` and the other declined forms. An adjective candidate is accepted only if the source verifies the original selection.
5. Try the exact noun spelling with its initial letter capitalized before removing endings. The published [Praktikantin entry](https://www.verbformen.com/declension/nouns/Praktikantin.htm) is an example of a dedicated noun page that this fallback can reach even when query routes do not resolve it. Use the dedicated page for Latin spellings and the supported German filename encoding, including [Übungsbuch → U3bungsbuch.htm](https://www.verbformen.com/declension/nouns/U3bungsbuch.htm). Use noun search for other Unicode spellings. Then try at most two plausible noun singulars, such as `Vokabeln → Vokabel` or `Lehrerinnen → Lehrerin`. Accept a candidate only if its lemma or source forms verify the original selection.
6. Try any remaining adjective candidate, then at most two related infinitive spellings for a single-word imperative stem. Adjective recovery has at most two candidates in total; its second candidate can retain a final `e`, restore a contracted `el`/`er` stem, or remove a comparative ending. German umlauts and sharp-s use the published filename encoding (`ä → a3`, `ö → o3`, `ü → u3`, `ß → s5`, preserving uppercase initials). Other Unicode spellings use search queries. Capitalized selections keep noun recovery ahead of adjective recovery. Each result must still match the **original selection**, never just the guessed lemma.
7. If a response is a partial tense/voice page, request its complete dictionary entry when available.
8. If no verified match is found, offer up to eight related, source-linked search cards for explicit selection. Suggestions must come from an allowed German query route for the original selection and contain that selection in their headword. Do not collect suggestions from guessed recovery queries, dictionary-page cross-links, English searches, or navigation. Reuse the fetched pages; do not fetch every candidate. After selection, verify the chosen headword against the loaded entry and preserve the result list for Back navigation. Automatic language detection gives actual matches in either language priority over related suggestions.

Candidate handling was reviewed on 2026-11-04. [Pommes](https://en.wiktionary.org/wiki/Pommes) means fries/chips; [Pommesbude](https://www.verbformen.com/declension/nouns/Pommesbude.htm) means a chip shop/snack stand. A compound returned as a candidate is not evidence of a lemma relationship. The live `Pommes` query could not be retrieved in the development environment, so the reported current candidate-page markup and any recent site outage or update remain unverified. Coverage uses controlled search-card fixtures and routing tests.

German resolution shares a cache within the lookup. It retains the six-request allowance and reserves at most two extra requests when adjective or past-tense recovery applies, for a maximum of eight distinct dictionary requests. English search and automatic direction fallback can make additional requests. The existing lookup timeout still applies. This is a bounded lookup, not bulk crawling.

## Form matching

- **Short imperatives:** `buchstabier` can match the source's singular imperative `buchstabiere (du)`. This shortcut is limited to singular imperative evidence; mandatory endings in forms such as `arbeite`, `rede`, and `atme` are retained.
- **Optional letters:** Expand source notation such as `buchstabier(e)`, `aß(es)t`, and `Haus(e)s` with a limit on combinations.
- **Alternatives:** Recognize forms separated by slashes, such as `des/der`.
- **Footnotes:** Ignore superscript reference markers while comparing spellings.
- **Separable verbs:** Match separated forms and joined subordinate-clause forms when the source particle and lemma support them.
- **Comparison:** Check adjective comparison forms, including irregular examples such as `gut → besser → am besten`.
- **Adjective recovery:** Recover declined spellings such as `landesweiten → landesweit`, final-e adjectives such as `leises → leise`, and contracted or comparative stems such as `dunklen → dunkel` and `kleineren → klein`, checking every guess against the original source-listed form.
- **Regular -t/-et forms:** Try an exact adjective entry before deriving a verb infinitive, as in `verheiratet → verheiraten`. Inseparable prefixes do not require `ge-`. Source-verified candidates also handle forms such as `geöffnet → öffnen` and `eingekauft → einkaufen`. Only the original selection's presence in the source forms establishes a match; generated infinitives alone are insufficient. Capitalized selections retain noun priority. Recovery keeps the shared maximum of eight requests.
- **Search-only entries:** Keep lexical cards for words that have no inflection tables or dedicated detail links.
- **Multiple noun genders:** Preserve separate entries for linked articles, such as `die Vokabel` and `das Vokabel`. Article buttons load the chosen variant on demand; meanings, usage notes, and declension tables stay specific to that variant. Identical English glosses do not cause different gender entries to be discarded.
- **Noun plural recovery:** If a compact header is unavailable, also read the explicitly stated genitive and nominative-plural pair in the entry introduction. Candidate singulars do not become matches unless this source evidence or an inflection table verifies the selection.

## Multiple entries and missing English meanings

Search-card resolution prefers the exact selected headword before other source-verified matches. Regular/irregular annotations are removed from headwords, and cards with a verified dictionary link can be retained without an English gloss. A missing definition is separate from an unresolved word.

Adjective comparison links provide positive, comparative, and superlative choices. The positive headword remains the dictionary form, while the selected source page supplies the displayed forms. Distinct source-attested word types can be selected without eagerly fetching every alternative.

For a verified entry without English, the extension uses the [MediaWiki parse API](https://www.mediawiki.org/wiki/API:Parsing_wikitext) on English Wiktionary. It reads only the German section, matching the part of speech and noun gender, and may follow one explicitly linked form/lemma relationship. For example, Verbformen's masculine [Lernende](https://www.verbformen.com/declension/nouns/Lernende.htm) has no English gloss; the masculine Wiktionary [Lernender](https://en.wiktionary.org/wiki/Lernender) provides a matching learner/student definition. Feminine definitions are not substituted for masculine entries.

Grammar renders before this fallback. The fallback has a separate four-second deadline and at most two requests, preserves the grammar on failure, and is cancelled on navigation or a new lookup. Its session cache holds at most 100 entries, with positive results valid for up to 24 hours and empty results for five minutes. Definition source, revision when available, and CC BY-SA 4.0 attribution are retained when saved. Wiktionary audio is not requested; existing Verbformen recording/browser speech behavior remains in place.

## Verification and limits

The published pages above were reviewed. Lookup and matching behavior is covered by local tests with controlled responses; parser fixtures are in `tests/parser.html`. Live query URLs could not be independently exercised in the research browser, and the local browser runner was blocked by the execution sandbox. These checks therefore do not establish that every current live entry parses correctly.

No finite set of suffix rules covers every German spelling, rare form, ambiguous word, or future website change. Unknown forms are left unmatched rather than accepting an unrelated page. Source-provided variants are preferred over guesses.

Run the executable checks from the project directory:

```sh
node tests/parser-logic.test.cjs
node tests/lookup-routing.test.cjs
node tests/lookup.test.cjs
node tests/meaning.test.cjs
```

Open `tests/parser.html` in a browser to run the DOM-based parser fixtures.

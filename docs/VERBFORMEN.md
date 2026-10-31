# Verbformen lookup coverage

Research and implementation notes for the public Verbformen website, reviewed on 2026-10-31. These are website routes, not a documented dictionary API.

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

1. Request the selected word using the general lookup with English translations (`l=11`).
2. Accept a matching dictionary entry or a matching search card. A redirect by itself is not proof that the selected word matches.
3. If necessary, try the conjugation search and general search routes for the same word.
4. For a single-word imperative stem, try at most two related infinitive spellings. Each result must still match the **original selection** in its source forms.
5. If a response is a partial tense/voice page, request its complete dictionary entry when available.

German resolution shares a cache within the lookup and makes at most six distinct dictionary requests. English search and automatic direction fallback can make additional requests. This is a bounded lookup, not bulk crawling.

## Form matching

- **Short imperatives:** `buchstabier` can match the source's singular imperative `buchstabiere (du)`. This shortcut is limited to singular imperative evidence; mandatory endings in forms such as `arbeite`, `rede`, and `atme` are retained.
- **Optional letters:** Expand source notation such as `buchstabier(e)`, `aß(es)t`, and `Haus(e)s` with a limit on combinations.
- **Alternatives:** Recognize forms separated by slashes, such as `des/der`.
- **Footnotes:** Ignore superscript reference markers while comparing spellings.
- **Separable verbs:** Match separated forms and joined subordinate-clause forms when the source particle and lemma support them.
- **Comparison:** Check adjective comparison forms, including irregular examples such as `gut → besser → am besten`.
- **Search-only entries:** Keep lexical cards for words that have no inflection tables or dedicated detail links.

## Verification and limits

The published pages above were reviewed. Lookup and matching behavior is covered by local tests with controlled responses; parser fixtures are in `tests/parser.html`. Live query URLs could not be independently exercised in the research browser, and the local browser runner was blocked by the execution sandbox. These checks therefore do not establish that every current live entry parses correctly.

No finite set of suffix rules covers every German spelling, rare form, ambiguous word, or future website change. Unknown forms are left unmatched rather than accepting an unrelated page. Source-provided variants are preferred over guesses.

Run the executable checks from the project directory:

```sh
node tests/parser-logic.test.cjs
node tests/lookup-routing.test.cjs
node tests/lookup.test.cjs
```

Open `tests/parser.html` in a browser to run the DOM-based parser fixtures.

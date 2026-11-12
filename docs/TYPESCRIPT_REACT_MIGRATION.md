# TypeScript and React migration plan

Migrate Currywurst in small, independently verifiable changes: establish the extension build, make dependencies explicit, type the dictionary and browser boundaries, then replace popup rendering with React. Preserve the current lookup behavior, local data, visual design, permissions, and release format throughout.

This document records the original migration plan and its baseline. The implementation is now in `src/`; see [Developing Currywurst](DEVELOPING.md) for current architecture, commands, and verification. The original file paths below describe the pre-migration code.

**Evidence and reference.** Reviewed Currywurst commit `c01495901d87f90a9aca4f30047aad571349666c` and [Lesewelle commit `ba236a0`](https://github.com/ValeryStatinov/lesewelle-frontend/tree/ba236a0d189ca624facd41e624ea45e9de85403a). The baseline command `node --test tests/*.test.cjs` passes all nine test files. The separate browser fixtures in `tests/parser.html` were inspected but were not run in a browser.

| Current area | Migration concern |
| --- | --- |
| `popup.js`, 664 lines | Combines browser initialization, requests, state, HTML rendering, audio, and saved-word interactions. This needs the most careful decomposition. |
| `parser.js`, 586 lines; `lookup.js`, 234 lines | Contain substantial dictionary parsing and form verification. Preserve algorithms and bounded recovery requests while adding types. |
| `meaning.js`, 197 lines | Owns fallback deadlines, session caches, and provider attribution. Keep these separate from React rendering. |
| `background.js`; `saved-words.js` | The worker serializes saved-word mutations across popup windows; popup reads can access storage directly. Preserve that ownership. |
| `i18n.js`; `_locales/` | Chrome localization supplies messages, placeholders, document language/direction, and grammar labels. |
| `tests/*.test.cjs` | Tests use Node VM contexts, globals, and a custom popup DOM stub. They need a deliberate transition to module imports and DOM-based React tests. |
| `scripts/package-release.mjs`; `.github/workflows/release.yml` | Package an explicit list of root-level scripts today. They must package compiled artifacts once TypeScript becomes a runtime source. |

**How to use Lesewelle.** It is a Chrome extension rather than a conventional website. Adopt its extension boundaries and component organization selectively:

| Reference | Apply to Currywurst |
| --- | --- |
| [Separate Vite builds](https://github.com/ValeryStatinov/lesewelle-frontend/blob/ba236a0d189ca624facd41e624ea45e9de85403a/package.json) for background and React content | Use separate background and popup builds. Currywurst's React entry is `popup.html`; Lesewelle's injected content entry serves a different UI. |
| [Strict TypeScript configuration](https://github.com/ValeryStatinov/lesewelle-frontend/blob/ba236a0d189ca624facd41e624ea45e9de85403a/tsconfig.app.json) | Enable strict checking for migrated code, explicit imports, and Chrome API types. |
| [Typed Chrome messages](https://github.com/ValeryStatinov/lesewelle-frontend/blob/ba236a0d189ca624facd41e624ea45e9de85403a/src/core/chromeMessages/messages.ts) and dedicated handlers | Define saved-word request/response unions and a typed client. Validate message payloads at runtime as well. |
| [Feature components](https://github.com/ValeryStatinov/lesewelle-frontend/blob/ba236a0d189ca624facd41e624ea45e9de85403a/src/core/lib/features/WordDefinition/WordDefinition.tsx) | Separate lookup, entry details, inflection tables, pronunciation, attribution, and saved vocabulary. |
| Valtio, Tailwind, Radix, backend clients, authentication, analytics, injected widget | Leave these outside this migration. Start with React state/reducers and the existing CSS; introduce additional dependencies only for a demonstrated need. |

The reference's dependency versions describe that inspected revision. Select and lock compatible supported versions when implementing; do not copy its lockfile or configuration wholesale. If source code is reused, retain its MIT notice.

**Target architecture.** React owns the popup UI. Dictionary modules own parsing, requests, recovery, and fallbacks. The background worker owns context menus and saved-word mutations. Shared modules define messages, records, URL validation, and localization helpers.

```text
popup.html                       # Vite HTML entry; final path stays popup.html
manifest.json                    # canonical version, permissions, and entry paths
_locales/                        # existing Chrome catalogs
icons/ and icon.svg              # existing assets
src/
  background/
    index.ts
    context-menu.ts
    saved-words-handler.ts
  shared/
    dictionary-types.ts
    messages.ts
    storage.ts
    dictionary-sources.ts
    saved-words.ts
    i18n.ts
  dictionary/
    parser.ts
    lookup.ts
    client.ts
    meaning.ts
  popup/
    main.tsx
    App.tsx
    bootstrap.ts
    styles.css
    features/
      lookup/                    # form, controller/hook, results, entry details
      saved-words/               # storage client/hook, list, delete/undo
      pronunciation/             # audio and speech lifecycle
    components/                  # shared buttons, attribution, tables
tests/
  fixtures/
  unit/
  popup/
  extension/
scripts/
  build.mjs
  package-release.mjs
vite.config.popup.ts
vite.config.background.ts
dist/
  <version>/
    extension/                   # Load unpacked from here
      manifest.json
      popup.html
      background.js
      assets/
      _locales/
      icons/
    Currywurst-<version>.zip
    Currywurst-<version>.zip.sha256
    release-notes.md
```

Keep `parser.ts` together for the initial conversion; split it by responsibility only after parity is established. Use `unknown` and validation for network JSON, persisted data, and incoming messages. Define types for dictionary entries, search results, gender/comparison/word-type alternatives, inflection cell spans, saved records, pending lookups, localized errors, and provider attribution. Preserve existing wire and storage shapes while adding types.

Represent popup lookup states explicitly: idle, loading, results, entry, and error. Entry state also needs an independent meaning status, so grammar can appear while Wiktionary loads. Retain previous entry/results during alternative loading and errors, matching current behavior. Use request identifiers and `AbortController` refs; keep controllers, audio objects, timers, and caches outside reducer state.

Use React plus React DOM at runtime; TypeScript, Vite with the React plugin, Chrome/React/Node types, ESLint, Vitest, jsdom, React Testing Library, and user-event for development. Use Playwright for a small packaged-extension smoke suite. npm with a committed `package-lock.json` is a practical default because the repository currently has no package manager setup. Keep the existing Node 24 CI baseline unless tool compatibility requires a deliberate change.

**Implementation sequence.** Treat each phase as a reviewable PR; every phase must leave a loadable extension and passing checks.

1. **Establish build and release staging — roughly 1 day.**

   Add package scripts, the lockfile, build orchestration, TypeScript/Vite configuration, and a PR validation workflow. Initially stage the current classic scripts and HTML from an explicit allowlist into `dist/<version>/extension/`, preserving script order. This creates a working build without prematurely changing global dependencies. Update packaging and release tests to consume that directory, put `manifest.json` at the ZIP root, and preserve locale checks, tag/version validation, changelog notes, checksums, and exclusion of local files. Keep `manifest.json` as the authoritative version and check any package version against it. Update installation instructions: source checkouts require a build and load `dist/<version>/extension/`; release ZIPs remain ready to load.

   Gate: the staged legacy extension loads in Chrome and Edge, all baseline tests pass, and an extracted ZIP loads successfully. Keep cleaning confined to the build staging directory so builds do not delete release archives.

2. **Replace global dependencies with modules — roughly 1–2 days.**

   Add explicit exports/imports to dictionary, storage, and localization helpers. Wrap the existing popup startup in an explicit initializer with injectable browser/network dependencies, allowing its current behavioral assertions to survive the module transition. Change popup HTML to one module entry. Convert the background entry to TypeScript and bundle its imports. Activate the separate Vite builds, replacing legacy copies as each entry becomes bundled; prevent obsolete scripts from entering staging.

   Keep temporary JavaScript through `allowJs`; strict checks apply to TypeScript immediately. Port domain VM harnesses to direct module imports as their modules change. Adapt the legacy popup harness to invoke its initializer, retaining its assertions until corresponding React behavior tests pass. Avoid changing lookup algorithms or markup in this phase.

   Gate: popup and worker use explicit module dependencies; there are no unresolved script-order globals. Existing behavior and release checks remain green against the bundled output.

3. **Type shared contracts and dictionary services — roughly 2–3 days.**

   Convert URL validation, saved-word normalization/store, localization helpers, parser, lookup recovery, and fallback adapters to `.ts`. Extract `fetchPage`, English search-form handling, automatic direction detection, and lookup orchestration from the popup into `dictionary/client.ts`. The temporary popup controller calls these services. Keep fetch, parsing, storage, and clocks injectable where tests already need control.

   Validate saved-word messages and responses at runtime; preserve their existing action names and error keys. Keep list reads independent of a live message receiver and mutations in the worker queue. Preserve saved record IDs, timestamps, article distinctions, the 100-word limit, and attribution. Carry the existing browser parser fixtures into an automated DOM-capable suite; lightweight Node stubs alone do not exercise real HTML parsing.

   Gate: migrated modules pass strict type checking and the existing lookup, difficult-word, parsing, fallback, localization, and saved-storage scenarios. Old saved data loads without rewriting it. Request bounds, deadlines, and cache behavior match the baseline.

4. **Introduce the React popup shell — roughly 1 day.**

   Mount React with `createRoot`. Reuse CSS classes, dimensions, colors, icons, and Chrome message catalogs. Implement the header, mode toggle, view navigation, search form, empty/loading/error states, and footer. Initially retain one isolated legacy result container; its controller alone owns that container's children. React must not render or reconcile those children. Replace static `data-i18n` mutation in React-owned elements with typed message calls, and set document title, language, and direction at startup.

   Put storage hydration and pending-request consumption behind one bootstrap operation created before React mounts. Guard against late hydration overwriting typing, navigation, or a newer lookup. Development effect reruns must not consume a pending request twice or duplicate network calls.

   Gate: keyboard submission, focus, direction switching, tab navigation, accessibility labels, and startup behavior work in the built extension. Restoring the last input causes no network request; a fresh context-menu request triggers one lookup flow.

5. **Move lookup rendering and lifecycle to React — roughly 2–3 days.**

   Add lookup state/controller hooks and components for English results, German entries, gender/degree/word-type alternatives, grammatical details, inflection tables, attribution, and pronunciation. Replace the isolated legacy container once these states are covered. Preserve previous results for Back, cached alternative entries, scroll position during meaning updates, source links, table spans, and wrapping.

   Render extracted content as React text nodes and validate URLs separately. Replace HTML-generating helpers with JSX; do not use `dangerouslySetInnerHTML` for dictionary data or HTML-escape text before passing it to React. Preserve progressive Wiktionary updates and MyMemory basic-result distinctions. Abort requests and stop audio/speech when superseded, switching views, changing mode, or unmounting. Keep a sequence check as well as aborts to prevent stale completions updating the UI.

   Gate: React DOM tests reproduce existing cancellation, back-navigation, alternative-cache, fallback, attribution, and hostile-content scenarios. The legacy result renderer and its covered harness cases can now be removed.

6. **Move saved vocabulary to React — roughly 1–2 days.**

   Implement the list, count, save controls, errors, delete, and five-second undo using a typed storage client and hook. Preserve local reads, worker-serialized mutations, duplicate handling, limit behavior, original timestamps on restore, provider attribution, and fresh lookup when a saved word is opened. Test older read responses arriving after mutations, unavailable workers, and concurrent popup windows. Remove the remaining legacy popup controller after its behavior has equivalent coverage.

   Gate: existing saved-word storage fixtures work with the new UI; offline list browsing and multiwindow mutation behavior pass. Saving/deleting causes no dictionary request.

7. **Complete extension verification and cutover — roughly 1–2 days.**

   Remove temporary JavaScript allowances and bridges, obsolete root runtime files, and legacy script copying. Update README, releasing, and localization documentation. CI should run `npm ci`, linting, strict type checks, unit/DOM tests, production builds, packaged-artifact checks, and the extension smoke suite. Keep standalone Node release tests if useful; test language need not mirror application language.

   Add packaged-extension smoke coverage for popup startup, a context-menu request, storage persistence, and worker messaging. Run deterministic network fixtures in automation and a small live-provider check manually. Verify the final artifact in Chrome and Edge, including the fallback popup window. Publish through the existing tag-triggered workflow only when a release is requested.

   Gate: the extracted release ZIP passes the acceptance checks below and contains all referenced chunks, CSS, icons, and locales. No legacy controller or runtime global dependency remains.

The rough total is **10–14 engineering days** for one maintainer familiar with the extension, plus review time. This is an estimate, not a commitment; preserving the custom test harness coverage and validating browser behavior are the largest uncertainties. Re-estimate after phase 2.

**Extension build constraints.** Build the popup as an HTML entry with relative asset paths and locally bundled React. Build the worker separately as a single classic bundle at `background.js`, preserving the current manifest worker format and removing `importScripts` from the bundled entry. Keep the worker's module graph free of React and DOM-dependent parser code. Chrome extension workers [cannot access the DOM](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers); dictionary HTML parsing stays in the popup context.

Run the production builds in a defined order: clean staging once, build popup, build background without clearing popup output, then copy the manifest, catalogs, icons, and documentation through an explicit static-asset list. Inspect the resulting file graph before packaging. For development, run an initial complete build and then watch both entries, with a single owner for static-asset copying; reload the unpacked extension after changes. Do not rely on a localhost development server for extension verification. Vite supports [relative base paths for generated assets](https://vite.dev/guide/build.html#relative-base), and React documents [adding components to an existing project](https://react.dev/learn/add-react-to-an-existing-project).

**Acceptance checks and safeguards.**

- Lookup parity: both directions, automatic hints and ambiguous words, English results/detail/Back, noun genders, adjective degrees, word-type alternatives, bounded form recovery, cached tabs, retry, timeout, and latest-request-wins behavior.
- Startup parity: restore input without fetching; consume only a fresh pending lookup (current lifetime: 60 seconds); ignore expired requests and prevent late storage responses from overriding user actions.
- Fallback parity: show grammar before missing-meaning resolution; retain Wiktionary source/revision/license; distinguish basic MyMemory translations; preserve four-second fallback deadlines, two-request Wiktionary bound, and the existing independent session caches (100 entries, 24-hour success and five-minute empty-result lifetimes).
- Saved-data parity: preserve `lookupWord`, `lookupMode`, and `savedWords` in local storage; `pendingLookup`, `meaningCache`, and `translationCache` in session storage; preserve record fields/IDs and validation. No schema change is needed for this migration.
- UI parity: keyboard access, focus after direction changes, pressed states, live status announcements, language attributes, long table forms, merged cells, two mode themes, scrolling, pronunciation fallback, and five-second undo.
- Request/content parity: retain dictionary URL and redirect checks, provider restrictions, request limits, omitted credentials/referrers, and source attribution; render hostile strings as text. Preserve permissions and Manifest V3's bundled-code policy.
- Artifact parity: extension paths resolve after extraction, the worker starts, no CSP errors appear, the default locale exists, extra locales are included, tags match the manifest version, changelog notes/checksums remain correct, and source/tests/local configuration are excluded from the release ZIP.
- Upgrade/rollback rehearsal: populate storage in the old extension, load the new build in the same installed extension location, verify data and behavior, then restore the previous artifact there. Keep storage shapes stable so rollback preserves vocabulary. If a schema change becomes necessary, handle it as a separate versioned change.

Track popup startup and output size against the phase-1 baseline; investigate material regressions before release. Keep the last known-good artifact available throughout migration. The first implementation step is phase 1: a build-and-package PR that produces the same working extension from `dist/<version>/extension/`.

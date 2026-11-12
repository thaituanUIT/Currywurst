# Developing Currywurst

Currywurst uses strict TypeScript for the dictionary, storage, and browser modules, and React for the popup. Vite builds the popup and background worker separately. All executable code ships inside the extension; dictionary requests and saved vocabulary keep their existing behavior and storage formats.

Use Node.js 24 or newer and npm. Install the locked dependencies and build:

```sh
npm ci
npm run build
```

The output version comes from `manifest.json` (currently `1.7.0`). Load `dist/<version>/extension/` using **Load unpacked** in Chrome or Edge. The repository root is source code and cannot be loaded directly. Release ZIPs already contain the compiled extension and need no Node.js installation.

For an existing installation, preserve its installed folder path when replacing files with a release ZIP or build output. If the installation used the repository root, build from a separate checkout and copy that checkout's `dist/<version>/extension/` contents into the existing installed folder. Develop in the separate checkout so installing a build cannot overwrite its source `popup.html`. Loading a new folder path can create a different extension identity and storage area.

Each version groups its unpacked extension and release files together:

```text
dist/1.7.0/
  extension/
  Currywurst-1.7.0.zip
  Currywurst-1.7.0.zip.sha256
  release-notes.md
```

The ZIP, checksum, and notes are created by packaging. Build and watch mode only clean the current version's `extension/` directory.

Watch mode performs a complete initial build, then watches both entry points and static assets:

```sh
npm run dev
```

Reload the unpacked extension after changes. Watch mode uses development React and inline source maps; packaging requires a fresh production build. Production and watch builds use local bundled assets and the extension's normal Manifest V3 policy. They do not require a localhost server or relaxed CSP.

The main source boundaries are:

| Location | Responsibility |
| --- | --- |
| `src/dictionary/` | Inert HTML parsing, dictionary requests, direction detection, bounded form recovery, and fallback providers |
| `src/shared/` | Entry/storage types, URL validation, localization, saved-record normalization, and validated browser messages |
| `src/background/` | Context-menu lookup handoff and the shared saved-word mutation queue |
| `src/popup/features/lookup/` | Lookup jobs, cancellation, tab caching, entry/results components, and progressive meanings |
| `src/popup/features/saved-words/` | Direct storage reads, typed worker mutations, list UI, and delete/Undo |
| `src/popup/features/pronunciation/` | Recorded audio and browser speech lifecycle |
| `src/popup/App.tsx` | Popup navigation, search form, source/support links, localization, and scrolling |
| `src/popup/bootstrap.ts` | Input restoration and one-use pending lookup consumption |

The popup controllers publish immutable snapshots through React's `useSyncExternalStore`. Their network controllers, timers, audio, and caches stay outside React rendering. Bootstrap is initialized once before mounting, so development StrictMode cannot replay a context-menu lookup. React renders dictionary content as text, with URL checks separate from rendering. HTML escaping is only used inside the inert parser's synthetic documents.

The worker owns all saved-word mutations. Popups read the list directly, so offline reading does not require an available message receiver. Local keys remain `lookupWord`, `lookupMode`, and `savedWords`; session keys remain `pendingLookup`, `meaningCache`, and `translationCache`. The existing IDs, timestamps, article distinctions, attribution, 100-word limit, and cache lifetimes are retained. No storage migration is required.

Run the full local checks:

```sh
npm run check
npx playwright install chromium
npm run test:extension
```

`npm run check` runs strict application type checking, linting, Vitest unit/React tests, the production build, and Node release-packaging tests. `npm run test:extension` packages that build, extracts the ZIP into temporary directories, and loads it in real Chromium. On Linux, `npx playwright install --with-deps chromium` can install missing browser system libraries. Browser tests use controlled dictionary responses; they do not establish live-provider coverage.

The original VM and browser fixture corpus now imports the application modules under `tests/unit/` and renders real React DOM under `tests/popup/`. The compatibility facade in `tests/helpers/popup.tsx` maps historical event assertions to DOM events; it is test-only and is never packaged. Add new UI scenarios with Testing Library and user-event. Browser smoke tests cover storage compatibility, context-menu request handoff, keyboard search, Back, real worker messaging, and concurrent mutations from multiple popup pages. They collect page/CSP errors and exercise extracted artifacts.

Before release, load the build in Chrome and Edge and check a small live dictionary sample, pronunciation, the toolbar popup and fallback popup window, narrow/long tables, and localization. Test updating the existing installed folder and, if necessary, replacing it with the previous release. Keeping storage formats stable permits that rollback.

The build cleans only `dist/<version>/extension/`, preserving release artifacts and other version directories in `dist/`. The popup build manifest identifies generated assets for packaging; stale assets, source files, tests, and local configuration are excluded. See [release instructions](RELEASING.md) for creating the ZIP and checksum. CI runs the same checks for PRs and before tag-triggered publication.

The migration's test results, upgrade/rollback rehearsal, live sample checks, and remaining manual release checks are recorded in [Migration validation](MIGRATION_VALIDATION.md).

# Migration validation

Validated locally on 2026-11-12 with Node.js 24.15.0. This records the TypeScript/React working tree before publication. The pre-migration comparison used source from commit `c01495901d87f90a9aca4f30047aad571349666c`.

| Check | Result |
| --- | --- |
| Clean install from `package-lock.json` | Passed with `npm ci` using the downloaded package cache |
| Strict application type checking and ESLint | Passed |
| Vitest unit, HTML parser, React DOM, and lifecycle tests | 222 tests passed |
| Release-packaging tests | 9 tests passed, including version isolation, stale/generated assets, missing files/locales, version/tag checks, checksums, and rejection of development output |
| Extracted-ZIP browser suite | 4 tests passed in Playwright Chromium |
| Watch builds | Both popup and background builds started successfully; packaging correctly rejected their development output |
| Dependency installation audit | No vulnerabilities reported after updating the transitive minimatch dependency |
| Same-path upgrade and rollback | Passed with isolated persistent browser storage and the original extension code |
| Live German dictionary samples | `Haus` and `klein` returned English meanings and grammar |

The browser suite loads the ZIP, verifies that restoration/offline vocabulary sends no dictionary requests, consumes a pending context-menu lookup once, performs lookup and saving through the worker, opens English results/detail/Back, checks mode reversal/focus, and submits simultaneous saves from two popup pages. The concurrent test retained exactly 100 unique records and rejected the remaining 20 requests; malformed worker messages were rejected. Page and CSP errors were checked.

The upgrade rehearsal kept the installation path and browser profile fixed. It loaded the original JavaScript extension, seeded two saved records including Wiktionary revision/license attribution, replaced the files with the compiled React extension, and confirmed the stored records were unchanged. It then added a third word through the real worker, restored the original extension files, and confirmed all three words remained readable. The extension identity stayed the same, and restoring vocabulary caused zero external requests or page errors.

Five popup opens per stage produced local median times of 28 ms for the original extension, 31 ms after the React upgrade, and 29 ms after rollback. These are an isolated local smoke measurement, not a general performance benchmark. The production popup bundle is approximately 300 kB (92 kB gzip), its CSS 9.6 kB, and the background bundle 6 kB.

Live checks used an isolated profile and the ordinary popup lookup flow. `Haus` returned noun grammar, IPA, and English meanings; `klein` returned adjective grammar, English meanings, and links to its noun use and comparison degrees. This small sample does not establish coverage of every live provider or entry.

Automated browser verification used Playwright's bundled Chromium. Branded Chrome/Edge interactive UI checks, audible pronunciation, and the operating-system popup-window presentation remain manual release checks. Playwright [documents that branded Chrome and Edge removed extension sideload flags](https://playwright.dev/docs/chrome-extensions), so the automated suite uses its supported Chromium channel. The fallback-window invocation and audio cancellation paths are covered by unit tests.

No release was published. `manifest.json` retains the existing version and permissions; migration notes are under **Unreleased** in the changelog. Build and load `dist/<version>/extension/`, or package it using the instructions in [RELEASING.md](RELEASING.md).

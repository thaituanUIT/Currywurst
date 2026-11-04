# Publishing a GitHub release

The [release workflow](../.github/workflows/release.yml) publishes a release when you push a tag such as `v1.2.1`. It runs the automated tests, checks the tag against `manifest.json`, builds a ZIP containing the extension, README, and changelog, and attaches that ZIP and its SHA-256 checksum. Release notes come from the matching version section in `CHANGELOG.md`, followed by installation and update instructions.

## Publish a version

1. Finish and review the changes. Update `manifest.json` and add the matching version section to `CHANGELOG.md`.
2. Run the checks locally:

   ```sh
   node tests/parser-logic.test.cjs
   node tests/lookup-routing.test.cjs
   node tests/lookup.test.cjs
   node tests/saved-words.test.cjs
   node tests/meaning.test.cjs
   node tests/translation.test.cjs
   node tests/release.test.cjs
   ```

3. Open `tests/parser.html` in a browser and test the unpacked extension in Chrome and Edge. The automated tests do not cover the live dictionary or full browser behavior.
4. Optionally preview the package and release notes locally (requires Node.js, `zip`, and `unzip`):

   ```sh
   node scripts/package-release.mjs v1.2.1
   ```

   Inspect `dist/Currywurst-1.2.1.zip` and `dist/release-notes.md`. The ZIP has `manifest.json` at its root. Development files, Git history, and local configuration are excluded.
5. Commit and push the finished changes, including the workflow. Tag that commit and push the tag:

   ```sh
   git tag -a v1.2.1 -m "Currywurst 1.2.1"
   git push origin v1.2.1
   ```

   Replace `1.2.1` in these examples with the version in the manifest. Pushing the tag publishes the release automatically if the checks pass.
6. Check the **Release** run in the repository's **Actions** tab, then check the ZIP and notes on the **Releases** page.

GitHub Actions must be enabled for the repository. The workflow uses GitHub's built-in `GITHUB_TOKEN` with `contents: write` permission; no personal access token or extra secret is required. Organization policies must allow that permission and the pinned official GitHub actions.

## Failed or repeated runs

A mismatched tag or missing changelog section stops packaging. Tests and packaging must pass before publication. If a run fails before a release is created, fix the cause and use a new version/tag for changed source; a transient runner failure can be retried with **Re-run failed jobs**.

The workflow creates releases without editing or overwriting an existing release for the same tag. Inspect **Releases** after a publication failure, since a draft or completed release may already exist. If publication succeeded, rerunning the workflow will fail when it attempts to create the same release again. Use a new version for subsequent changes; do not move a published tag.

Share the [latest release](https://github.com/thaituanUIT/Currywurst/releases/latest) link with users. GitHub release notifications help users find updates; folder installations still require manual updating. This workflow does not publish to Chrome Web Store or Microsoft Edge Add-ons.

# Releasing

A release is published by GitHub Actions when a version tag is pushed: first to
npm, then to the [MCP registry](https://registry.modelcontextprotocol.io). No
login or one-time code is needed on any machine.

## Steps

1. Add a `## x.y.z` entry to `CHANGELOG.md` and commit it with the change.
2. Bump the version:

   ```sh
   npm version patch   # or minor, or major
   ```

   This updates `package.json`, `package-lock.json`, `server.json` and the
   `VERSION` constant in `src/server.ts`, then creates the `Release x.y.z`
   commit and the `vx.y.z` tag. The version number is never typed by hand.

3. Push the commit and the tag:

   ```sh
   git push --follow-tags
   ```

4. Watch the run: `gh run watch` or the repository's **Actions** tab.

`npm version` stops before changing anything if the changelog has no entry for
the new version.

## What the workflow does

`.github/workflows/release.yml`:

1. Checks that the tag, `package.json`, `server.json`, the source constant and
   the changelog agree.
2. Runs `npm publish`, which type-checks, tests and builds first
   (`prepublishOnly`). It signs in through
   [trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm
   token is stored.
3. Waits until npm serves the new version, because the registry reads it from there.
4. Publishes `server.json` to the MCP registry with `mcp-publisher`, signed in
   through GitHub's identity for this repository. The tool is pinned to an exact
   release and checked against its SHA-256.

## If a run fails

Fix the cause and re-run the job from the **Actions** tab. Re-running is safe:
a version that is already on npm is skipped, and the run continues to the
registry step. A version number can't be reused once it is on npm, so a bad
release is fixed by publishing the next patch.

## Places that are not updated by a release

- Glama reads `glama.json` and the README from the repository.
- The listings on mcp.so and in other directories were submitted by hand.

## One-time setup

On npmjs.com, under the package's **Settings**, **Trusted Publisher**: GitHub
Actions, user `nnnoel`, repository `ytranscript-mcp`, workflow `release.yml`,
with `npm publish` allowed. If the workflow file is ever renamed, delete that
entry and add a new one, because entries can't be edited.

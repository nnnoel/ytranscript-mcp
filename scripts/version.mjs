// Keeps the version number in one place (package.json) and stops a release
// whose version, changelog and tag don't agree.
//
//   node scripts/version.mjs changelog     run by `npm version` before it bumps anything
//   node scripts/version.mjs sync          run by `npm version` after the bump: copies the new
//                                          number into server.json and src/server.ts
//   node scripts/version.mjs check <tag>   run by the release workflow
import { readFileSync, writeFileSync } from "node:fs";

const url = (path) => new URL(`../${path}`, import.meta.url);
const read = (path) => readFileSync(url(path), "utf8");
const pkg = JSON.parse(read("package.json"));
const [mode, tag] = process.argv.slice(2);
const SOURCE_VERSION = /export const VERSION = "([^"]*)";/;

// During `npm version`, package.json still holds the old number in the changelog step.
const version = mode === "changelog" ? (process.env.npm_new_version ?? pkg.version) : pkg.version;
const problems = [];

if (mode === "sync") {
  const server = JSON.parse(read("server.json"));
  server.version = version;
  for (const entry of server.packages) entry.version = version;
  writeFileSync(url("server.json"), `${JSON.stringify(server, null, 2)}\n`);

  const source = read("src/server.ts");
  if (!SOURCE_VERSION.test(source)) problems.push("src/server.ts has no `export const VERSION = \"...\";` line to update.");
  else writeFileSync(url("src/server.ts"), source.replace(SOURCE_VERSION, `export const VERSION = "${version}";`));
} else if (mode === "changelog" || mode === "check") {
  if (!read("CHANGELOG.md").split("\n").some((line) => line.trim() === `## ${version}`)) {
    problems.push(`CHANGELOG.md has no "## ${version}" entry. Add one and commit it first.`);
  }
  if (mode === "check") {
    if (!tag) problems.push("Usage: node scripts/version.mjs check <tag>");
    else if (tag !== `v${version}`) problems.push(`Tag ${tag} doesn't match package.json version ${version}.`);

    const server = JSON.parse(read("server.json"));
    const others = {
      "server.json version": server.version,
      ...Object.fromEntries(server.packages.map((entry, i) => [`server.json packages[${i}].version`, entry.version])),
      "src/server.ts VERSION": read("src/server.ts").match(SOURCE_VERSION)?.[1],
    };
    for (const [where, found] of Object.entries(others)) {
      if (found !== version) problems.push(`${where} is ${found}, but package.json is ${version}. Run: node scripts/version.mjs sync`);
    }
  }
} else {
  problems.push("Usage: node scripts/version.mjs changelog | sync | check <tag>");
}

if (problems.length) {
  for (const problem of problems) console.error(`Release check failed: ${problem}`);
  process.exit(1);
}
console.log(mode === "sync" ? `server.json and src/server.ts set to ${version}.` : `Release check passed for ${pkg.name} ${version}.`);

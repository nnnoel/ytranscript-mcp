import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { VERSION } from "../src/server.js";

const json = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));

// `npm version` keeps these in step through scripts/version.mjs. This catches a hand edit.
describe("version", () => {
  const { version } = json("package.json");
  const server = json("server.json");

  it("is the same in package.json, server.json and the source", () => {
    expect(VERSION).toBe(version);
    expect(server.version).toBe(version);
    expect(server.packages.map((entry: { version: string }) => entry.version)).toEqual([version]);
  });

  it("has a changelog entry", () => {
    const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
    expect(changelog.split("\n").map((line) => line.trim())).toContain(`## ${version}`);
  });
});

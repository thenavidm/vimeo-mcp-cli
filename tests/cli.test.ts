/**
 * The CLI, now built by Slipway from the same tools as the MCP server.
 *
 * Parsing, help and output shapes are Slipway's and tested there. These cover
 * what this repo promises: every tool is a command, a task is found by what it
 * does, Vimeo's failures keep the exit codes scripts branch on, and the docs
 * stay in step with the code. Every network call is answered here.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkApp, cli } from "@thenavidm/slipway/testing";
import { app } from "../src/app.js";
import { TOOLS } from "../src/tools/index.js";

const env = { VIMEO_PAT: "test-token", VIMEO_MIN_REQUEST_INTERVAL_MS: "0", VIMEO_MAX_RETRIES: "0" };

/** Vimeo answering every request with `status` and `body`. */
function answering(status: number, body: unknown = { error: "failure", developer_message: "It failed." }) {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

afterEach(() => vi.unstubAllGlobals());

describe("Vimeo CLI on Slipway", () => {
  it("makes all 43 tools commands, the deletes and the comment needing confirmation", async () => {
    const context = JSON.parse((await cli(app, ["agent-context", "--brief"], { env: {} })).stdout);
    const commands = context.commands as Array<{ command: string; requires_confirm?: boolean }>;
    expect(commands.map((c) => c.command)).toEqual(TOOLS.map((tool) => tool.name.replace(/_/g, "-")));
    expect(commands).toHaveLength(43);
    expect(commands.filter((c) => c.requires_confirm).map((c) => c.command).sort()).toEqual(
      ["add-comment", "delete-chapter", "delete-comment", "delete-folder", "delete-showcase", "delete-texttrack", "delete-video", "remove-videos-from-folder"],
    );
  });

  it("finds the command for a task described in words", async () => {
    const first = async (...words: string[]) => (await cli(app, ["which", ...words], { env: {} })).stdout.split("\n")[0];
    expect(await first("file", "videos", "into", "a", "folder")).toContain("add-videos-to-folder");
    expect(await first("transcript", "of", "a", "video")).toContain("get-transcript");
  });

  it("reports a missing argument by its flag", async () => {
    const run = await cli(app, ["get-video", "--agent"], { env });
    expect(run.code).toBe(2);
    expect(JSON.parse(run.stderr).error).toContain("--video-id");
  });

  it("keeps the exit codes scripts branch on", async () => {
    // 1.x gave 5 for 400 and 422; Vimeo's status now says the request was the caller's to fix.
    for (const [status, code] of [[400, 2], [401, 4], [403, 4], [404, 3], [429, 7], [500, 5]] as const) {
      answering(status);
      const run = await cli(app, ["get-video", "--video-id", "123", "--agent"], { env });
      expect(run.code, `HTTP ${status}`).toBe(code);
      expect(JSON.parse(run.stderr).status, `HTTP ${status}`).toBe(status);
    }
  });

  it("exits 10 with no token, saying where to get one", async () => {
    const run = await cli(app, ["get-video", "--video-id", "123", "--agent"], { env: {} });
    expect(run.code).toBe(10);
    expect(JSON.parse(run.stderr).error).toContain("VIMEO_PAT");
  });

  it("exits 5 when Vimeo does not answer in time", async () => {
    vi.stubGlobal("fetch", async () => {
      throw Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    });
    const run = await cli(app, ["get-video", "--video-id", "123", "--agent"], { env });
    expect(run.code).toBe(5);
    expect(JSON.parse(run.stderr)).toMatchObject({ code: "timeout" });
  });

  it("passes slipway check", async () => {
    const report = await checkApp(app, { env: {} });
    expect(report.findings.filter((finding) => finding.level === "error")).toEqual([]);
  });
});

describe("documentation stays in step with the code", () => {
  const read = (p: string): string => readFileSync(new URL(p, import.meta.url), "utf-8");
  // VIMEO_SCOPES is the list of scopes a token can hold, a constant rather than a setting.
  const names = (text: string): Set<string> => new Set((text.match(/VIMEO_[A-Z_]+/g) ?? []).filter((name) => !name.endsWith("_") && name !== "VIMEO_SCOPES"));
  const source = (dir: string): string =>
    readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })
      .map((entry) => (entry.isDirectory() ? source(`${dir}${entry.name}/`) : entry.name.endsWith(".ts") ? read(`${dir}${entry.name}`) : ""))
      .join("\n");

  /** Every variable the server reads: this repo's code, and Slipway's as agent-context lists them. */
  const used = async (): Promise<Set<string>> => {
    const context = JSON.parse((await cli(app, ["agent-context"], { env: {} })).stdout);
    return new Set([...names(source("../src/")), ...context.settings.map((setting: { env: string }) => setting.env)]);
  };

  it("documents every environment variable the code reads", async () => {
    const documented = names(read("../README.md"));
    expect([...(await used())].filter((v) => !documented.has(v))).toEqual([]);
  });

  it("names every environment variable in --help or agent-context", async () => {
    const help = (await cli(app, ["--help"], { env: {} })).stdout;
    const context = JSON.parse((await cli(app, ["agent-context"], { env: {} })).stdout);
    const described = new Set(context.settings.map((setting: { env: string }) => setting.env));
    expect([...(await used())].filter((v) => !help.includes(v) && !described.has(v))).toEqual([]);
  });

  it("says how many tools there are wherever it counts them", () => {
    for (const file of ["../README.md", "../package.json", "../SKILL.md"]) {
      for (const [, n] of read(file).matchAll(/\b(\d+) tools\b(?! remain)/g)) expect(Number(n), file).toBe(TOOLS.length);
    }
  });

  it.each(["../README.md", "../INSTALL.md"])("has no dead in-page anchors in %s", (file) => {
    if (!existsSync(new URL(file, import.meta.url))) return;
    const md = read(file).replace(/```[\s\S]*?```/g, "");
    // GitHub's slug keeps letters, marks, numbers and connector punctuation, so an
    // emoji's variation selector (U+FE0F) stays in the anchor and a link has to carry it.
    const slugs = new Set(
      [...md.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) =>
        (heading as string).trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\s-]/gu, "").replace(/ /g, "-"),
      ),
    );
    const dead = [...md.matchAll(/\[[^\]]+\]\(#([^)]+)\)/g)].map((m) => decodeURIComponent(m[1] as string)).filter((a) => !slugs.has(a));
    expect(dead).toEqual([]);
  });
});

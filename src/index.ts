#!/usr/bin/env node
/**
 * Entry point.
 *
 * `vimeo-mcp`             stdio, which is what MCP clients launch
 * `vimeo-mcp --http`      HTTP, for running it somewhere always on
 * `vimeo-mcp doctor`      check the setup and say what is wrong
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, VERSION } from "./server.js";
import { isCliCommand, runCli, toolNames } from "./cli.js";

/** Invoked as the CLI binary rather than the server one. */
function invokedAsCli(): boolean {
  const name = (process.argv[1] ?? "").split("/").pop() ?? "";
  return name.startsWith("vimeo-cli");
}
import { loadConfig } from "./config.js";
import { httpOptionsFromEnv, startHttpServer } from "./transport/http.js";

const HELP = `vimeo-mcp ${VERSION}

  vimeo-mcp                     Run over stdio. This is what an MCP client launches.
  vimeo-mcp --http [--port=N]   Run over HTTP, for a machine that is always on.
  vimeo-mcp doctor              Check the setup and report what is wrong.
  vimeo-mcp --version           Print the version.

Credentials:
  VIMEO_PAT                 a personal access token from https://developer.vimeo.com/apps
                            VIMEO_ACCESS_TOKEN and VIMEO_TOKEN also work.

  A token's scopes are fixed when it is generated and cannot be changed later.
  Tick "delete" if you want the delete tools, and "video_files" for downloads.

Options:
  VIMEO_READ_ONLY=1               hide every write from the tool list
  VIMEO_ALLOW_DESTRUCTIVE=0       keep writes, block deletes and comments
  VIMEO_AUDIT_LOG=<path>          append-only log of every attempted write
  VIMEO_REQUEST_TIMEOUT_MS        per-request deadline, default 30000
  VIMEO_MIN_REQUEST_INTERVAL_MS   spacing between requests, default 100
  VIMEO_API_VERSION               Vimeo API version, default 3.4
  VIMEO_HTTP_PORT / _HOST / _TOKEN  for --http

https://github.com/thenavidm/vimeo-mcp-cli
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  // The CLI: every tool as a command, from the same server an MCP app talks
  // to. Checked first so `<tool> --help` reaches the tool.
  const cli =
    command !== undefined && !command.startsWith("-") && command !== "doctor" && command !== "help"
      ? invokedAsCli() || isCliCommand(argv, await toolNames())
      : invokedAsCli() && argv.length === 0;
  if (cli) {
    process.exitCode = await runCli(argv.length ? argv : ["tools"]);
    return;
  }

  if (argv.includes("--help") || argv.includes("-h") || command === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (command === "doctor") {
    const { runDoctor } = await import("./doctor.js");
    process.exitCode = await runDoctor();
    return;
  }

  const config = loadConfig();
  const built = buildServer(config);

  // Warn, never block. A network check at startup would delay the handshake,
  // and the failure is more actionable on the tool call that hits it.
  if (!config.token) {
    process.stderr.write(
      "[vimeo-mcp] No VIMEO_PAT set. Every tool will report the missing token. Run `vimeo-mcp doctor` for setup help.\n",
    );
  }

  const shutdown = async (close?: () => Promise<void>): Promise<void> => {
    if (close) await close().catch(() => undefined);
    process.exit(0);
  };

  if (argv.includes("--http")) {
    const { close } = await startHttpServer(built, httpOptionsFromEnv(argv));
    process.on("SIGTERM", () => void shutdown(close));
    process.on("SIGINT", () => void shutdown(close));
    return;
  }

  const transport = new StdioServerTransport();
  await built.server.connect(transport);

  // Handled so `docker stop` and a client shutting down return promptly rather
  // than waiting out a grace period.
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

main().catch((error: unknown) => {
  process.stderr.write(`[vimeo-mcp] ${(error as Error).message}\n`);
  process.exit(1);
});

/**
 * The Vimeo app: everything Slipway needs to ship the MCP server and the CLI.
 *
 * This file only describes. It never starts anything, so `slipway check` and
 * tests can import it; `index.ts` is what runs.
 */

import { createRequire } from "node:module";
import { slipway, type DoctorCheck } from "@thenavidm/slipway";
import { VimeoClient } from "./api/client.js";
import { loadConfig, VIMEO_SCOPES } from "./config.js";
import { INSTRUCTIONS } from "./instructions.js";
import { TOOLS } from "./tools/index.js";
import type { AppContext } from "./tools/kit.js";

const require = createRequire(import.meta.url);
export const VERSION: string = (require("../package.json") as { version: string }).version;

/** Tools that cannot work without a given scope. */
const SCOPE_DEPENDENTS: Record<string, string[]> = {
  delete: ["delete_video", "delete_folder", "delete_showcase", "delete_chapter", "delete_texttrack", "delete_comment"],
  create: ["create_folder", "create_showcase"],
  edit: ["update_video", "update_folder", "update_showcase", "set_video_tags", "add_chapter"],
  upload: ["upload_video", "upload_texttrack", "set_video_thumbnail"],
  interact: ["add_videos_to_folder", "remove_videos_from_folder", "add_comment"],
  video_files: ["get_download_links"],
  stats: ["get_video_analytics"],
  private: ["list_folders", "get_folder"],
};

const message = (error: unknown): string => (error as Error)?.message ?? String(error);

/**
 * The checks 1.x's doctor ran, which always call Vimeo. Two of the ways an
 * integration fails are Vimeo's own and look like anything else from inside a
 * client: a token's scopes are fixed when it is generated, with `delete` off
 * by default, and analytics answers 404 on a free plan rather than naming the
 * plan. So both are named here rather than left to a failing call.
 */
async function doctor({ config, client }: AppContext): Promise<DoctorCheck[]> {
  if (!config.token) return [];
  const checks: DoctorCheck[] = [];
  let scopes: string[];
  let plan: string | undefined;
  try {
    const verified = await client.verify();
    scopes = verified.scopes;
    plan = verified.user?.account;
    checks.push({
      name: "Token",
      ok: true,
      detail: `accepted: account ${verified.user?.name ?? "unknown"}, app ${verified.app?.name ?? "unknown"}, plan ${plan ?? "unknown"}`,
    });
  } catch (error) {
    return [{ name: "Token", ok: false, detail: `rejected: ${message(error)}`, fix: "Generate a token at https://developer.vimeo.com/apps and set VIMEO_PAT." }];
  }

  const missing = Object.entries(SCOPE_DEPENDENTS).filter(([scope]) => !scopes.includes(scope));
  checks.push(
    missing.length === 0
      ? { name: "Scopes", ok: true, detail: VIMEO_SCOPES.filter((scope) => scopes.includes(scope)).join(", ") }
      : {
          name: "Scopes",
          ok: false,
          detail: missing.map(([scope, tools]) => `${scope} is missing, so these fail: ${tools.join(", ")}`).join("; "),
          fix: "Vimeo fixes a token's scopes when it is created, so these cannot be granted now. Generate a new token with the boxes ticked and update VIMEO_PAT.",
        },
  );

  // Analytics depends on the plan rather than the token, and is tested rather
  // than inferred from the plan's name, since Vimeo renames its tiers more often
  // than it changes the API.
  try {
    const videos = await client.list<{ uri?: string }>("/me/videos", { params: { per_page: 1, fields: "uri" } });
    const first = videos.data[0]?.uri;
    if (!first) {
      checks.push({ name: "Analytics", ok: true, warn: true, detail: "the library is empty, so analytics could not be tested" });
    } else {
      try {
        await client.request("GET", `/videos/${first.split("/").pop()}/analytics`, { params: { dimension: "time" } });
        checks.push({ name: "Analytics", ok: true, detail: "available on this account" });
      } catch {
        checks.push({
          name: "Analytics",
          ok: true,
          warn: true,
          detail: `not available: Vimeo's reporting API needs a paid plan and this one is "${plan}". get_video_analytics explains this rather than failing, and get_video_stats still returns lifetime play counts.`,
        });
      }
    }
  } catch (error) {
    checks.push({ name: "Library", ok: true, warn: true, detail: `could not be reached: ${message(error)}` });
  }

  checks.push({
    name: "Limits",
    ok: true,
    detail: `API ${config.apiVersion}, ${config.requestTimeoutMs} ms per request, ${config.minRequestIntervalMs} ms between requests, ${config.maxRetries} retries`,
  });
  return checks;
}

export type AppOptions = {
  /** Replace how handlers get their client, for tests that stub the network. */
  context?: (env: NodeJS.ProcessEnv) => AppContext;
};

export function createApp(options: AppOptions = {}) {
  return slipway<AppContext>({
    name: "vimeo",
    title: "Vimeo",
    version: VERSION,
    package: "@thenavidm/vimeo-mcp-cli",
    description: "Your Vimeo library: videos, folders, showcases, chapters, captions and transcripts, comments, tags, privacy and embed presets.",
    instructions: INSTRUCTIONS,
    context:
      options.context ??
      ((env) => {
        const config = loadConfig(env);
        return { config, client: new VimeoClient(config) };
      }),
    configured: (ctx) => ctx.config.token !== undefined,
    secrets: (ctx) => (ctx.config.token ? [ctx.config.token] : []),
    tools: TOOLS,
    doctor,
    doctorNetwork: true,
    login:
      "Vimeo issues a personal access token, so there is no sign-in to run. Open https://developer.vimeo.com/apps, create or open an app, and generate a token under Authentication. Its scopes are fixed when it is generated and cannot be added later: tick delete if you want the delete tools, and video_files for downloads. Set VIMEO_PAT to the token in your shell or your MCP client's environment, then run vimeo-cli doctor. This command does not open a browser or store anything.",
    settings: [
      { env: "VIMEO_PAT", description: "A personal access token from https://developer.vimeo.com/apps. Its scopes are fixed when it is generated.", secret: true },
      { env: "VIMEO_ACCESS_TOKEN", description: "Another name for VIMEO_PAT.", secret: true, tuning: true },
      { env: "VIMEO_TOKEN", description: "Another name for VIMEO_PAT.", secret: true, tuning: true },
      { env: "VIMEO_REQUEST_TIMEOUT_MS", description: "Each request's deadline; 30000 when unset.", tuning: true },
      { env: "VIMEO_MIN_REQUEST_INTERVAL_MS", description: "Spacing between requests; 100 when unset.", tuning: true },
      { env: "VIMEO_MAX_RETRIES", description: "Retries on 429, server errors and timeouts; 2 when unset.", tuning: true },
      { env: "VIMEO_API_VERSION", description: "The Vimeo API version every request pins; 3.4 when unset.", tuning: true },
      { env: "VIMEO_API_BASE", description: "Vimeo's API root; https://api.vimeo.com when unset.", tuning: true },
    ],
    links: { repository: "https://github.com/thenavidm/vimeo-mcp-cli" },
    // 1.x said this on stderr at startup: a nudge, never a block.
    onServe: (ctx, log) => {
      if (!ctx.config.token) log.warn("No VIMEO_PAT set. Every tool will report the missing token. Run `vimeo-mcp doctor` for setup help.");
    },
  });
}

export const app = createApp();

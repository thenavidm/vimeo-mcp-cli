/**
 * Credentials and runtime settings.
 *
 * Vimeo issues a personal access token from the developer app page, and a token
 * carries a fixed scope set chosen when it was generated. That detail drives
 * most of this file: a token that works perfectly for reading will fail on a
 * delete with a 403 that says nothing useful, and the user has no way to tell
 * the two apart from inside an MCP client.
 *
 * So the scope string is treated as configuration rather than something to
 * discover on failure. `doctor` reads it, and the tools that need a scope the
 * token lacks say which scope is missing rather than surfacing a bare 403.
 */

/** Scopes Vimeo can grant. Order matches the developer app checkbox list. */
export const VIMEO_SCOPES = [
  "public",
  "private",
  "purchased",
  "create",
  "edit",
  "delete",
  "interact",
  "upload",
  "promo_codes",
  "video_files",
  "stats",
] as const;

export type VimeoScope = (typeof VIMEO_SCOPES)[number];

export type Config = {
  /** Personal access token, or an OAuth bearer token. */
  token: string | undefined;
  /** API base. Overridable only so tests can point at a fake. */
  baseUrl: string;
  /**
   * Vimeo pins behavior to an API version in the Accept header rather than the
   * URL. Omitting it silently opts into whatever is newest, which is how a
   * working integration breaks without a deploy.
   */
  apiVersion: string;
  requestTimeoutMs: number;
  minRequestIntervalMs: number;
  maxRetries: number;
};

function envInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // VIMEO_PAT first: it is what Vimeo calls the token on the page where you
  // generate one, so it is the name a user reaches for. The other two are
  // accepted because existing configs on this machine already use them.
  const token =
    env.VIMEO_PAT ??
    env.VIMEO_ACCESS_TOKEN ??
    env.VIMEO_TOKEN ??
    undefined;

  return {
    token: token && token.trim() !== "" ? token.trim() : undefined,
    baseUrl: env.VIMEO_API_BASE ?? "https://api.vimeo.com",
    apiVersion: env.VIMEO_API_VERSION ?? "3.4",
    requestTimeoutMs: envInt(env, "VIMEO_REQUEST_TIMEOUT_MS", 30_000),
    // Vimeo's documented ceiling is generous, but uploads and bulk folder calls
    // arrive in tight loops. A small floor keeps a batch from tripping a 429.
    minRequestIntervalMs: envInt(env, "VIMEO_MIN_REQUEST_INTERVAL_MS", 100),
    maxRetries: envInt(env, "VIMEO_MAX_RETRIES", 2),
  };
}

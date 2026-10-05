/**
 * Error types, and turning a Vimeo failure into something a model can act on.
 *
 * Vimeo returns a JSON body on most failures with `error`, `developer_message`
 * and sometimes `error_code`. The developer message is the useful half and the
 * `error` field is usually a sentence written for an end user, so both go into
 * the message rather than picking one.
 *
 * The case worth special handling is 403 on a scope the token does not hold.
 * Vimeo answers that with a generic "You do not have permission", which sends
 * everyone hunting through their account settings when the actual fix is to
 * regenerate the token with one more checkbox ticked.
 */

import type { VimeoScope } from "../config.js";

export class VimeoError extends Error {
  readonly status: number;
  readonly code: number | undefined;

  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = "VimeoError";
    this.status = status;
    this.code = code;
  }
}

/** A write blocked locally, before it ever left the machine. */
export class WriteBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteBlockedError";
  }
}

/**
 * Vimeo could not be reached, or did not answer in time. Its own class, so an
 * outage is never mistaken for a mistake in the arguments.
 */
export class VimeoUnreachableError extends Error {
  readonly timedOut: boolean;

  constructor(message: string, timedOut: boolean) {
    super(message);
    this.name = "VimeoUnreachableError";
    this.timedOut = timedOut;
  }
}

/** No token configured at all. */
export class MissingTokenError extends Error {
  constructor() {
    super(
      "No Vimeo token configured. Set VIMEO_PAT to a personal access token from https://developer.vimeo.com/apps, then run `vimeo-mcp doctor` to check it.",
    );
    this.name = "MissingTokenError";
  }
}

/**
 * Raised when a tool needs a scope the token was not granted.
 *
 * Thrown before the request goes out, because a 403 from Vimeo does not name
 * the missing scope and the user cannot add one to an existing token: it has to
 * be regenerated, which is worth saying explicitly.
 */
export class MissingScopeError extends Error {
  readonly scope: VimeoScope;

  constructor(tool: string, scope: VimeoScope) {
    super(
      `${tool} needs the "${scope}" scope and this token does not have it. Vimeo fixes a token's scopes when it is created, so this cannot be granted after the fact: generate a new token at https://developer.vimeo.com/apps with "${scope}" ticked, then update VIMEO_PAT. Run \`vimeo-mcp doctor\` to see the scopes the current token does have.`,
    );
    this.name = "MissingScopeError";
    this.scope = scope;
  }
}

type VimeoErrorBody = {
  error?: string;
  developer_message?: string;
  error_code?: number;
  invalid_parameters?: Array<{ field?: string; developer_message?: string }>;
};

/** Build the clearest message available from a Vimeo error response. */
export function describeFailure(status: number, body: unknown, url: string): VimeoError {
  const b = (body ?? {}) as VimeoErrorBody;
  const parts: string[] = [];

  if (b.developer_message) parts.push(b.developer_message);
  else if (b.error) parts.push(b.error);

  if (b.invalid_parameters?.length) {
    const detail = b.invalid_parameters
      .map((p) => [p.field, p.developer_message].filter(Boolean).join(": "))
      .filter(Boolean)
      .join("; ");
    if (detail) parts.push(detail);
  }

  if (parts.length === 0) parts.push(`Vimeo returned ${status} for ${url}.`);

  // The hints below are the failures that actually happen, and each one is
  // indistinguishable from the others in Vimeo's own wording.
  if (status === 401) {
    parts.push(
      "The token was rejected. It may be revoked or mistyped. Run `vimeo-mcp doctor`.",
    );
  } else if (status === 403) {
    parts.push(
      "A 403 here is usually a missing scope on the token rather than a problem with the video. Run `vimeo-mcp doctor` to see which scopes the token holds.",
    );
  } else if (status === 404) {
    parts.push(
      "A 404 can also mean the feature needs a paid Vimeo plan. Analytics and teams both answer 404 on a free account rather than saying so.",
    );
  } else if (status === 429) {
    parts.push("Rate limited. Wait and retry, or raise VIMEO_MIN_REQUEST_INTERVAL_MS.");
  }

  return new VimeoError(parts.join(" "), status, b.error_code);
}

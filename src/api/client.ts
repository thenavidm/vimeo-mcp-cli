/**
 * The Vimeo HTTP client.
 *
 * Three things here are not obvious and each one has bitten this integration:
 *
 * 1. The API version goes in the Accept header, not the URL. Without it Vimeo
 *    serves whatever is current, so an integration can change behavior with no
 *    deploy on our side.
 *
 * 2. Vimeo is inconsistent about where a payload goes, so this client decides
 *    on whether a body was passed rather than on the verb. The bulk folder
 *    calls take their video list as a `uris` *query* parameter on both PUT and
 *    DELETE, while the bulk showcase call takes a `videos` *body* field on PUT.
 *    Code that assumes "GET has no body, everything else does" sends the wrong
 *    shape to one of them, and Vimeo answers 204 regardless, so the tool
 *    reports success having changed nothing.
 *
 * 3. Paging is by `paging.next`, which is a path rather than a full URL, and
 *    the last page still carries a `paging` object with a null `next`. Trusting
 *    `total` or `page` instead loops forever on a collection that changes while
 *    it is being read.
 */

import type { Config, VimeoScope } from "../config.js";
import { describeFailure, MissingScopeError, MissingTokenError, VimeoError, VimeoUnreachableError } from "./errors.js";

export type RequestOptions = {
  params?: Record<string, unknown>;
  body?: unknown;
  /** Scope this call needs, checked locally before the request goes out. */
  scope?: VimeoScope;
  /** Name of the calling tool, so a scope error can say which tool failed. */
  tool?: string;
  /** Some Vimeo write endpoints want form encoding rather than JSON. */
  form?: boolean;
};

export type Paged<T> = {
  data: T[];
  total?: number;
  page?: number;
  perPage?: number;
  /** Present when more pages exist. */
  nextPath?: string;
};

export class VimeoClient {
  private readonly config: Config;
  /** Scopes the token actually holds, once verified. Undefined until checked. */
  private scopes: Set<string> | undefined;
  private lastRequestAt = 0;

  constructor(config: Config) {
    this.config = config;
  }

  get hasToken(): boolean {
    return this.config.token !== undefined;
  }

  /** Scopes seen so far, for `doctor` and for local scope checks. */
  get knownScopes(): Set<string> | undefined {
    return this.scopes;
  }

  /**
   * Ask Vimeo what this token can do.
   *
   * Cached for the process lifetime: a token's scopes are fixed when it is
   * created, so re-checking would spend a request on an answer that cannot
   * change.
   */
  async verify(): Promise<{
    scopes: string[];
    user?: { name?: string; uri?: string; account?: string };
    app?: { name?: string };
  }> {
    const raw = (await this.request("GET", "/oauth/verify")) as {
      scope?: string;
      user?: { name?: string; uri?: string; account?: string };
      app?: { name?: string };
    };
    const scopes = (raw.scope ?? "").split(/\s+/).filter(Boolean);
    this.scopes = new Set(scopes);
    return { scopes, user: raw.user, app: raw.app };
  }

  /**
   * Fail before the request when the token provably lacks the scope.
   *
   * Only enforced once the scope set is known. Guessing before `verify` has run
   * would block calls that would have worked.
   */
  private assertScope(scope: VimeoScope | undefined, tool: string | undefined): void {
    if (!scope || !this.scopes) return;
    if (!this.scopes.has(scope)) throw new MissingScopeError(tool ?? "This tool", scope);
  }

  async request(method: string, path: string, options: RequestOptions = {}): Promise<unknown> {
    if (!this.config.token) throw new MissingTokenError();
    this.assertScope(options.scope, options.tool);
    await this.pace();

    const url = new URL(path.startsWith("http") ? path : `${this.config.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.params ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.token}`,
      Accept: `application/vnd.vimeo.*+json;version=${this.config.apiVersion}`,
    };

    const init: RequestInit = { method, headers };

    // Deliberately keyed on whether a body was passed, never on the verb. See
    // the note at the top: DELETE with a body is a real Vimeo pattern.
    if (options.body !== undefined) {
      if (options.form) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        const form = new URLSearchParams();
        for (const [k, v] of Object.entries(options.body as Record<string, unknown>)) {
          if (v !== undefined && v !== null) form.set(k, String(v));
        }
        init.body = form.toString();
      } else {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(options.body);
      }
    }

    return this.send(url.toString(), init, method);
  }

  private async send(url: string, init: RequestInit, method: string): Promise<unknown> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(timer);

        if (response.status === 204) return { success: true };

        const text = await response.text();
        let parsed: unknown = undefined;
        if (text) {
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = { raw: text };
          }
        }

        if (response.ok) return parsed ?? { success: true };

        // 429 and 5xx are worth another go. Everything else is a real answer
        // and retrying it just spends the rate limit.
        if ((response.status === 429 || response.status >= 500) && attempt < this.config.maxRetries) {
          const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
          const waitMs = Number.isFinite(retryAfter)
            ? retryAfter * 1000
            : Math.min(2000 * 2 ** attempt, 8000);
          await sleep(waitMs);
          continue;
        }

        throw describeFailure(response.status, parsed, `${method} ${url}`);
      } catch (error) {
        clearTimeout(timer);
        if (error instanceof VimeoError) throw error;

        lastError =
          (error as Error).name === "AbortError"
            ? new VimeoUnreachableError(
                `Vimeo did not respond within ${this.config.requestTimeoutMs}ms. Raise VIMEO_REQUEST_TIMEOUT_MS if this is a large upload.`,
                true,
              )
            : new VimeoUnreachableError((error as Error).message, false);
        if (attempt >= this.config.maxRetries) break;
        await sleep(Math.min(1000 * 2 ** attempt, 4000));
      }
    }

    throw lastError ?? new VimeoUnreachableError("The request to Vimeo failed for an unknown reason.", false);
  }

  /** Space requests out so a bulk loop does not trip the rate limit. */
  private async pace(): Promise<void> {
    const gap = this.config.minRequestIntervalMs;
    if (gap <= 0) return;
    const since = Date.now() - this.lastRequestAt;
    if (since < gap) await sleep(gap - since);
    this.lastRequestAt = Date.now();
  }

  /** One page of a collection, normalized. */
  async list<T = unknown>(
    path: string,
    options: RequestOptions = {},
  ): Promise<Paged<T>> {
    const raw = (await this.request("GET", path, options)) as {
      data?: T[];
      total?: number;
      page?: number;
      per_page?: number;
      paging?: { next?: string | null };
    };
    return {
      data: raw.data ?? [],
      total: raw.total,
      page: raw.page,
      perPage: raw.per_page,
      nextPath: raw.paging?.next ?? undefined,
    };
  }

  /**
   * Follow `paging.next` until it runs out.
   *
   * Terminates on a missing next, on a repeated next, and on a hard page cap.
   * The repeat check matters because a collection being written to while it is
   * read can hand back the same cursor twice, which is an infinite loop that
   * only shows up on a big library.
   */
  async listAll<T = unknown>(
    path: string,
    options: RequestOptions = {},
    limits: { maxPages?: number; maxItems?: number } = {},
  ): Promise<{ items: T[]; pages: number; truncated: boolean }> {
    const maxPages = limits.maxPages ?? 25;
    const maxItems = limits.maxItems ?? 2000;

    const items: T[] = [];
    const seen = new Set<string>();
    let next: string | undefined = path;
    let params = options.params;
    let pages = 0;
    let truncated = false;

    while (next && pages < maxPages) {
      const page: Paged<T> = await this.list<T>(next, { ...options, params });
      items.push(...page.data);
      pages += 1;

      if (items.length >= maxItems) {
        truncated = Boolean(page.nextPath);
        break;
      }

      const candidate = page.nextPath;
      if (!candidate || seen.has(candidate)) {
        truncated = Boolean(candidate);
        break;
      }
      seen.add(candidate);
      next = candidate;
      // paging.next already carries the query string, so re-sending params
      // would duplicate them.
      params = undefined;

      if (pages >= maxPages) truncated = true;
    }

    return { items, pages, truncated };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

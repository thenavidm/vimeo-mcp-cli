/**
 * Client tests against a faked fetch. Never the network, never a real token.
 *
 * The verb assertions look pedantic and are not. Code that decides whether to
 * attach a body by branching on "is it a GET" sends a POST-shaped request where
 * it meant a DELETE, Vimeo answers 204, and the tool reports success having
 * changed nothing. That failure is invisible without a test that reads the verb
 * off the wire.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { VimeoClient } from "../src/api/client.js";
import { MissingScopeError, MissingTokenError, VimeoError } from "../src/api/errors.js";
import type { Config } from "../src/config.js";

function config(overrides: Partial<Config> = {}): Config {
  return {
    token: "test-token",
    baseUrl: "https://api.example.test",
    apiVersion: "3.4",
    requestTimeoutMs: 5000,
    minRequestIntervalMs: 0,
    maxRetries: 0,
    ...overrides,
  };
}

type Call = { url: string; init: RequestInit };

function fakeFetch(responder: (call: Call) => Response): { calls: Call[] } {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    return Promise.resolve(responder(call));
  });
  return { calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request", () => {
  it("sends the verb it was given, not one inferred from the body", async () => {
    const { calls } = fakeFetch(() => new Response(null, { status: 204 }));
    const client = new VimeoClient(config());

    await client.request("DELETE", "/videos/1");
    await client.request("PUT", "/me/projects/9/videos", { params: { uris: "/videos/1" } });
    await client.request("PATCH", "/videos/1", { body: { name: "x" } });

    expect(calls.map((c) => c.init.method)).toEqual(["DELETE", "PUT", "PATCH"]);
  });

  it("attaches a body on a DELETE when one is passed", async () => {
    const { calls } = fakeFetch(() => new Response(null, { status: 204 }));
    const client = new VimeoClient(config());

    await client.request("DELETE", "/thing", { body: { uris: ["/videos/1"] } });

    expect(calls[0]?.init.method).toBe("DELETE");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ uris: ["/videos/1"] }));
  });

  it("sends no body when none was passed, whatever the verb", async () => {
    const { calls } = fakeFetch(() => new Response(null, { status: 204 }));
    const client = new VimeoClient(config());

    await client.request("PUT", "/me/albums/1/videos/2");

    expect(calls[0]?.init.body).toBeUndefined();
  });

  it("pins the API version in the Accept header", async () => {
    const { calls } = fakeFetch(() => jsonResponse({}));
    const client = new VimeoClient(config({ apiVersion: "3.4" }));

    await client.request("GET", "/me");

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/vnd.vimeo.*+json;version=3.4");
  });

  it("refuses without a token", async () => {
    const client = new VimeoClient(config({ token: undefined }));
    await expect(client.request("GET", "/me")).rejects.toBeInstanceOf(MissingTokenError);
  });

  it("skips empty query params rather than sending them blank", async () => {
    const { calls } = fakeFetch(() => jsonResponse({}));
    const client = new VimeoClient(config());

    await client.request("GET", "/me/videos", {
      params: { page: 1, query: "", folder: undefined },
    });

    expect(calls[0]?.url).toContain("page=1");
    expect(calls[0]?.url).not.toContain("query=");
    expect(calls[0]?.url).not.toContain("folder=");
  });
});

describe("errors", () => {
  it("surfaces Vimeo's developer_message", async () => {
    fakeFetch(() =>
      jsonResponse({ error: "Nope.", developer_message: "The video was not found." }, 404),
    );
    const client = new VimeoClient(config());

    await expect(client.request("GET", "/videos/1")).rejects.toThrow(/The video was not found/);
  });

  it("explains that a 404 can be a plan limit", async () => {
    fakeFetch(() => jsonResponse({ error: "Not found" }, 404));
    const client = new VimeoClient(config());

    await expect(client.request("GET", "/videos/1/analytics")).rejects.toThrow(/paid Vimeo plan/);
  });

  it("keeps the status on the error so callers can branch on it", async () => {
    fakeFetch(() => jsonResponse({ error: "Not found" }, 404));
    const client = new VimeoClient(config());

    await client.request("GET", "/x").catch((error: unknown) => {
      expect(error).toBeInstanceOf(VimeoError);
      expect((error as VimeoError).status).toBe(404);
    });
    expect.assertions(2);
  });
});

describe("scope checking", () => {
  it("fails before the request when the token lacks the scope", async () => {
    const { calls } = fakeFetch(() => jsonResponse({ scope: "public private" }));
    const client = new VimeoClient(config());

    await client.verify();
    const before = calls.length;

    await expect(
      client.request("DELETE", "/videos/1", { scope: "delete", tool: "delete_video" }),
    ).rejects.toBeInstanceOf(MissingScopeError);

    // The point of checking locally is that nothing goes out.
    expect(calls.length).toBe(before);
  });

  it("says the scope cannot be added to an existing token", async () => {
    fakeFetch(() => jsonResponse({ scope: "public" }));
    const client = new VimeoClient(config());
    await client.verify();

    await expect(
      client.request("DELETE", "/videos/1", { scope: "delete", tool: "delete_video" }),
    ).rejects.toThrow(/cannot be granted after the fact/);
  });

  it("allows the call when the scope is held", async () => {
    fakeFetch((call) =>
      call.url.includes("/oauth/verify")
        ? jsonResponse({ scope: "public delete" })
        : new Response(null, { status: 204 }),
    );
    const client = new VimeoClient(config());
    await client.verify();

    await expect(
      client.request("DELETE", "/videos/1", { scope: "delete", tool: "delete_video" }),
    ).resolves.toEqual({ success: true });
  });

  it("does not block before scopes are known", async () => {
    fakeFetch(() => new Response(null, { status: 204 }));
    const client = new VimeoClient(config());

    // verify() has not run, so guessing would block a call that would work.
    await expect(
      client.request("DELETE", "/videos/1", { scope: "delete" }),
    ).resolves.toEqual({ success: true });
  });
});

describe("pagination", () => {
  it("follows paging.next to the end", async () => {
    let page = 0;
    fakeFetch(() => {
      page += 1;
      return jsonResponse({
        data: [{ id: page }],
        paging: { next: page < 3 ? `/me/videos?page=${page + 1}` : null },
      });
    });
    const client = new VimeoClient(config());

    const result = await client.listAll("/me/videos");

    expect(result.pages).toBe(3);
    expect(result.items).toHaveLength(3);
    expect(result.truncated).toBe(false);
  });

  it("terminates when the cursor repeats instead of looping forever", async () => {
    // A collection written to while it is read can hand back the same cursor.
    fakeFetch(() =>
      jsonResponse({ data: [{ id: 1 }], paging: { next: "/me/videos?page=2" } }),
    );
    const client = new VimeoClient(config());

    const result = await client.listAll("/me/videos", {}, { maxPages: 50 });

    expect(result.pages).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it("stops at the page cap and says it truncated", async () => {
    let page = 0;
    fakeFetch(() => {
      page += 1;
      return jsonResponse({
        data: [{ id: page }],
        paging: { next: `/me/videos?page=${page + 1}` },
      });
    });
    const client = new VimeoClient(config());

    const result = await client.listAll("/me/videos", {}, { maxPages: 3 });

    expect(result.pages).toBe(3);
    expect(result.truncated).toBe(true);
  });

  it("stops on a missing paging object", async () => {
    fakeFetch(() => jsonResponse({ data: [{ id: 1 }] }));
    const client = new VimeoClient(config());

    const result = await client.listAll("/me/videos");

    expect(result.pages).toBe(1);
    expect(result.truncated).toBe(false);
  });
});

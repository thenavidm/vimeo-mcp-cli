# Working on this repo

For someone editing the server. Installation is in the README.

## Run it

```bash
npm install
npm run build
npm test
npm run typecheck
```

A green test run is not the check that counts. Before claiming anything works,
do a real handshake against the built entry point:

```bash
printf '%s\n%s\n%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"p","version":"1.0.0"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
 | VIMEO_PAT=... node dist/index.js
```

## Decisions already made

**Tools are grouped by what they reach**, not by API endpoint. A reader asks
"what can this see", never "which URL does this call".

**Built on Slipway.** `src/app.ts` describes the server; Slipway builds the MCP
server, the CLI, `doctor`, the write guard and the exit codes from it. Each tool
module registers its tools with `server.tool(...)` as it did on the MCP SDK, and
`src/tools/kit.ts` records those calls and turns them into Slipway tools, with
each write's risk from its annotations and its audit summary in 1.x's words.

**Writes are on.** Only the six deletes, `add_comment`, and
`remove_videos_from_folder` with `delete_videos_too` need confirming. Do not
add a confirm to a reversible write: it teaches a model to pass confirm without
reading, which defeats the ones that matter.

**Read-only and the guard are Slipway's.** A tool declares its risk through the
`annotationsFor` it already passes, and Slipway hides the writes under
`VIMEO_READ_ONLY`, refuses an unconfirmed delete and writes the audit log. Do
not check any of that inside a handler.

**Always request specific leaf fields.** Vimeo expands nested objects in full,
so `fields=parent_folder` returns about two kilobytes to learn a folder name.
The field lists live in `src/tools/types.ts`.

**The client decides on a body, never on the verb.** Vimeo's bulk folder calls
put their payload in the query string on both PUT and DELETE. Code that assumes
"GET has no body, everything else does" sends the wrong shape, and Vimeo answers
204 either way, so it looks like it worked. There is a test for this.

**Do not expose `PUT /me/albums/{id}/videos`.** It replaces a showcase's entire
contents rather than appending. A tool named "add videos" on top of a replace
call is how a curated showcase gets wiped.

## Verifying against Vimeo

The published 3.4 OpenAPI spec is a community mirror and it lags: it has no
chapter paths while the live API serves them. When the two disagree, trust a
live probe.

`OPTIONS` is useless for discovering methods here. Vimeo answers 204 with a
blanket `GET,POST,PUT,DELETE,PATCH,OPTIONS` on every path, including ones that
do not exist. It is CORS boilerplate.

## Tests

vitest against a faked `fetch`. Never the network, never a real token. Cover the
verb actually sent, write gating, pagination termination, and the injection
framing.

# Versions

| Component | Version | Checked |
|---|---|---|
| `@modelcontextprotocol/sdk` | ^1.30.0 | 2026-09-01 |
| `zod` | ^3.23.8 | 2026-09-01 |
| Node | >= 20 | 2026-09-01 |
| Vimeo API | 3.4 | 2026-09-01 |

## 1.1.0

**A CLI.** `vimeo-cli` runs every tool as a shell command. It builds the same server the MCP binary runs and calls it through the SDK's in-memory transport, so the two surfaces cannot drift. Exit codes follow the house contract: 2 usage or a refused write, 3 not found, 4 a rejected token or a missing scope, 5 API, 7 rate limited, 10 no token.

**Renamed to vimeo-mcp-cli**, the name every server with a CLI carries. The old package is deprecated with a pointer here, and GitHub redirects the old repo address.

**A Claude Desktop extension**, attached to each release, asking for the token.

## 1.0.3

Finishes the American English pass. The previous commit changed five words and
left eighteen, so the repo was inconsistent with itself: "License" in one table
and "Licence" in another, "summarize" in one comment and "summarise" in the
next. All 22 are converted now, across the docs and the source comments.

## 1.0.2

`--version` and the MCP handshake reported 1.0.0 on a 1.0.1 install, because
the version was hardcoded in `src/server.ts` as well as `package.json` and only
one of them was bumped. It reads from `package.json` now, so the two cannot
drift again. The symptom looked like npx serving a stale build, which sent the
investigation to the wrong place entirely.

## 1.0.1

`SKILL.md` rewritten for its actual reader. It ships inside the package to tell a
model how to drive the tools, and the first version explained the platform to a
human instead: documentation with frontmatter on top. It now routes a question
to a tool, names the argument shapes that get passed wrong, and says what each
failure actually means so a model stops retrying a call that cannot succeed.

Its YAML also broke every renderer, because an unquoted `description` containing
`library: listing` reads as a nested mapping. It is a block scalar now, matching
the other servers.

README first screenful: the badge row was carrying a stars badge reading 0 and a
downloads badge rendering red, since a package published minutes earlier has no
download history. Both are gone. The `Built by` line moved above the transcript.

## 1.0.0

First release. 43 tools across videos, folders, showcases, chapters, captions
and transcripts, comments, tags, privacy and embed presets.

Notes from the build, verified against the live API on 2026-09-01:

- Vimeo fixes a token's scopes at creation. `delete` and `video_files` are off
  by default and cannot be added afterwards, so `doctor` names every tool that
  a missing scope disables rather than leaving it to a 403.
- Analytics and teams answer 404 on a free plan rather than 402.
  `get_video_analytics` translates that into a plain explanation.
- The bulk folder endpoints take their video list as a `uris` query parameter.
  The bulk showcase endpoint takes a `videos` body field and replaces the
  showcase contents, so it is deliberately not exposed.
- The published 3.4 OpenAPI mirror has no chapter paths, while the live API
  serves them. Chapter support was verified against the live API.

# Versions

| Component | Version | Checked |
|---|---|---|
| `@thenavidm/slipway` | 0.1.20 | 2026-10-05 |
| MCP TypeScript SDK, through Slipway | 2.3.0 | 2026-10-05 |
| `zod` | 4.6.5 | 2026-10-05 |
| Node | >= 22 | 2026-10-05 |
| Vimeo API | 3.4 | 2026-09-01 |

## 2.0.0, 2026-10-05

Built on [Slipway](https://github.com/thenavidm/slipway) 0.1.20. The 43 tools keep their names and arguments, and every difference below was measured against 1.1.1, the last version on npm, before release.

- **`which <words>` finds a command**, and `agent-context` describes every command, flag and setting as JSON. In Codex 0.159.3, finding the command that moves several videos into a folder and its flags took a median of 82,465 input tokens over the CLI instead of 127,534 (five runs each). Every 1.1.1 run took five commands, reading the general help twice and then the command list before the command's help; every 2.0.0 run asked `which` and read the command's help, three commands.
- **A person approves each confirmed call over MCP.** The six deletes and `add_comment` still need confirmation, and `remove_videos_from_folder` when `delete_videos_too` is set. Claude Code (2.1.246 and later) shows its own prompt, and a client that can show forms asks with an approval form whose one box starts unticked. Approvals are signed, bound to the exact call and work once. Where a client can do neither, the model's `confirm: true` still counts, and `VIMEO_CONFIRM=model` makes it enough everywhere. A refusal reads as 1.1.1's did, word for word: "delete_video cannot be undone, so it will not run without confirm: true. About to: permanently delete video …". `add_comment`'s now says it posts publicly under your account, since a comment can be deleted afterwards. The audit log records who approved each call.
- **`remove_videos_from_folder` tells clients it can destroy videos.** Its annotations said it was a reversible write, which is true until `delete_videos_too` is set; clients now see `destructiveHint`, and it still asks for confirmation only when the flag is set.
- **Vimeo's status picks the exit code.** A request Vimeo rejects (400 or 422) exits 2 instead of 5, and a removed resource (410) 3 instead of 5. 401 and 403 still exit 4, 404 3, 429 7, a server error 5, a scope the token lacks 4, and no token 10. A timeout exits 5, and 1 now means an unexpected error.
- **Smaller answers over MCP.** A result is compact JSON, where 1.1.1 indented it, so the same answer costs fewer tokens. A failure is JSON too, with Slipway's `code`, Vimeo's `status` and its `error_code`, where 1.1.1 sent the message alone.
- **A smaller tool list.** Each tool no longer repeats `$schema`, `additionalProperties` and an `execution` block saying it runs no background tasks, so the list is 8,210 o200k tokens instead of 8,577, and Claude Code 2.1.286 spends 9,156 tokens a message on it with every tool loaded instead of 10,668. Each tool has a title, the first clause of its description, where 1.1.1 gave clients the name.
- **Less to install and start.** npx installs 4 packages instead of 94: Slipway brings the MCP SDK's 2.x server package, which carries no web framework. The entry turns on Node's compile cache, and the server spends 160 ms of CPU before its first answer where 1.1.1 spent 193, and answers in 115 ms of wall time instead of 125 (median of 21 runs, taking turns on one Mac).
- **`install <client>`** adds the server to Claude Code, Codex, Claude Desktop, Cursor, VS Code or Gemini CLI in each one's own format.
- **`doctor` checks what it checked**: the token, its scopes and the tools a missing one disables, and whether the plan has analytics. It exits 1 on a missing scope as before, and 10 with no token where it exited 1.
- **Docs.** README section 6 has the costs measured against 1.1.1, where it had 2026-09-27's; a settings table lists every variable; the contents links to sections 7, 8 and 10 work on GitHub, which keeps an emoji's variation selector in the anchor; and `SKILL.md` lists `which` and exit code 1.

### Upgrading

Node 22 or later is required; 1.1.1 ran on 20. Over MCP, expect an approval prompt or form before a delete or a comment; a headless agent that should run them with `confirm: true` alone needs `VIMEO_CONFIRM=model`. A script that read exit 5 as a rejected request should read 2, and as a removed resource 3. An error in the terminal is one JSON object with `error`, Slipway's `code` (`usage`, `refused`, `auth`, `not_found`, `rate_limited`, `timeout`, `api`, `not_configured`) and often a `hint`, plus Vimeo's `status` when it answered; 1.1.1 printed `error` alone. Over MCP, an error is that JSON, where 1.1.1 sent its message as plain text, and a result is compact JSON rather than indented. With `VIMEO_READ_ONLY=1`, a client that calls a hidden tool gets "tool not found", and that call is not in the audit log; the CLI still names the setting. The audit log's lines gain `surface`, `risk` and `confirmed_by`, and each allowed call is followed by a `done` or `failed` line. `--http` now refuses to listen beyond this machine without `VIMEO_HTTP_TOKEN`, and refuses a page from another site unless `VIMEO_HTTP_ALLOWED_ORIGINS` lists it. Each confirmed tool's `confirm` argument now reads "Set true only when the user asked for exactly this action." A missing argument's error is 14 tokens longer, for its code and a hint, and `SKILL.md` 121 tokens longer in Claude Code, because it lists `which` and exit code 1, says how approval works over MCP and names the flag that makes `remove_videos_from_folder` need confirming.

## 1.1.1, 2026-10-04

- **`npx -y @thenavidm/vimeo-mcp-cli` starts the MCP server whatever order npm keeps.** npx starts whichever binary the npm registry lists first when they share one file, and the registry does not keep the published order. For this package that happened to be the server; for 23 others it was the CLI. A third binary named after the package, on its own file, now always starts the server, and npx picks it by name.

## 1.1.0

**A CLI.** `vimeo-cli` runs every tool as a shell command. It builds the same server the MCP binary runs and calls it through the SDK's in-memory transport, so the two surfaces cannot drift. Exit codes follow the house contract: 2 usage or a refused write, 3 not found, 4 a rejected token or a missing scope, 5 API, 7 rate limited, 10 no token.

**Renamed to vimeo-mcp-cli**, the name every server with a CLI carries. The old package is deprecated with a pointer here, and GitHub redirects the old repo address.

**A Claude Desktop extension**, attached to each release, asking for the token.

**The context cost is measured in Claude Code**: every tool loaded, Claude Code's default tool search, and the CLI's `SKILL.md`, each from 2 real runs. The old figure counted the tool list at 4 characters a token.

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

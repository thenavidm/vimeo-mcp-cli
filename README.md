<img src="https://cdn.navid.media/connectors/vimeo-icon.png" alt="Vimeo" width="88">

# Vimeo MCP Server & CLI

[![License](https://img.shields.io/badge/License-MIT-blue)](./LICENSE)
[![npm](https://img.shields.io/npm/v/@thenavidm/vimeo-mcp-cli?color=orange&label=npm)](https://www.npmjs.com/package/@thenavidm/vimeo-mcp-cli)
[![CI](https://img.shields.io/github/actions/workflow/status/thenavidm/vimeo-mcp-cli/ci.yml?branch=main&label=CI)](https://github.com/thenavidm/vimeo-mcp-cli/actions)
[![YouTube](https://img.shields.io/badge/YouTube-@thenavidm-red?logo=youtube&logoColor=white)](https://youtube.com/@thenavidm?sub_confirmation=1)
[![X](https://img.shields.io/badge/X-@thenavidm-black?logo=x)](https://x.com/thenavidm)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-thenavidm-0A66C2?logo=linkedin&logoColor=white)](https://linkedin.com/in/thenavidm)

Vimeo MCP server and CLI for Claude Code, Codex and AI agents. 43 tools for transcripts, bulk folder filing, showcases, chapters, captions, tags, privacy and embed presets.

One install gives you both surfaces, the same 43 tools under the same names, from the same server, so they cannot drift apart.

Vimeo MCP connects your video library to Claude, Cursor, and any other AI agent.
It reads transcripts, files videos into folders in bulk, curates showcases,
writes chapters and captions, and manages tags, privacy and embed presets.

There are 43 tools, and the bulk folder operations are the point of them. Vimeo
moves videos between folders one at a time, so refiling a back catalog of
hundreds is hundreds of drags. Here it is one call that takes up to 100 videos.

Built by [Navid Moazzez](https://navid.me?utm_source=github&utm_medium=referral&utm_campaign=vimeo-mcp-cli&utm_content=readme). Built on [Slipway](https://github.com/thenavidm/slipway), which turns one definition of each tool into the MCP server and the CLI.

<img src="https://cdn.navid.media/repos/vimeo-mcp.gif?v=1" alt="Claude Code using the Vimeo MCP server" width="520">

## Two ways to use it

### Command line

`vimeo-cli` runs every tool as a command. Agents that run commands, like
Claude Code, Codex and OpenCode, use it on their own, and you can type the same
commands in a terminal, a script or a cron job:

```bash
vimeo-cli                                          # every command, one line each
vimeo-cli get-me                                   # which account and plan the token reaches
vimeo-cli search-videos --query "webinar"
vimeo-cli get-video --video-id 123456789 --json
vimeo-cli which file videos into a folder          # find the command for a task
vimeo-cli <command> --help                         # what any command takes
```

`--confirm` is the shell spelling of the confirmation deleting needs. `--json` gives JSON, `--compact` puts it on one line, `--select` keeps only the fields you name, and `--agent` turns on all of it for a script. Exit codes are 0 ok, 1 unexpected, 2 usage or a refused write, 3 not found, 4 a rejected token or a missing scope, 5 API, 7 rate limited and 10 no token, so a script branches on the number.

`vimeo-cli schema <command>` prints the exact JSON Schema an MCP client
receives for that tool.

### MCP server, for AI agents

`vimeo-mcp` is what Claude Code, Claude Desktop, Cursor and the rest launch.
You never run it by hand:

```bash
claude mcp add vimeo -e VIMEO_PAT=your-token -- npx -y @thenavidm/vimeo-mcp-cli
```

In Claude Desktop, the [`.mcpb` extension](https://github.com/thenavidm/vimeo-mcp-cli/releases/latest)
installs on a double click. Section 4 has every other client.

## Contents

| | Section | |
|---|---|---|
| 1 | [What you can ask it](#1-what-you-can-ask-it-) | Real prompts, not features |
| 2 | [Quick install](#2-quick-install-) | Node, one command |
| 3 | [Setup](#3-setup-) | Getting a token, and the scopes that matter |
| 4 | [Connect your client](#4-connect-your-client-) | Every client, copy and paste |
| 5 | [Check it worked](#5-check-it-worked-) | `doctor` |
| 6 | [What it costs to have connected](#6-what-it-costs-to-have-connected) | Measured in Claude Code, and how to spend less |
| 7 | [Tools](#7-tools-%EF%B8%8F) | All 43 |
| 8 | [Writing safely](#8-writing-safely-%EF%B8%8F) | What is guarded, what is not |
| 9 | [How Vimeo actually behaves](#9-how-vimeo-actually-behaves-) | The things that surprise people |
| 10 | [This and Vimeo's own connector](#10-this-and-vimeos-own-connector-%EF%B8%8F) | Which one you want, and when |
| 11 | [Your data](#11-your-data-) | What is stored, and where |
| 12 | [Troubleshooting](#12-troubleshooting-) | Symptom to cause |
| 13 | [FAQ](#13-faq-) | Start here if you are new |
| 14 | [What changed](#14-what-changed-) | Every release |

## 1. What you can ask it 💬

- "What's in my Vimeo library, and how much of it is unfiled?"
- "Read the transcript of the affiliate marketing workshop and write show notes."
- "Generate chapter markers for that talk from its transcript and add them."
- "Move every video with 'Workshop' in the title into the Workshops folder."
- "Which videos are set to public that shouldn't be?"
- "Build a showcase called Bootcamp 2026 and add these eight videos to it."
- "Add English captions to this video from the VTT file I just made."
- "How many plays does each video in the AI for Creators folder have?"
- "Pull the download link for the original file of video 1096473192."
- "Which of my videos have no tags?"

The one that is impossible without this is filing a back catalog.
`add_videos_to_folder` takes up to 100 ids in a single call, so reorganizing a
library of hundreds of videos is one request rather than hundreds of drags.

## 2. Quick install ⚡

You need Node 22 or newer, and nothing else.

```bash
npx -y @thenavidm/vimeo-mcp-cli --version
```

That is the whole install. `npx` fetches it on demand, so there is nothing to
update later.

For the CLI as a command you or your agent can run anywhere, install it once:

```bash
npm install -g @thenavidm/vimeo-mcp-cli
vimeo-cli
```

## 3. Setup 🔑

You need a Vimeo personal access token.

Read this before you generate one. A token's scopes are fixed the moment it is
created and cannot be changed afterwards. If you miss a box, the only fix is to
generate a new token. Two are off by default and are the ones people miss:

| Scope | Without it |
|---|---|
| `delete` | Every delete tool fails, with an error that never mentions scopes |
| `video_files` | Download links come back empty, so original files are unreachable |

### Have an agent do it

The agent cannot sign in to Vimeo for you. Only you can create the token. What
it can do is walk you through it, wire up the config and verify the connection.

Paste this into Claude Code, Cursor, or any agent with terminal access:

```
Help me set up the Vimeo MCP server.

1. Tell me how to create a Vimeo personal access token, and which scopes to
   tick. Then stop and wait: I will paste the token back to you.
2. Once I give you the token, add the server to my MCP client config with the
   token in the env block.
3. Run the doctor command and tell me what it says about my scopes and plan.
```

### Or do it yourself

1. Go to <https://developer.vimeo.com/apps> and sign in.
2. Create an app, or open one you already have.
3. Open the app's Authentication section.
4. Generate a personal access token.
5. Tick the scopes. `public`, `private`, `edit`, `create`, `interact` and
   `upload` cover everyday use. Add `delete` for the delete tools and
   `video_files` for download links. `stats` only does something on a paid plan.
6. Copy the token immediately. Vimeo shows it once.

### To revoke it

Go back to the same Authentication section and delete the token. It stops
working at once, everywhere it is configured.

## 4. Connect your client 🔌

The long version, every step with what to do when one fails, is in [INSTALL.md](INSTALL.md).

### Claude Code

```bash
claude mcp add vimeo \
  -e VIMEO_PAT=your_token_here \
  -- npx -y @thenavidm/vimeo-mcp-cli@latest
```

Add `--scope user` to make it available in every project rather than just this one.

### Claude Desktop

The short way: download the [`.mcpb` extension](https://github.com/thenavidm/vimeo-mcp-cli/releases/latest)
from the latest release and double-click it. It carries its own dependencies,
so there is no config file to edit and nothing to install first. Claude Desktop asks for your Vimeo personal access token.

The long way, if you would rather edit the config yourself:

| Platform | Config path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "vimeo": {
      "command": "npx",
      "args": ["-y", "@thenavidm/vimeo-mcp-cli@latest"],
      "env": { "VIMEO_PAT": "your_token_here" }
    }
  }
}
```

> **Tip**
> Claude Desktop does not inherit your shell PATH. If `npx` is not found, use
> the absolute path from `which npx`.

Quit Claude Desktop completely and reopen it.

### claude.ai on the web

claude.ai runs connectors from Anthropic's cloud, not from your machine, so it
needs a public HTTPS URL rather than a local command.

```bash
npx -y @thenavidm/vimeo-mcp-cli@latest --http --port 8000
```

Host that behind a public HTTPS URL, then in claude.ai go to Customize,
Connectors, +, Add custom connector, and paste the URL. It binds to `127.0.0.1`,
which is all a tunnel or a proxy on the same machine needs. To accept
connections from outside the machine, set `VIMEO_HTTP_HOST=0.0.0.0` together
with `VIMEO_HTTP_TOKEN`, a secret every request must send: without one, the
server refuses to listen beyond this machine.

### Cursor

Cursor reads `.cursor/mcp.json`, which takes the same JSON shape as Claude
Desktop under the key `mcpServers`.

### Windsurf

Windsurf reads `~/.codeium/windsurf/mcp_config.json` under the key `mcpServers`.

### VS Code

VS Code reads `.vscode/mcp.json`, where the key is `servers` rather than
`mcpServers`, and each entry takes `"type": "stdio"`.

### Codex CLI

Codex CLI reads `~/.codex/config.toml`:

```toml
[mcp_servers.vimeo]
command = "npx"
args = ["-y", "@thenavidm/vimeo-mcp-cli@latest"]

[mcp_servers.vimeo.env]
VIMEO_PAT = "your_token_here"
```

### Gemini CLI

Gemini CLI reads `~/.gemini/settings.json` under the key `mcpServers`.

### Everything else

Any stdio MCP client takes the same three things: the command `npx`, the args,
and the env block.

**To disconnect,** remove the server from your MCP client's config, then delete
the token in your app's Authentication section at developer.vimeo.com. The
second step matters: removing the config stops this server using it, revoking it
stops anything using it.

## 5. Check it worked 🩺

```bash
VIMEO_PAT=your_token npx -y @thenavidm/vimeo-mcp-cli@latest doctor
```

It prints the account, the plan and the token's scopes, names any tool that a
missing scope disables, and tests whether the plan has analytics. Both of the
things that actually go wrong show up here. It exits 0 when everything works, 1
when a scope is missing or the token is rejected, and 10 when no token is set.

## 6. What it costs to have connected

Both surfaces are the same program with the same 43 tools. The
difference is when the model pays for them. Measured in Claude Code:

| | MCP server | CLI |
|---|---|---|
| Every message, with every tool loaded | 9,200 tokens | nothing |
| Every message, Claude Code's default | 1,200 tokens | nothing |
| When Vimeo comes up | nothing more, or the tools it picks | 3,100 tokens for `SKILL.md`, once |
| 20 messages with Vimeo in 1, every tool loaded | 184,000 tokens | 3,100 tokens |

Claude Code's [tool search](https://code.claude.com/docs/en/mcp#scale-with-mcp-tool-search)
is on by default: it sends only the tool names and the server instructions,
and loads a tool's full definition when the model reaches for it. An app that
loads every tool up front pays the first line on every message, whether
Vimeo comes up or not. With the skill added, Claude Code also lists its
one-line description, about 210 tokens.

To spend less, turn the server off when you are not using it, which in Claude
Code is the `/mcp` panel. `VIMEO_READ_ONLY=1` takes the 26 write tools off the list, leaving 17.
Or install the CLI and add the server on the days it earns its place.

Measured on 2026-10-05 against 1.1.1, with Claude Code 2.1.286 on Claude Opus
5.5 (one short prompt with and without the server connected, once with
`ENABLE_TOOL_SEARCH=false` and once with the default, the difference read from
the API's own usage figures; `SKILL.md` the same way) and Codex 0.159.3 on
gpt-6.1-sol:

| Cost | 1.1.1 | 2.0.0 |
| --- | --- | --- |
| Claude Code, every tool loaded, every message | 10,668 | 9,156 |
| Claude Code's default, tool search, every message | 1,154 | 1,156 |
| `SKILL.md`, read once | 2,999 | 3,120 |
| Codex over the CLI, one task, median of five | 127,534 | 82,465 |
| Codex over MCP, the same task, median of five | 48,700 | 48,629 |

The task was "find the command that moves several videos into a folder, and
the flags it requires". Every tool loaded costs less because each tool no
longer repeats `$schema`, `additionalProperties` and an `execution` block. Over
the CLI, every 1.1.1 run read the general help twice and the command list
before the command's help, five requests that each carry the conversation so
far, and every 2.0.0 run asked `which` and read the help: three. Tool search
costs the same within the spread of each version's own rounds. `SKILL.md` costs
121 more because it lists `which` and exit code 1 and says how approval works
over MCP. Other apps and models count tokens a little differently, and
tool-list characters divided by four are not API usage.

## 7. Tools 🛠️

There are 43 tools, of which 17 are reads, and those are the only ones that
remain under `VIMEO_READ_ONLY=1`.

### Videos

| Tool | What it does |
|---|---|
| `list_videos` | List your library, optionally filtered to one folder |
| `get_video` | Full detail on one video |
| `search_videos` | Search your own library by title and description |
| `update_video` | Change title, description or privacy |
| `delete_video` | Permanently delete. Needs `delete`, confirms |
| `upload_video` | Upload by giving Vimeo a public URL to pull. Needs `upload` |
| `get_download_links` | Direct URLs for source and rendered files. Needs `video_files` |
| `set_video_thumbnail` | Set the poster frame from a timecode. Needs `upload` |

### Folders

| Tool | What it does |
|---|---|
| `list_folders` | Your folders with video counts |
| `get_folder` | One folder and what is in it |
| `create_folder` | Needs `create` |
| `update_folder` | Rename |
| `delete_folder` | Needs `delete`, confirms |
| `add_videos_to_folder` | Up to 100 videos in one call |
| `remove_videos_from_folder` | Up to 100 in one call. Unfiles by default |

### Showcases

| Tool | What it does |
|---|---|
| `list_showcases` | Your showcases with video counts |
| `get_showcase` | One showcase and its videos in curated order |
| `create_showcase` | Needs `create` |
| `update_showcase` | Name, description, privacy, sort order |
| `delete_showcase` | Needs `delete`, confirms. The videos survive |
| `add_video_to_showcase` | Adds a reference, does not move the video |
| `remove_video_from_showcase` | Removes the reference only |

### Chapters

| Tool | What it does |
|---|---|
| `list_chapters` | Chapters in timecode order |
| `add_chapter` | Add a marker at a timecode |
| `update_chapter` | Retitle it or move it |
| `delete_chapter` | Needs `delete`, confirms |

### Captions and transcripts

| Tool | What it does |
|---|---|
| `list_texttracks` | Caption tracks and their languages |
| `get_transcript` | The transcript as plain text, or raw WebVTT |
| `upload_texttrack` | Add captions from WebVTT you supply. Needs `upload` |
| `update_texttrack` | Rename, change language, or set active |
| `delete_texttrack` | Needs `delete`, confirms |

### Comments

| Tool | What it does |
|---|---|
| `list_comments` | Comments, wrapped as untrusted text |
| `add_comment` | Post publicly as you. Needs `interact`, confirms |
| `edit_comment` | Edit your own |
| `delete_comment` | Needs `delete`, confirms |

### Account, stats and settings

| Tool | What it does |
|---|---|
| `get_me` | Account, plan, storage and the token's scopes |
| `get_video_stats` | Lifetime plays, comments and likes. Every plan |
| `get_video_analytics` | Views over time and finish rate. Paid plans only |
| `set_video_tags` | Replace a video's tags |
| `get_video_privacy` | Who can watch and embed, plus the domain whitelist |
| `allow_embed_domain` | Allow one domain to embed |
| `list_embed_presets` | Your saved player presets |
| `apply_embed_preset` | Apply one to a video |

## 8. Writing safely ✍️

Writes work by default. Organizing a library is the point of the tool.

Seven tools need confirming every time: the six deletes, and `add_comment`,
because a comment is visible to everyone who can see the video the moment it
posts. Nothing else is gated, because moving a video between folders or editing
a title is one call to undo, and confirming everything teaches a model to
confirm reflexively.

Over MCP a person approves each of those calls. Claude Code (2.1.246 and later)
shows its own prompt, and a client that can show forms asks with an approval
form whose one box starts unticked. Where a client can do neither, the model's
`confirm: true` still counts, and `VIMEO_CONFIRM=model` makes it enough
everywhere, for an agent with no person to ask. In a terminal the flag is
`--confirm`, which `--agent` never adds.

Two flags deserve their own mention. `delete_videos_too` on `delete_folder` and
`remove_videos_from_folder` destroys videos rather than unfiling them. Both
default to false. `delete_folder` always needs confirming, and
`remove_videos_from_folder` only when the flag is set.

| Setting | Effect |
|---|---|
| `VIMEO_READ_ONLY=1` | Write tools are left off the list, and refused if called anyway. 17 tools remain |
| `VIMEO_ALLOW_DESTRUCTIVE=0` | Keeps ordinary writes, blocks deletes and comments |
| `VIMEO_AUDIT_LOG=<path>` | One JSON line per attempted write, allowed and blocked, with who approved it, then whether it was done or failed |

| | `readOnlyHint` | `destructiveHint` | `idempotentHint` |
|---|---|---|---|
| Reads | true | false | true |
| Reversible writes | false | false | true |
| Deletes and comments | false | true | false |
| `remove_videos_from_folder` | false | true | true |

`remove_videos_from_folder` tells clients the most it can do, destroy videos,
even though unfiling them is a reversible write.

Comment text is written by other people and can contain instructions aimed at
whatever reads it. Every comment comes back wrapped and labeled as
viewer-authored data, which helps and is not a guarantee. For an agent working
unattended on other people's content, `VIMEO_READ_ONLY=1` is the real defence.

## 9. How Vimeo actually behaves 🎬

**Scopes are frozen at creation.** A token cannot gain a scope later. `delete`
and `video_files` are both off by default, and Vimeo's 403 does not name the
missing scope, so a failing delete looks like a missing video. `doctor` names it.

**A 404 can mean "your plan does not include this".** Analytics and teams both
answer 404 rather than 402 on a free account. `get_video_analytics` translates
that into a plain sentence instead of passing the confusion along.

**Two things are called analytics.** `stats.plays` is a lifetime counter on
every plan. The analytics API is views over time and finish rate, on paid plans.

**A video lives in exactly one folder.** Adding it to a folder moves it. A
showcase is different: any video can be in any number of showcases, and adding
it there moves nothing.

**Vimeo expands nested objects in full.** Asking for a video's `parent_folder`
returns the folder, its owner, that owner's avatar in nine sizes and their
upload quota, about two kilobytes to learn a folder name. This server always
requests specific leaf fields, which is why its output is small.

**The bulk endpoints are inconsistent.** Folder add and remove take the video
list as a `uris` query parameter. The showcase bulk endpoint takes a `videos`
body field and it replaces the showcase contents rather than appending, which is
why this server does not expose it: adding to a showcase goes one video at a
time so a curated list cannot be wiped by accident.

**Transcripts are two requests.** The API returns caption metadata with a link,
and the text lives at that link on a CDN. The link is signed and short-lived, so
it cannot be cached or handed to someone to open later.

**Uploads are asynchronous.** `upload_video` returns a video id straight away
while transcoding continues. Watch `status` on `get_video` until it reads
`available`.

## 10. This and Vimeo's own connector ⚖️

Vimeo publishes its own hosted MCP connector at `mcp.vimeo.com`. It is good, it
is free with a Pro plan, and for a lot of people it is the right choice. Here is
the honest split, so you can pick rather than guess.

**Use Vimeo's** if you want analytics or their AI features. It has viewer
retention curves and retention insights, AI video summaries, semantic search
inside a video, teams, staff picks, and an editing and render pipeline. None of
that is reachable through the public API, so nothing here can match it.

**Use this one** if you want to change your library rather than read it.

| | This | Vimeo's |
|---|---|---|
| Runs | Locally, your own token | Hosted by Vimeo, OAuth |
| Plan needed | Any, including free | Pro or above |
| Delete videos | Yes, guarded | No, blocked by design |
| Upload videos | Yes | No upload tool |
| Create and rename folders | Yes | Read only |
| Move videos between folders | Yes, 100 per call | No |
| Showcase create, edit, delete | Yes | Create and update only |
| Chapters | Add, edit, delete | Add and read |
| Captions | Upload, edit, delete | Read |
| Comments | Post, edit, delete | Read |
| Tags, embed presets, domain whitelist | Yes | No |
| Original file downloads | Yes, with `video_files` | No |
| Viewer retention analytics | No | Yes |
| AI summaries, moment search, editing | No | Yes |

They are not rivals and nothing stops you running both. Theirs answers what
happened to a video. This one changes what the library looks like.

## 11. Your data 📂

There is no backend. This server runs on your machine and talks to
`api.vimeo.com` directly.

It stores nothing: there is no session file, no cache and no database. The only file it ever
writes is the audit log, and only when you set `VIMEO_AUDIT_LOG` to a path. That
file holds, per attempted write, a timestamp, the tool, its risk, a one-line
summary and what happened, who approved it when it needed approval, and a line
when it finished. It is created with `0600` permissions.

Your token lives wherever you put it, which is your MCP client's config file.
Nothing else is transmitted anywhere.

### Settings

The program reads the environment directly. It does not load `.env` files.

**Credentials**

| Variable | Default | Purpose |
| --- | --- | --- |
| `VIMEO_PAT` | Empty | Personal access token from https://developer.vimeo.com/apps |
| `VIMEO_ACCESS_TOKEN`, `VIMEO_TOKEN` | Empty | Other names for `VIMEO_PAT`, read when it is unset |

**Safety**

| Variable | Default | Purpose |
| --- | --- | --- |
| `VIMEO_READ_ONLY` | Off | `1` or `true` hides every write |
| `VIMEO_ALLOW_DESTRUCTIVE` | On | `0` or `false` blocks the deletes and comments |
| `VIMEO_CONFIRM` | `human` | `model` lets `confirm: true` alone approve over MCP, for an agent with no person to ask |
| `VIMEO_AUDIT_LOG` | Empty | Append guard decisions to this local path |

**Tuning**

| Variable | Default | Purpose |
| --- | --- | --- |
| `VIMEO_REQUEST_TIMEOUT_MS` | 30000 | Per-request deadline |
| `VIMEO_MIN_REQUEST_INTERVAL_MS` | 100 | Spacing between requests |
| `VIMEO_MAX_RETRIES` | 2 | Retries on 429, server errors and timeouts |
| `VIMEO_API_VERSION` | 3.4 | The Vimeo API version every request pins |
| `VIMEO_API_BASE` | https://api.vimeo.com | Vimeo's API root |
| `VIMEO_SURFACE` | `full` | `search` lists three tools that find, describe and run the rest |
| `VIMEO_TOOL_TIMEOUT_MS` | None | Give up on any tool after this long |
| `VIMEO_HTTP_PORT`, `VIMEO_HTTP_HOST`, `VIMEO_HTTP_TOKEN` | 8787, 127.0.0.1, none | For `--http`; any host but 127.0.0.1 needs the bearer token |
| `VIMEO_HTTP_ALLOWED_ORIGINS` | None | Comma-separated browser origins allowed to call `--http`; a page from any other site is refused |
| `VIMEO_DEBUG` | `0` | `1` prints debug lines on stderr |

## 12. Troubleshooting 🔧

Run `doctor` first. It catches most of this. Personal access tokens do not
expire on a timer: they stop when revoked, or when their app is deleted.

| Symptom | Cause |
|---|---|
| Every delete fails with a permission error | The token lacks the `delete` scope. It cannot be added: regenerate the token |
| `get_download_links` returns an empty list | The token lacks `video_files`, or downloads are off for that video |
| `get_video_analytics` says analytics is unavailable | The account is on a free plan. `get_video_stats` still works |
| A video "does not exist" but you can see it on vimeo.com | Usually a scope problem rather than a missing video. Check `doctor` |
| A just-uploaded video will not play | Still transcoding. Watch `status` until it reads `available` |
| A video vanished from its folder | `add_videos_to_folder` moves rather than copies. It is in the new folder |
| `npx` not found in Claude Desktop | Desktop does not inherit your shell PATH. Use the full path from `which npx` |
| Rate limited on a bulk job | Raise `VIMEO_MIN_REQUEST_INTERVAL_MS`, and pass whole lists rather than looping |

## 13. FAQ ❓

<details>
<summary><b>What is an MCP server?</b></summary>

An MCP server is a standard way to give an AI assistant real access to a tool,
so it can act rather than guess. You install it once, your assistant gains the tools, and it
works in Claude, Cursor, ChatGPT and anything else that speaks MCP.

</details>

<details>
<summary><b>What is the CLI?</b></summary>

`vimeo-cli` is the same program as the MCP server, run as commands. AI agents that run commands, like Claude Code, Codex and OpenCode, use it on their own, and you can type the same commands in a terminal, a script or a cron job. Every tool is a command with dashes, so `list_videos` runs as `vimeo-cli list-videos`.

</details>

<details>
<summary><b>Should I use the MCP server or the CLI?</b></summary>

Use the MCP server in an app with no terminal, like Claude Desktop's chat. Use the CLI anywhere commands run: an agent like Claude Code, Codex or OpenCode, a script or a cron job. The MCP server's tools take up context on every message, and the CLI costs nothing until it runs.

</details>

<details>
<summary><b>What is Vimeo?</b></summary>

Vimeo is a video hosting platform. People use it for work that needs to look
professional and stay private: course content, client work, internal training, webinars.
Unlike a public video site, you control exactly who can watch each video and
which sites are allowed to embed it.

</details>

<details>
<summary><b>Do I need to be technical to use this?</b></summary>

You need to paste a token into a config file once. The setup section has a
prompt you can hand to an agent that will do the config part for you. After that
you talk to it in plain language.

</details>

<details>
<summary><b>Is my data sent anywhere? Who can see it?</b></summary>

There is no backend and nothing is collected. The server runs on your machine
and talks to Vimeo's API directly. Whatever you ask your AI assistant is
governed by that assistant's own privacy terms, not by this server.

</details>

<details>
<summary><b>What can it do that I cannot do in Vimeo already?</b></summary>

It does bulk work, mostly. Filing a hundred videos into folders is one call here
and a hundred drags in the web app. Reading a transcript and turning it into chapter
markers is a normal request here and manual work there. Everything it does is
something the Vimeo API allows.

</details>

<details>
<summary><b>Can it delete something by accident?</b></summary>

Deleting is guarded twice. Six tools need confirming before they run:
`delete_video`, `delete_folder`, `delete_showcase`, `delete_chapter`,
`delete_texttrack` and `delete_comment`. Over MCP a person approves each one in
the client's own prompt or form; in a terminal it takes `--confirm`. On top of
that, most tokens do not hold the `delete` scope, so those tools fail outright
unless you deliberately ticked that box.

The one to watch is `delete_videos_too`, an option on `delete_folder` and
`remove_videos_from_folder` that destroys videos instead of unfiling them. It
defaults to false and needs confirming when set. If you want no risk at all, run
with `VIMEO_READ_ONLY=1`.

</details>

<details>
<summary><b>Vimeo has its own MCP connector. Why use this one?</b></summary>

They do different jobs. Vimeo's is hosted, needs a Pro plan, and is built for
reading:
viewer retention, AI summaries, moment search and their editing pipeline. It
deliberately cannot delete anything, cannot upload, and cannot write to folders.

This one runs locally on any plan including free, and is built for changing a
library: uploading, deleting, moving videos between folders in bulk, writing
chapters and captions, managing tags and embed presets.

If you want to know how a video performed, use theirs. If you want to reorganize
a library, use this. Running both is fine. Section 9 has the full table.

</details>

<details>
<summary><b>Does it cost anything?</b></summary>

The server is free and MIT licensed. You need a Vimeo account, and Vimeo's own
plan limits apply: analytics and teams need a paid plan, and upload limits
depend on your tier.

</details>

<details>
<summary><b>Does it work with ChatGPT, Cursor and Codex, or only Claude?</b></summary>

It works with any client that speaks MCP. Configs for Claude Code, Claude
Desktop, claude.ai, Cursor, Windsurf, VS Code, Codex CLI and Gemini CLI are all
in section 4.

</details>

<details>
<summary><b>Can I connect more than one Vimeo account?</b></summary>

You cannot do it in one server instance, because a token belongs to one account.
To use two, add the server twice under different names with a different token in
each.

</details>

## 14. What changed 📋

Every release is in [CHANGELOG.md](./CHANGELOG.md), newest first.

## Questions

Run into a problem or have a question?
[Open an issue](https://github.com/thenavidm/vimeo-mcp-cli/issues) and I will help.

## About the author

Navid Moazzez is a leading AI business strategist, and the host of the AI Creator Summit, watched by 100,000+ creators. He helps creators and founders master AI and build their own AI Operating System (AI OS) to automate their business and life. He creates useful free tools, MCP servers and CLIs that creators and founders can use in their own workflows.

**Links**

- Personal website: [navid.me](https://navid.me?utm_source=github&utm_medium=referral&utm_campaign=vimeo-mcp-cli&utm_content=readme)
- Link in bio: [navid.bio](https://navid.bio?utm_source=github&utm_medium=referral&utm_campaign=vimeo-mcp-cli&utm_content=readme)
- Navid Media: [navid.media](https://navid.media?utm_source=github&utm_medium=referral&utm_campaign=vimeo-mcp-cli&utm_content=readme)
- YouTube: [@thenavidm](https://youtube.com/@thenavidm?sub_confirmation=1) and [@thenavidai](https://youtube.com/@thenavidai?sub_confirmation=1)
- X: [@thenavidm](https://x.com/thenavidm)
- Instagram: [@thenavidm](https://instagram.com/thenavidm)
- LinkedIn: [thenavidm](https://linkedin.com/in/thenavidm)

If this is useful, star the repo and come say hi on [X](https://x.com/thenavidm).

## Dependencies

| Package | License | Why |
|---|---|---|
| [Slipway](https://github.com/thenavidm/slipway) | Apache-2.0 | The MCP server and the CLI from one definition of each tool |
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) | Apache-2.0 | The MCP protocol and its transports, through Slipway |
| [zod](https://github.com/colinhacks/zod) | MIT | Tool input schemas and validation |

## License

[MIT](./LICENSE). Free to use, modify, and share.

Not affiliated with, endorsed by, or connected to Vimeo.com, Inc. Vimeo is a trademark of Vimeo.com, Inc.

---

© 2026 [Navid Media](https://navid.media?utm_source=github&utm_medium=referral&utm_campaign=vimeo-mcp-cli&utm_content=readme). Made with ❤️ by [Navid Moazzez](https://navid.me?utm_source=github&utm_medium=referral&utm_campaign=vimeo-mcp-cli&utm_content=readme).

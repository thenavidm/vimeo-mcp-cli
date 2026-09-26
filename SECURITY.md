# Security

## Reporting a vulnerability

[Report it privately](https://github.com/thenavidm/vimeo-mcp-cli/security/advisories/new).
Please do not open a public issue for a security problem: an issue is visible to
everyone the moment you file it, including whoever would use the bug.

## What this server can reach

It holds one Vimeo personal access token and can do anything that token's scopes
allow on that account. Depending on which boxes were ticked when the token was
created, that can include:

- Reading every video in the library, including private and unlisted ones
- Reading transcripts and captions
- Changing titles, descriptions, tags and privacy settings
- Moving videos between folders, and creating or deleting folders and showcases
- Uploading videos and captions
- Posting comments publicly as the account owner
- **Permanently deleting videos**, if the token has the `delete` scope
- Retrieving signed download URLs for original source files, if the token has
  the `video_files` scope

That is the blast radius. A token with `delete` and `video_files` can destroy a
library and export it. Generate tokens with only the scopes you need.

## Where credentials are stored

This server stores nothing. The token is read from the environment at startup
and lives only in memory.

It lives on disk wherever you put it, which is your MCP client's config file.
Those files are usually not encrypted, so treat one as you would any file
holding a password.

## What it writes

It writes one optional file. When `VIMEO_AUDIT_LOG` is set to a path, each
attempted write appends one JSON line: a timestamp, the tool name, a one-line summary and
whether it was allowed or blocked. It is created with `0600` permissions, and no tool can read or edit it.

Nothing else is written: there is no cache, no session file and no database.

## Deliberately not implemented

- **No tool reads the audit log.** A record an agent can rewrite is not a record.
- **No bulk showcase replace.** Vimeo's endpoint replaces a showcase's entire
  contents rather than appending, and wrapping that in an "add videos" tool is
  how a curated list gets wiped by accident.
- **No account deletion, plan changes or billing.** Not a gap: this server does
  not touch the account itself.
- **HTTP transport binds to `127.0.0.1` by default.** Set `VIMEO_HTTP_HOST` to
  change that, and set `VIMEO_HTTP_TOKEN` if you do, because anything that can
  reach the port can use the Vimeo token behind it.

## Prompt injection

Comments on a video are written by other people and can contain text aimed at
whatever reads them, including instructions. "Summarize the comments on this
video" is a normal request, which makes this a real path rather than a
theoretical one.

Comment text is wrapped and labeled as viewer-authored data before it reaches
the model, and the server's instructions say to treat it as data. That framing
helps and it is not a guarantee. No framing is.

For an agent working unattended on other people's content, `VIMEO_READ_ONLY=1`
is the real defence: write tools are not registered at all, so there is nothing
for injected text to invoke.

## Good-faith research

Read, run and pull apart anything here. Nobody but the maintainer can change
this repository, so nothing you do while investigating puts it at risk.

The care is owed to the service the tool talks to, not to the code. When
testing, use your own account and your own data. Do not point it at somebody
else's, and do not hammer a shared API to the point where other people notice.
If a test could affect anyone but you, stop and send a private report first.

Research done in that spirit is welcome, and nothing here is a trap.

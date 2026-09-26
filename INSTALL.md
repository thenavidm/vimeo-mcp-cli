# Install

## Getting a Vimeo token

The long version of section 3 of the README.

## Why the scopes matter more here than on most APIs

Vimeo fixes a token's scopes at the moment you create it. There is no settings
page to add one later. If you miss a box you regenerate the token and update it
everywhere you configured it.

Two are off by default and are the ones people miss:

| Scope | Without it |
|---|---|
| `delete` | Every delete tool fails with a permission error that does not mention scopes |
| `video_files` | `get_download_links` returns nothing, so original files are unreachable |

## Step by step

1. Sign in at <https://developer.vimeo.com/apps>.
2. Create an app, or open an existing one. The name is only shown to you.
3. Open the app's **Authentication** section.
4. Generate a personal access token.
5. Tick the scopes. For everyday use: `public`, `private`, `edit`, `create`,
   `interact`, `upload`. Add `delete` and `video_files` if you want those tools.
   `stats` only does something on a paid plan.
6. Copy the token straight away. Vimeo shows it once and never again.

If a label on that page does not match what you see, the page has been redesigned
since this was written. The goal is the same: an app you own, its authentication
area, a personal access token with the scopes ticked.

## Check it

```bash
VIMEO_PAT=your_token npx -y @thenavidm/vimeo-mcp-cli@latest doctor
```

It prints every scope the token holds and names any tool a missing scope
disables.

## What the plan changes

Some capabilities depend on the Vimeo plan rather than the token:

| Capability | Needs |
|---|---|
| Analytics: views over time, finish rate, geography | A paid plan |
| Teams | A plan that includes team members |
| Larger uploads | Varies by tier |

Both answer 404 rather than saying the plan is the problem, which reads as "no
such video". `doctor` tests analytics directly and says which it is.

## Revoking

Same Authentication section, delete the token. It stops working immediately
everywhere it is configured. Removing it from a client config only stops that
client using it, so revoke at Vimeo if the token may have leaked.

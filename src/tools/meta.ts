/**
 * Account, stats, tags, privacy and embed presets.
 *
 * The honesty problem this module exists to fix: Vimeo has two different things
 * both reasonably called analytics, and conflating them produces a tool that
 * looks like it works and quietly answers a different question.
 *
 * `stats.plays` on the video object is a lifetime play counter. It is on every
 * plan and it is what `get_video_stats` returns.
 *
 * `/videos/{id}/analytics` is the real reporting API: views over time, finish
 * rate, geography, referrers. It needs a paid plan and answers 404 on a free
 * one rather than saying so, which is indistinguishable from a missing video.
 * `get_video_analytics` calls it and translates that 404 into a plain sentence.
 */

import { z } from "zod";
import { annotationsFor } from "../safety.js";
import { normalizeVideoId, idFromUri, humanDuration } from "../format/videos.js";
import { json, type ToolContext } from "./types.js";
import { VimeoError } from "../api/errors.js";

export function registerMetaTools(ctx: ToolContext): void {
  const { server, client } = ctx;

  server.tool(
    "get_me",
    "Show the Vimeo account this server is connected to: name, plan, upload quota and the scopes the token holds.",
    {},
    annotationsFor("read"),
    async () => {
      const [me, verified] = await Promise.all([
        client.request("GET", "/me", {
          params: {
            fields: "uri,name,link,account,upload_quota.lifetime,upload_quota.periodic",
          },
          tool: "get_me",
        }),
        client.verify().catch(() => undefined),
      ]);

      const m = me as {
        uri?: string;
        name?: string;
        link?: string;
        account?: string;
        upload_quota?: {
          lifetime?: { free?: number; max?: number; used?: number };
        };
      };
      const q = m.upload_quota?.lifetime;

      return json({
        user_id: idFromUri(m.uri),
        name: m.name,
        profile: m.link,
        plan: m.account,
        scopes: verified?.scopes,
        storage:
          q && q.max
            ? {
                used_gb: Math.round(((q.used ?? 0) / 1e9) * 10) / 10,
                total_gb: Math.round((q.max / 1e9) * 10) / 10,
              }
            : undefined,
      });
    },
  );

  server.tool(
    "get_video_stats",
    "Get a video's lifetime play count plus its comment and like totals. This works on every plan. For views over time, finish rate and geography use get_video_analytics, which needs a paid plan.",
    { video_id: z.string().describe("Video id.") },
    annotationsFor("read"),
    async ({ video_id }) => {
      const id = normalizeVideoId(video_id);
      const raw = (await client.request("GET", `/videos/${id}`, {
        params: {
          fields:
            "uri,name,duration,created_time,stats.plays,metadata.connections.comments.total,metadata.connections.likes.total",
        },
        tool: "get_video_stats",
      })) as {
        name?: string;
        duration?: number;
        created_time?: string;
        stats?: { plays?: number | null };
        metadata?: { connections?: { comments?: { total?: number }; likes?: { total?: number } } };
      };

      return json({
        video_id: id,
        name: raw.name,
        duration: raw.duration === undefined ? undefined : humanDuration(raw.duration),
        created: raw.created_time,
        plays: raw.stats?.plays ?? 0,
        comments: raw.metadata?.connections?.comments?.total ?? 0,
        likes: raw.metadata?.connections?.likes?.total ?? 0,
        note: "Lifetime totals. get_video_analytics has the time series, on a paid plan.",
      });
    },
  );

  server.tool(
    "get_video_analytics",
    "Get real analytics for a video: views over time, unique viewers, finish rate and where views came from. This is Vimeo's reporting API and it needs a paid plan. On a free account it returns a plain explanation rather than an error.",
    {
      video_id: z.string().describe("Video id."),
      from_date: z.string().optional().describe("Start date, YYYY-MM-DD. Defaults to 30 days ago."),
      to_date: z.string().optional().describe("End date, YYYY-MM-DD. Defaults to today."),
      dimension: z
        .enum(["country", "device", "browser", "embed_domain", "time"])
        .default("time")
        .describe("How to break the numbers down."),
    },
    annotationsFor("read"),
    async ({ video_id, from_date, to_date, dimension }) => {
      const id = normalizeVideoId(video_id);
      const to = to_date ?? new Date().toISOString().slice(0, 10);
      const from =
        from_date ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

      try {
        const raw = await client.request("GET", `/videos/${id}/analytics`, {
          params: { from: from, to: to, dimension },
          scope: "stats",
          tool: "get_video_analytics",
        });
        return json({ video_id: id, from, to, dimension, analytics: raw });
      } catch (error) {
        // Vimeo answers 404 rather than 402 when the plan does not include
        // analytics, so the raw error reads as "no such video" and sends people
        // looking in the wrong place.
        if (error instanceof VimeoError && error.status === 404) {
          return json({
            video_id: id,
            analytics: null,
            reason: "plan",
            note: "Vimeo's analytics API is not available on this account. It needs a paid plan, and on a free one the endpoint answers 404 rather than saying so. get_video_stats returns the lifetime play count, which works on every plan.",
          });
        }
        throw error;
      }
    },
  );

  server.tool(
    "set_video_tags",
    "Replace a video's tags. Pass the complete list you want, because this overwrites what is there rather than adding to it. Tags help Vimeo's own search and your search_videos results.",
    {
      video_id: z.string().describe("Video id."),
      tags: z
        .array(z.string().min(1))
        .max(20)
        .describe("The full tag list to set. An empty array clears all tags."),
    },
    annotationsFor("write", { idempotent: true }),
    async ({ video_id, tags }) => {
      const id = normalizeVideoId(video_id);
      // PUT /videos/{id}/tags replaces the whole set in one call, which is why
      // the tool is named "set" rather than "add".
      const raw = await client.request("PUT", `/videos/${id}/tags`, {
        body: tags.map((tag) => ({ name: tag })),
        scope: "edit",
        tool: "set_video_tags",
      });
      const data = (raw as { data?: Array<{ tag?: string; name?: string }> }).data ?? [];
      return json({
        updated: true,
        video_id: id,
        tags: data.map((t) => t.tag ?? t.name).filter(Boolean),
      });
    },
  );

  server.tool(
    "get_video_privacy",
    "Show exactly who can watch and embed a video, including the domain whitelist when embedding is restricted.",
    { video_id: z.string().describe("Video id.") },
    annotationsFor("read"),
    async ({ video_id }) => {
      const id = normalizeVideoId(video_id);
      const raw = (await client.request("GET", `/videos/${id}`, {
        params: { fields: "uri,name,privacy" },
        tool: "get_video_privacy",
      })) as {
        name?: string;
        privacy?: { view?: string; embed?: string; download?: boolean; comments?: string };
      };

      const out: Record<string, unknown> = {
        video_id: id,
        name: raw.name,
        view: raw.privacy?.view,
        embed: raw.privacy?.embed,
        download: raw.privacy?.download,
        comments: raw.privacy?.comments,
      };

      if (raw.privacy?.embed === "whitelist") {
        const domains = await client.list(`/videos/${id}/privacy/domains`, {
          tool: "get_video_privacy",
        });
        out.allowed_domains = domains.data.map((d) => (d as { domain?: string }).domain);
      }
      return json(out);
    },
  );

  server.tool(
    "allow_embed_domain",
    "Allow a specific domain to embed a video. This only takes effect when the video's embed privacy is set to 'whitelist', so set that with update_video first.",
    {
      video_id: z.string().describe("Video id."),
      domain: z.string().min(1).describe("Domain to allow, such as example.com."),
    },
    annotationsFor("write", { idempotent: true }),
    async ({ video_id, domain }) => {
      const id = normalizeVideoId(video_id);
      await client.request("PUT", `/videos/${id}/privacy/domains/${domain}`, {
        scope: "edit",
        tool: "allow_embed_domain",
      });
      return json({
        allowed: true,
        video_id: id,
        domain,
        note: "This has no effect unless the video's embed privacy is 'whitelist'.",
      });
    },
  );

  server.tool(
    "list_embed_presets",
    "List your saved embed presets, which control player colors, controls and branding.",
    { per_page: z.number().int().min(1).max(100).default(25) },
    annotationsFor("read"),
    async ({ per_page }) => {
      const result = await client.list("/me/presets", {
        params: { per_page, fields: "uri,name" },
        tool: "list_embed_presets",
      });
      return json({
        total: result.total,
        presets: result.data.map((p) => {
          const preset = p as { uri?: string; name?: string };
          return { id: idFromUri(preset.uri), name: preset.name };
        }),
      });
    },
  );

  server.tool(
    "apply_embed_preset",
    "Apply a saved embed preset to a video, so its player matches your branding.",
    {
      video_id: z.string().describe("Video id."),
      preset_id: z.string().describe("Preset id, from list_embed_presets."),
    },
    annotationsFor("write", { idempotent: true }),
    async ({ video_id, preset_id }) => {
      const id = normalizeVideoId(video_id);
      await client.request("PUT", `/videos/${id}/presets/${preset_id}`, {
        scope: "edit",
        tool: "apply_embed_preset",
      });
      return json({ applied: true, video_id: id, preset_id });
    },
  );
}

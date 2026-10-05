/**
 * Showcase tools. The API calls them albums, the UI calls them showcases.
 *
 * A showcase is a curated, orderable, brandable playlist with its own page. It
 * is not a folder: a video lives in exactly one folder but can appear in any
 * number of showcases, and adding it to one does not move it.
 *
 * Deliberately not wired up: `PUT /me/albums/{id}/videos`, which takes a
 * comma-separated list and *replaces the entire contents* of the showcase.
 * There is no additive bulk endpoint. Exposing a "add these videos" tool on top
 * of a replace call is how a model wipes a curated showcase while believing it
 * appended to it, so adding goes one video at a time through the single-video
 * endpoint instead.
 */

import { z } from "zod";
import { annotationsFor } from "../safety.js";
import { normalizeVideoId, slimShowcase, slimVideo } from "../format/videos.js";
import { json, SHOWCASE_FIELDS, VIDEO_FIELDS, type ToolContext } from "./types.js";

export function registerShowcaseTools(ctx: ToolContext): void {
  const { server, client } = ctx;

  server.tool(
    "list_showcases",
    "List your showcases, which the API calls albums. Each is a curated playlist with its own page.",
    {
      page: z.number().int().min(1).default(1),
      per_page: z.number().int().min(1).max(100).default(50),
      sort: z.enum(["date", "alphabetical", "videos", "duration"]).default("date"),
      direction: z.enum(["asc", "desc"]).default("desc"),
    },
    annotationsFor("read"),
    async ({ page, per_page, sort, direction }) => {
      const result = await client.list("/me/albums", {
        params: { page, per_page, sort, direction, fields: SHOWCASE_FIELDS },
        tool: "list_showcases",
      });
      return json({
        total: result.total,
        has_more: Boolean(result.nextPath),
        showcases: result.data.map((s) => slimShowcase(s as never)),
      });
    },
  );

  server.tool(
    "get_showcase",
    "Get one showcase and the videos in it, in their curated order.",
    {
      showcase_id: z.string().describe("Showcase (album) id."),
      include_videos: z.boolean().default(true),
      per_page: z.number().int().min(1).max(100).default(50),
    },
    annotationsFor("read"),
    async ({ showcase_id, include_videos, per_page }) => {
      const showcase = await client.request("GET", `/me/albums/${showcase_id}`, {
        params: { fields: SHOWCASE_FIELDS },
        tool: "get_showcase",
      });
      const out: Record<string, unknown> = { showcase: slimShowcase(showcase as never) };

      if (include_videos) {
        const videos = await client.list(`/me/albums/${showcase_id}/videos`, {
          params: { per_page, fields: VIDEO_FIELDS },
          tool: "get_showcase",
        });
        out.videos = videos.data.map((v) => slimVideo(v as never));
        out.video_page_has_more = Boolean(videos.nextPath);
      }
      return json(out);
    },
  );

  server.tool(
    "create_showcase",
    "Create a showcase. Needs the create scope.",
    {
      name: z.string().min(1).describe("Showcase name."),
      description: z.string().optional(),
      privacy: z
        .enum(["anybody", "password", "embed_only"])
        .default("anybody")
        .describe("Who can see the showcase page."),
      password: z.string().optional().describe("Required when privacy is 'password'."),
      sort: z
        .enum(["arranged", "newest", "oldest", "alphabetical", "plays", "comments", "likes"])
        .default("arranged")
        .describe("How videos are ordered. 'arranged' means your manual order."),
    },
    annotationsFor("write"),
    async ({ name, description, privacy, password, sort }) => {
      const body: Record<string, unknown> = { name, privacy, sort };
      if (description) body.description = description;
      if (password) body.password = password;

      const raw = await client.request("POST", "/me/albums", {
        body,
        params: { fields: SHOWCASE_FIELDS },
        scope: "create",
        tool: "create_showcase",
      });
      return json({ created: true, showcase: slimShowcase(raw as never) });
    },
  );

  server.tool(
    "update_showcase",
    "Update a showcase's name, description, privacy or sort order. Only the fields you pass change.",
    {
      showcase_id: z.string().describe("Showcase id."),
      name: z.string().optional(),
      description: z.string().optional(),
      privacy: z.enum(["anybody", "password", "embed_only"]).optional(),
      password: z.string().optional(),
      sort: z
        .enum(["arranged", "newest", "oldest", "alphabetical", "plays", "comments", "likes"])
        .optional(),
    },
    annotationsFor("write", { idempotent: true }),
    async ({ showcase_id, ...fields }) => {
      const body = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined),
      );
      if (Object.keys(body).length === 0) {
        return json({ error: "Nothing to update. Pass at least one field." });
      }
      const raw = await client.request("PATCH", `/me/albums/${showcase_id}`, {
        body,
        params: { fields: SHOWCASE_FIELDS },
        scope: "edit",
        tool: "update_showcase",
      });
      return json({ updated: true, showcase: slimShowcase(raw as never) });
    },
  );

  server.tool(
    "delete_showcase",
    "Delete a showcase. The videos in it are not deleted, they stay in your library, but the showcase's curated order and branding are gone. Needs the delete scope. Requires confirm: true.",
    {
      showcase_id: z.string().describe("Showcase id."),
    },
    annotationsFor("destructive"),
    async ({ showcase_id }) => {
      await client.request("DELETE", `/me/albums/${showcase_id}`, {
        scope: "delete",
        tool: "delete_showcase",
      });
      return json({ deleted: true, showcase_id });
    },
  );

  server.tool(
    "add_video_to_showcase",
    "Add one video to a showcase. The video stays where it is in your library and is not moved. Call this once per video: Vimeo's bulk showcase endpoint replaces the whole contents rather than appending, so it is deliberately not exposed here.",
    {
      showcase_id: z.string().describe("Showcase id."),
      video_id: z.string().describe("Video id to add."),
    },
    annotationsFor("write", { idempotent: true }),
    async ({ showcase_id, video_id }) => {
      const id = normalizeVideoId(video_id);
      await client.request("PUT", `/me/albums/${showcase_id}/videos/${id}`, {
        scope: "edit",
        tool: "add_video_to_showcase",
      });
      return json({ added: true, showcase_id, video_id: id });
    },
  );

  server.tool(
    "remove_video_from_showcase",
    "Remove one video from a showcase. The video itself is untouched and stays in your library.",
    {
      showcase_id: z.string().describe("Showcase id."),
      video_id: z.string().describe("Video id to remove."),
    },
    annotationsFor("write", { idempotent: true }),
    async ({ showcase_id, video_id }) => {
      const id = normalizeVideoId(video_id);
      await client.request("DELETE", `/me/albums/${showcase_id}/videos/${id}`, {
        scope: "edit",
        tool: "remove_video_from_showcase",
      });
      return json({ removed: true, showcase_id, video_id: id });
    },
  );
}

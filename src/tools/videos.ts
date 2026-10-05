/**
 * Video tools: the library itself.
 *
 * `get_download_links` is the one worth knowing about. It needs the
 * `video_files` scope, which a token only has if that box was ticked when it
 * was generated, and it is the only way to get at an original source file
 * through the API.
 */

import { z } from "zod";
import { annotationsFor } from "../safety.js";
import { normalizeVideoId, slimVideo } from "../format/videos.js";
import { json, VIDEO_FIELDS, VIDEO_FIELDS_FULL, type ToolContext } from "./types.js";

export function registerVideoTools(ctx: ToolContext): void {
  const { server, client } = ctx;

  server.tool(
    "list_videos",
    "List videos in your Vimeo library, newest first by default. Returns a trimmed shape: id, name, duration, privacy, play count, folder and status. Use get_video for the full object on one video.",
    {
      page: z.number().int().min(1).default(1).describe("Page number, from 1."),
      per_page: z.number().int().min(1).max(100).default(25).describe("Results per page, max 100."),
      sort: z
        .enum(["date", "alphabetical", "plays", "duration", "modified_time"])
        .default("date")
        .describe("Sort field."),
      direction: z.enum(["asc", "desc"]).default("desc").describe("Sort direction."),
      folder_id: z
        .string()
        .optional()
        .describe("Only videos in this folder. Omit for the whole library."),
    },
    annotationsFor("read"),
    async ({ page, per_page, sort, direction, folder_id }) => {
      const path = folder_id ? `/me/projects/${folder_id}/videos` : "/me/videos";
      const result = await client.list(path, {
        params: { page, per_page, sort, direction, fields: VIDEO_FIELDS },
        scope: folder_id ? "private" : undefined,
        tool: "list_videos",
      });
      return json({
        total: result.total,
        page: result.page,
        per_page: result.perPage,
        has_more: Boolean(result.nextPath),
        videos: result.data.map((v) => slimVideo(v as never)),
      });
    },
  );

  server.tool(
    "get_video",
    "Get the full details of one video: description, embed URL, thumbnail, privacy, tags and transcode status.",
    {
      video_id: z
        .string()
        .describe("Video id. A numeric id, a /videos/ URI or a vimeo.com URL all work."),
    },
    annotationsFor("read"),
    async ({ video_id }) => {
      const id = normalizeVideoId(video_id);
      const raw = await client.request("GET", `/videos/${id}`, {
        params: { fields: VIDEO_FIELDS_FULL },
        tool: "get_video",
      });
      return json(slimVideo(raw as never));
    },
  );

  server.tool(
    "search_videos",
    "Search your own library by title and description. This searches your videos only, not all of Vimeo.",
    {
      query: z.string().min(1).describe("Search text."),
      page: z.number().int().min(1).default(1),
      per_page: z.number().int().min(1).max(100).default(25),
    },
    annotationsFor("read"),
    async ({ query, page, per_page }) => {
      const result = await client.list("/me/videos", {
        params: { query, page, per_page, fields: VIDEO_FIELDS },
        tool: "search_videos",
      });
      return json({
        query,
        total: result.total,
        has_more: Boolean(result.nextPath),
        videos: result.data.map((v) => slimVideo(v as never)),
      });
    },
  );

  server.tool(
    "update_video",
    "Update a video's title, description or privacy. Only the fields you pass change. Needs the edit scope.",
    {
      video_id: z.string().describe("Video id."),
      name: z.string().optional().describe("New title."),
      description: z.string().optional().describe("New description."),
      privacy_view: z
        .enum(["anybody", "nobody", "contacts", "password", "users", "unlisted", "disable"])
        .optional()
        .describe(
          "Who can watch. 'unlisted' gives a shareable link that is not listed publicly. 'disable' blocks playback on vimeo.com while leaving embeds working.",
        ),
      privacy_embed: z
        .enum(["public", "private", "whitelist"])
        .optional()
        .describe("Where it can be embedded. 'whitelist' restricts it to the domains you allow."),
      password: z
        .string()
        .optional()
        .describe("Required when privacy_view is 'password'."),
    },
    annotationsFor("write", { idempotent: true }),
    async ({ video_id, name, description, privacy_view, privacy_embed, password }) => {
      const id = normalizeVideoId(video_id);

      const body: Record<string, unknown> = {};
      if (name !== undefined) body.name = name;
      if (description !== undefined) body.description = description;
      if (password !== undefined) body.password = password;
      const privacy: Record<string, string> = {};
      if (privacy_view) privacy.view = privacy_view;
      if (privacy_embed) privacy.embed = privacy_embed;
      if (Object.keys(privacy).length) body.privacy = privacy;

      if (Object.keys(body).length === 0) {
        return json({ error: "Nothing to update. Pass at least one field." });
      }

      const raw = await client.request("PATCH", `/videos/${id}`, {
        body,
        params: { fields: VIDEO_FIELDS },
        scope: "edit",
        tool: "update_video",
      });
      return json({ updated: true, video: slimVideo(raw as never) });
    },
  );

  server.tool(
    "delete_video",
    "Permanently delete a video. This removes the source file and breaks every embed of it everywhere, and Vimeo keeps no copy to restore from. Needs the delete scope, which many tokens do not have. Requires confirm: true.",
    {
      video_id: z.string().describe("Video id to delete."),
    },
    annotationsFor("destructive"),
    async ({ video_id }) => {
      const id = normalizeVideoId(video_id);
      await client.request("DELETE", `/videos/${id}`, {
        scope: "delete",
        tool: "delete_video",
      });
      return json({ deleted: true, video_id: id });
    },
  );

  server.tool(
    "upload_video",
    "Upload a video to Vimeo by giving it a public URL to fetch. Vimeo pulls the file itself, so the URL has to be reachable from the internet, not a local path. Returns immediately with a video id while transcoding continues, so the video is not playable straight away. Needs the upload scope.",
    {
      url: z.string().url().describe("Publicly reachable URL of the video file."),
      name: z.string().optional().describe("Title for the new video."),
      description: z.string().optional(),
      folder_id: z.string().optional().describe("Put it straight into this folder."),
      privacy_view: z
        .enum(["anybody", "nobody", "contacts", "password", "unlisted", "disable"])
        .optional(),
    },
    annotationsFor("write"),
    async ({ url, name, description, folder_id, privacy_view }) => {
      const body: Record<string, unknown> = {
        upload: { approach: "pull", link: url },
      };
      if (name) body.name = name;
      if (description) body.description = description;
      if (folder_id) body.folder_uri = `/me/projects/${folder_id}`;
      if (privacy_view) body.privacy = { view: privacy_view };

      const raw = (await client.request("POST", "/me/videos", {
        body,
        params: { fields: `${VIDEO_FIELDS},upload.status` },
        scope: "upload",
        tool: "upload_video",
      })) as { upload?: { status?: string } };

      return json({
        created: true,
        video: slimVideo(raw as never),
        upload_status: raw.upload?.status,
        note: "Transcoding runs after the pull finishes. Call get_video and watch `status` until it reads 'available'.",
      });
    },
  );

  server.tool(
    "get_download_links",
    "Get direct download URLs for a video's source and rendered files. Needs the video_files scope, which is off by default on a new token, and the links are signed and expire within a few hours. This is the only way to retrieve an original file through the API.",
    {
      video_id: z.string().describe("Video id."),
    },
    annotationsFor("read"),
    async ({ video_id }) => {
      const id = normalizeVideoId(video_id);
      const raw = (await client.request("GET", `/videos/${id}`, {
        params: { fields: "uri,name,download,files" },
        scope: "video_files",
        tool: "get_download_links",
      })) as {
        name?: string;
        download?: Array<{
          quality?: string;
          size?: number;
          link?: string;
          expires?: string;
          public_name?: string;
        }>;
      };

      const downloads = raw.download ?? [];
      if (downloads.length === 0) {
        return json({
          video_id: id,
          name: raw.name,
          downloads: [],
          note: "No download links came back. That normally means the token lacks the video_files scope, or downloads are switched off for this video.",
        });
      }

      return json({
        video_id: id,
        name: raw.name,
        downloads: downloads.map((d) => ({
          quality: d.public_name ?? d.quality,
          size_bytes: d.size,
          expires: d.expires,
          link: d.link,
        })),
      });
    },
  );

  server.tool(
    "set_video_thumbnail",
    "Set a video's thumbnail from a timecode in the video itself. Needs the upload scope.",
    {
      video_id: z.string().describe("Video id."),
      time_seconds: z
        .number()
        .min(0)
        .describe("Point in the video to grab the frame from, in seconds."),
    },
    annotationsFor("write", { idempotent: true }),
    async ({ video_id, time_seconds }) => {
      const id = normalizeVideoId(video_id);

      // Two steps: create the picture resource at a timecode, then mark it
      // active. Skipping the activation leaves the old thumbnail in place and
      // the call still returns 201, which looks like success.
      const created = (await client.request("POST", `/videos/${id}/pictures`, {
        body: { time: time_seconds, active: true },
        scope: "upload",
        tool: "set_video_thumbnail",
      })) as { uri?: string; link?: string };

      return json({ updated: true, video_id: id, picture: created.uri, link: created.link });
    },
  );
}

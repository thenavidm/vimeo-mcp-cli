/**
 * Folder tools, called "projects" in the API and "folders" everywhere in the UI.
 *
 * The bulk pair is the reason this module exists. Filing a back catalog one
 * video at a time is a request per video and a rate limit waiting at the end of
 * it. `add_videos_to_folder` does the whole list in one call.
 *
 * One trap worth naming loudly. The remove endpoint takes
 * `should_delete_clips`, and setting it true does not unfile the videos, it
 * deletes them outright. It defaults to false here and is exposed as a separate
 * confirmed argument rather than a quiet boolean, because a model reading
 * "remove videos from folder" would not expect the option to destroy them.
 */

import { z } from "zod";
import { annotationsFor } from "../safety.js";
import { normalizeVideoId, slimFolder, slimVideo } from "../format/videos.js";
import { FOLDER_FIELDS, json, VIDEO_FIELDS, type ToolContext } from "./types.js";

/** Turn ids or URLs into the `/videos/{id}` URIs the bulk endpoints expect. */
function toVideoUris(ids: string[]): string {
  return ids.map((id) => `/videos/${normalizeVideoId(id)}`).join(",");
}

export function registerFolderTools(ctx: ToolContext): void {
  const { server, client } = ctx;

  server.tool(
    "list_folders",
    "List your Vimeo folders with a video count for each. Folders are called projects in the API.",
    {
      page: z.number().int().min(1).default(1),
      per_page: z.number().int().min(1).max(100).default(50),
      sort: z.enum(["date", "alphabetical", "modified_time"]).default("date"),
      direction: z.enum(["asc", "desc"]).default("desc"),
    },
    annotationsFor("read"),
    async ({ page, per_page, sort, direction }) => {
      const result = await client.list("/me/projects", {
        params: { page, per_page, sort, direction, fields: FOLDER_FIELDS },
        scope: "private",
        tool: "list_folders",
      });
      return json({
        total: result.total,
        has_more: Boolean(result.nextPath),
        folders: result.data.map((f) => slimFolder(f as never)),
      });
    },
  );

  server.tool(
    "get_folder",
    "Get one folder's details and the videos inside it.",
    {
      folder_id: z.string().describe("Folder id."),
      include_videos: z.boolean().default(true).describe("Also list the videos it contains."),
      per_page: z.number().int().min(1).max(100).default(50),
    },
    annotationsFor("read"),
    async ({ folder_id, include_videos, per_page }) => {
      const folder = await client.request("GET", `/me/projects/${folder_id}`, {
        params: { fields: FOLDER_FIELDS },
        scope: "private",
        tool: "get_folder",
      });
      const out: Record<string, unknown> = { folder: slimFolder(folder as never) };

      if (include_videos) {
        const videos = await client.list(`/me/projects/${folder_id}/videos`, {
          params: { per_page, fields: VIDEO_FIELDS },
          scope: "private",
          tool: "get_folder",
        });
        out.videos = videos.data.map((v) => slimVideo(v as never));
        out.video_page_has_more = Boolean(videos.nextPath);
      }
      return json(out);
    },
  );

  server.tool(
    "create_folder",
    "Create a folder. Needs the create scope.",
    { name: z.string().min(1).describe("Folder name.") },
    annotationsFor("write"),
    async ({ name }) => {
      const raw = await client.request("POST", "/me/projects", {
        body: { name },
        params: { fields: FOLDER_FIELDS },
        scope: "create",
        tool: "create_folder",
      });
      return json({ created: true, folder: slimFolder(raw as never) });
    },
  );

  server.tool(
    "update_folder",
    "Rename a folder. Needs the edit scope.",
    {
      folder_id: z.string().describe("Folder id."),
      name: z.string().min(1).describe("New name."),
    },
    annotationsFor("write", { idempotent: true }),
    async ({ folder_id, name }) => {
      const raw = await client.request("PATCH", `/me/projects/${folder_id}`, {
        body: { name },
        params: { fields: FOLDER_FIELDS },
        scope: "edit",
        tool: "update_folder",
      });
      return json({ updated: true, folder: slimFolder(raw as never) });
    },
  );

  server.tool(
    "delete_folder",
    "Delete a folder. By default the videos inside it survive and return to the main library. Needs the delete scope. Requires confirm: true.",
    {
      folder_id: z.string().describe("Folder id."),
      delete_videos_too: z
        .boolean()
        .default(false)
        .describe(
          "Also permanently delete every video in the folder. Off by default. This cannot be undone.",
        ),
    },
    annotationsFor("destructive"),
    async ({ folder_id, delete_videos_too }) => {
      const summary = delete_videos_too
        ? `delete folder ${folder_id} AND permanently delete every video inside it`
        : `delete folder ${folder_id}, keeping its videos`;
      await client.request("DELETE", `/me/projects/${folder_id}`, {
        params: { should_delete_clips: delete_videos_too ? "true" : "false" },
        scope: "delete",
        tool: "delete_folder",
      });
      return json({ deleted: true, folder_id, videos_deleted: delete_videos_too });
    },
  );

  server.tool(
    "add_videos_to_folder",
    "Add one or many videos to a folder in a single call. This is the efficient way to file a back catalog: pass the whole list rather than calling once per video. A video lives in one folder at a time, so this moves it rather than copying it.",
    {
      folder_id: z.string().describe("Destination folder id."),
      video_ids: z
        .array(z.string())
        .min(1)
        .max(100)
        .describe("Video ids to file. Up to 100 per call."),
    },
    annotationsFor("write", { idempotent: true }),
    async ({ folder_id, video_ids }) => {
      await client.request("PUT", `/me/projects/${folder_id}/videos`, {
        params: { uris: toVideoUris(video_ids) },
        scope: "interact",
        tool: "add_videos_to_folder",
      });
      return json({ moved: video_ids.length, folder_id, video_ids });
    },
  );

  server.tool(
    "remove_videos_from_folder",
    "Remove videos from a folder in one call. By default the videos are unfiled and return to the main library, not deleted. Setting delete_videos_too destroys them permanently, which is why it needs its own confirm.",
    {
      folder_id: z.string().describe("Folder id."),
      video_ids: z.array(z.string()).min(1).max(100).describe("Video ids to remove."),
      delete_videos_too: z
        .boolean()
        .default(false)
        .describe(
          "Permanently delete these videos instead of just unfiling them. Off by default and cannot be undone.",
        ),
    },
    annotationsFor("write", { idempotent: true }),
    async ({ folder_id, video_ids, delete_videos_too }) => {
      // Unfiling is reversible and is not gated. Destroying is: tools/kit.ts
      // gives this call the destructive risk when delete_videos_too is set, so
      // Slipway's guard asks for confirmation and the audit log sees it.
      await client.request("DELETE", `/me/projects/${folder_id}/videos`, {
        params: {
          uris: toVideoUris(video_ids),
          should_delete_clips: delete_videos_too ? "true" : "false",
        },
        // Unfiling needs only interact. Destroying needs delete, and declaring
        // it lets the scope check fail early with a useful message.
        scope: delete_videos_too ? "delete" : "interact",
        tool: "remove_videos_from_folder",
      });

      return json({
        removed: video_ids.length,
        folder_id,
        videos_deleted: delete_videos_too,
      });
    },
  );
}

/**
 * Chapter tools.
 *
 * Chapters put a clickable table of contents on the player scrubber. On a long
 * recording they are the difference between a video someone scrubs blindly and
 * one they can navigate, which is why they are worth automating from a
 * transcript rather than clicking in one at a time.
 *
 * A note on how these were verified. The published 3.4 OpenAPI mirror has no
 * chapter paths at all, so it cannot be the source of truth here. A live call
 * to `GET /videos/{id}/chapters` returns a normal paged collection of
 * `{ uri, title, timecode, thumbnails }`, so the resource is real and the write
 * verbs follow Vimeo's documented chapter shape. If a write starts failing,
 * check the live API before trusting the mirror.
 */

import { z } from "zod";
import { annotationsFor } from "../safety.js";
import { idFromUri, humanDuration, normalizeVideoId } from "../format/videos.js";
import { json, type ToolContext } from "./types.js";

type RawChapter = { uri?: string; title?: string; timecode?: number };

function slimChapter(raw: RawChapter): Record<string, unknown> {
  return {
    id: idFromUri(raw.uri),
    title: raw.title ?? "",
    timecode_seconds: raw.timecode,
    timecode: raw.timecode === undefined ? undefined : humanDuration(raw.timecode),
  };
}

export function registerChapterTools(ctx: ToolContext): void {
  const { server, client } = ctx;

  server.tool(
    "list_chapters",
    "List a video's chapters in timecode order. Chapters show as segments on the player scrubber.",
    { video_id: z.string().describe("Video id.") },
    annotationsFor("read"),
    async ({ video_id }) => {
      const id = normalizeVideoId(video_id);
      const result = await client.list(`/videos/${id}/chapters`, {
        params: { per_page: 100 },
        tool: "list_chapters",
      });
      return json({
        video_id: id,
        total: result.total,
        chapters: result.data.map((c) => slimChapter(c as never)),
      });
    },
  );

  server.tool(
    "add_chapter",
    "Add a chapter marker at a timecode. Vimeo rejects two chapters on the same second, so when generating a set from a transcript make sure the timecodes are distinct.",
    {
      video_id: z.string().describe("Video id."),
      timecode_seconds: z
        .number()
        .int()
        .min(0)
        .describe("Where the chapter starts, in whole seconds from the beginning."),
      title: z.string().min(1).describe("Chapter title as it appears on the player."),
    },
    annotationsFor("write"),
    async ({ video_id, timecode_seconds, title }) => {
      const id = normalizeVideoId(video_id);
      const raw = await client.request("POST", `/videos/${id}/chapters`, {
        body: { timecode: timecode_seconds, title },
        scope: "edit",
        tool: "add_chapter",
      });
      return json({ created: true, video_id: id, chapter: slimChapter(raw as never) });
    },
  );

  server.tool(
    "update_chapter",
    "Change a chapter's title or move it to a different timecode.",
    {
      video_id: z.string().describe("Video id."),
      chapter_id: z.string().describe("Chapter id, from list_chapters."),
      title: z.string().optional().describe("New title."),
      timecode_seconds: z.number().int().min(0).optional().describe("New timecode."),
    },
    annotationsFor("write", { idempotent: true }),
    async ({ video_id, chapter_id, title, timecode_seconds }) => {
      const id = normalizeVideoId(video_id);

      const body: Record<string, unknown> = {};
      if (title !== undefined) body.title = title;
      if (timecode_seconds !== undefined) body.timecode = timecode_seconds;
      if (Object.keys(body).length === 0) {
        return json({ error: "Nothing to update. Pass a title, a timecode, or both." });
      }

      const raw = await client.request("PATCH", `/videos/${id}/chapters/${chapter_id}`, {
        body,
        scope: "edit",
        tool: "update_chapter",
      });
      return json({ updated: true, video_id: id, chapter: slimChapter(raw as never) });
    },
  );

  server.tool(
    "delete_chapter",
    "Delete one chapter marker. The video is untouched. Requires confirm: true.",
    {
      video_id: z.string().describe("Video id."),
      chapter_id: z.string().describe("Chapter id."),
    },
    annotationsFor("destructive"),
    async ({ video_id, chapter_id }) => {
      const id = normalizeVideoId(video_id);
      await client.request("DELETE", `/videos/${id}/chapters/${chapter_id}`, {
        scope: "delete",
        tool: "delete_chapter",
      });
      return json({ deleted: true, video_id: id, chapter_id });
    },
  );
}

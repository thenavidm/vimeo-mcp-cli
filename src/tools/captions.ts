/**
 * Caption and transcript tools.
 *
 * `get_transcript` is the one people actually want, and it is a two-step call
 * that is easy to get wrong. `GET /videos/{id}/texttracks` returns metadata
 * with a `link` field, and that link points at the WebVTT file on a CDN. The
 * text itself is never in the API response. Fetching the link is a separate
 * request, and it is pre-signed and short-lived, so it cannot be cached or
 * handed to the user to open later.
 *
 * The VTT is then parsed down to plain text here, because a model asked to
 * summarize a talk does not need cue numbers and timestamps, and they roughly
 * double the token count.
 */

import { z } from "zod";
import { annotationsFor } from "../safety.js";
import { idFromUri, normalizeVideoId } from "../format/videos.js";
import { json, type ToolContext } from "./types.js";

type RawTrack = {
  uri?: string;
  active?: boolean;
  type?: string;
  language?: string;
  name?: string;
  link?: string;
  hls_link?: string;
};

function slimTrack(raw: RawTrack): Record<string, unknown> {
  return {
    id: idFromUri(raw.uri),
    name: raw.name,
    language: raw.language,
    type: raw.type,
    active: raw.active,
    has_link: Boolean(raw.link),
  };
}

/**
 * WebVTT to plain text.
 *
 * Drops the header, cue identifiers and timing lines, then collapses the
 * repeated lines that rolling captions produce. Keeps sentence order.
 */
export function vttToText(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const out: string[] = [];
  let previous = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === "WEBVTT" || trimmed.startsWith("NOTE ")) continue;
    // Timing line, e.g. "00:00:01.000 --> 00:00:04.000"
    if (trimmed.includes("-->")) continue;
    // A bare cue number.
    if (/^\d+$/.test(trimmed)) continue;

    const clean = trimmed.replace(/<[^>]+>/g, "");
    if (!clean || clean === previous) continue;
    out.push(clean);
    previous = clean;
  }

  return out.join(" ");
}

export function registerCaptionTools(ctx: ToolContext): void {
  const { server, client, config } = ctx;

  server.tool(
    "list_texttracks",
    "List the caption and subtitle tracks on a video, with their languages and which one is active.",
    { video_id: z.string().describe("Video id.") },
    annotationsFor("read"),
    async ({ video_id }) => {
      const id = normalizeVideoId(video_id);
      const result = await client.list(`/videos/${id}/texttracks`, {
        tool: "list_texttracks",
      });
      return json({
        video_id: id,
        total: result.total,
        tracks: result.data.map((t) => slimTrack(t as never)),
      });
    },
  );

  server.tool(
    "get_transcript",
    "Get a video's transcript as plain readable text. Picks the active track, or the language you name. Returns the words only, with cue numbers and timestamps stripped, which is what you want for summarizing or repurposing. Ask for format 'vtt' to keep the timings.",
    {
      video_id: z.string().describe("Video id."),
      language: z
        .string()
        .optional()
        .describe("Language code such as 'en' or 'en-US'. Omit to use the active track."),
      format: z
        .enum(["text", "vtt"])
        .default("text")
        .describe("'text' strips timings. 'vtt' returns the raw WebVTT."),
    },
    annotationsFor("read"),
    async ({ video_id, language, format }) => {
      const id = normalizeVideoId(video_id);
      const result = await client.list<RawTrack>(`/videos/${id}/texttracks`, {
        tool: "get_transcript",
      });
      const tracks = result.data;

      if (tracks.length === 0) {
        return json({
          video_id: id,
          transcript: null,
          note: "This video has no caption tracks. Vimeo generates them automatically on paid plans once transcoding finishes, so a very recent upload may simply not have one yet.",
        });
      }

      const chosen =
        (language
          ? tracks.find((t) => t.language?.toLowerCase().startsWith(language.toLowerCase()))
          : undefined) ??
        tracks.find((t) => t.active) ??
        tracks[0];

      if (!chosen?.link) {
        return json({
          video_id: id,
          transcript: null,
          available_languages: tracks.map((t) => t.language).filter(Boolean),
          note: language
            ? `No track matched language "${language}".`
            : "The track carries no download link, so its text cannot be read.",
        });
      }

      // The link is a pre-signed CDN URL, not an API endpoint, so it is fetched
      // directly rather than through the client's auth headers.
      const response = await fetch(chosen.link, {
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });
      if (!response.ok) {
        return json({
          video_id: id,
          transcript: null,
          note: `The caption file could not be fetched (${response.status}). These links are short-lived, so call this tool again for a fresh one.`,
        });
      }

      const vtt = await response.text();
      const text = format === "vtt" ? vtt : vttToText(vtt);

      return json({
        video_id: id,
        language: chosen.language,
        track: chosen.name,
        format,
        characters: text.length,
        transcript: text,
      });
    },
  );

  server.tool(
    "upload_texttrack",
    "Add a caption or subtitle track to a video from WebVTT content you supply. Needs the upload scope.",
    {
      video_id: z.string().describe("Video id."),
      language: z.string().describe("Language code, such as 'en' or 'en-US'."),
      name: z.string().describe("Track name shown in the player's caption menu."),
      vtt: z.string().min(1).describe("The full WebVTT file content, starting with WEBVTT."),
      type: z
        .enum(["captions", "subtitles"])
        .default("subtitles")
        .describe("Captions include sound cues for deaf viewers. Subtitles are dialogue only."),
      active: z.boolean().default(true).describe("Show this track by default."),
    },
    annotationsFor("write"),
    async ({ video_id, language, name, vtt, type, active }) => {
      const id = normalizeVideoId(video_id);

      // Two steps. Creating the track returns an upload_link, and the VTT body
      // is PUT to that link separately. Skipping the second step leaves an
      // empty track attached to the video and the first call still returns 201.
      const created = (await client.request("POST", `/videos/${id}/texttracks`, {
        body: { type, language, name, active },
        scope: "upload",
        tool: "upload_texttrack",
      })) as { uri?: string; link?: string; upload_link?: string };

      const target = created.upload_link ?? created.link;
      if (!target) {
        return json({
          created: false,
          error:
            "Vimeo created the track but returned no upload link, so the caption text was not stored. Delete the empty track with delete_texttrack and try again.",
          track: slimTrack(created as never),
        });
      }

      const put = await fetch(target, {
        method: "PUT",
        body: vtt,
        headers: { "Content-Type": "text/vtt" },
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });
      if (!put.ok) {
        return json({
          created: false,
          error: `The track was created but the caption text failed to upload (${put.status}).`,
          track_id: idFromUri(created.uri),
        });
      }

      return json({ created: true, video_id: id, track: slimTrack(created as never) });
    },
  );

  server.tool(
    "update_texttrack",
    "Rename a caption track, change its language, or make it the active one.",
    {
      video_id: z.string().describe("Video id."),
      track_id: z.string().describe("Track id, from list_texttracks."),
      name: z.string().optional(),
      language: z.string().optional(),
      active: z.boolean().optional().describe("Make this the default track."),
    },
    annotationsFor("write", { idempotent: true }),
    async ({ video_id, track_id, name, language, active }) => {
      const id = normalizeVideoId(video_id);

      const body: Record<string, unknown> = {};
      if (name !== undefined) body.name = name;
      if (language !== undefined) body.language = language;
      if (active !== undefined) body.active = active;
      if (Object.keys(body).length === 0) {
        return json({ error: "Nothing to update. Pass at least one field." });
      }

      const raw = await client.request("PATCH", `/videos/${id}/texttracks/${track_id}`, {
        body,
        scope: "edit",
        tool: "update_texttrack",
      });
      return json({ updated: true, track: slimTrack(raw as never) });
    },
  );

  server.tool(
    "delete_texttrack",
    "Delete a caption track from a video. Requires confirm: true.",
    {
      video_id: z.string().describe("Video id."),
      track_id: z.string().describe("Track id."),
    },
    annotationsFor("destructive"),
    async ({ video_id, track_id }) => {
      const id = normalizeVideoId(video_id);
      await client.request("DELETE", `/videos/${id}/texttracks/${track_id}`, {
        scope: "delete",
        tool: "delete_texttrack",
      });
      return json({ deleted: true, video_id: id, track_id });
    },
  );
}

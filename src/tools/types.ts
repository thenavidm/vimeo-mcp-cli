import type { z } from "zod";
import type { VimeoClient } from "../api/client.js";
import type { Config } from "../config.js";

/** A tool's answer: its JSON, as the text a client reads. */
export type JsonResult = { content: Array<{ type: "text"; text: string }> };

/**
 * What each tool module registers its tools with. It has the shape of the MCP
 * SDK's `server.tool()`, which these modules were written against;
 * tools/kit.ts records each call and turns it into a Slipway tool.
 */
export type ToolRegistrar = {
  tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    annotations: Record<string, boolean>,
    handler: (args: z.infer<z.ZodObject<S>>) => Promise<JsonResult>,
  ): void;
};

export type ToolContext = {
  server: ToolRegistrar;
  client: VimeoClient;
  config: Config;
};

/** Standard JSON tool result. */
export function json(data: unknown): JsonResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/**
 * Narrow field lists.
 *
 * Vimeo expands nested objects in full unless asked otherwise, so requesting
 * `parent_folder` alone returns the folder, its owner, that owner's avatar in
 * nine sizes and their upload quota. Roughly two kilobytes for a folder name.
 * Always name the leaf.
 */
export const VIDEO_FIELDS =
  "uri,name,duration,created_time,modified_time,link,privacy.view,privacy.embed,privacy.download,stats.plays,status,tags.tag,parent_folder.uri,parent_folder.name";

export const VIDEO_FIELDS_FULL = `${VIDEO_FIELDS},description,player_embed_url,pictures.base_link,release_time`;

export const FOLDER_FIELDS =
  "uri,name,created_time,modified_time,privacy.view,metadata.connections.videos.total";

export const SHOWCASE_FIELDS =
  "uri,name,description,created_time,privacy.view,link,duration,metadata.connections.videos.total";

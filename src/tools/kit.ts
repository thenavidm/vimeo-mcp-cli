/**
 * The Vimeo tools as Slipway tools.
 *
 * Each tool module registers its tools the way it did on the MCP SDK,
 * `server.tool(name, description, shape, annotations, handler)`. Here that
 * call is recorded rather than served. The record carries what Slipway needs
 * to build the MCP tool and the CLI command, and the handler runs against the
 * client Slipway built for the call. Write safety is Slipway's guard, from the
 * risk each tool declares, so no handler checks it.
 */

import {
  ApiError,
  AuthError,
  NotConfiguredError,
  SlipwayError,
  TimeoutError,
  httpError,
  toolkit,
  z,
  type Risk,
  type Tool,
} from "@thenavidm/slipway";
import type { ZodRawShape } from "zod";
import type { VimeoClient } from "../api/client.js";
import { MissingScopeError, MissingTokenError, VimeoError, VimeoUnreachableError } from "../api/errors.js";
import type { Config } from "../config.js";
import { humanDuration, normalizeVideoId } from "../format/videos.js";
import type { JsonResult, ToolContext, ToolRegistrar } from "./types.js";

/** What Slipway builds once per environment, and every handler receives. */
export type AppContext = { config: Config; client: VimeoClient };

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<JsonResult>;
type Registration = {
  name: string;
  description: string;
  shape: ZodRawShape;
  annotations: Record<string, boolean>;
  handler: Handler;
};
type Register = (ctx: ToolContext) => void;

/** Every tool the modules register, with handlers that use this client and config. */
function record(register: Register, client: VimeoClient, config: Config): Registration[] {
  const recorded: Registration[] = [];
  const server: ToolRegistrar = {
    tool: (name, description, shape, annotations, handler) => {
      recorded.push({ name, description, shape, annotations, handler: handler as unknown as Handler });
    },
  };
  register({ server, client, config });
  return recorded;
}

/**
 * A Vimeo failure as the Slipway error that carries its exit code. The status
 * picks it, as it did in 1.x through the words of each message: a missing
 * token is 10, a scope the token lacks is 4, and Vimeo out of reach is 5.
 */
export function toSlipway(error: unknown): unknown {
  if (error instanceof SlipwayError) return error;
  if (error instanceof VimeoError) {
    return httpError(error.status, error.message, {
      status: error.status,
      ...(error.code !== undefined ? { details: { error_code: error.code } } : {}),
    });
  }
  if (error instanceof MissingTokenError) return new NotConfiguredError(error.message);
  if (error instanceof MissingScopeError) return new AuthError(error.message, { details: { scope: error.scope } });
  if (error instanceof VimeoUnreachableError) return error.timedOut ? new TimeoutError(error.message) : new ApiError(error.message);
  return error;
}

/** A tool's answer as data, so Slipway can select fields and print it for a terminal. */
function unwrap(result: JsonResult): unknown {
  return JSON.parse(result.content[0]?.text ?? "null");
}

/**
 * A title for the command list and `which`: the description's first clause,
 * "List videos in your Vimeo library", when that is short, and the name in
 * words otherwise. 1.x had no titles, so clients showed the name.
 */
export function shortTitle(name: string, description: string): string {
  const clause = description.split(/[.:;](?:\s|$)|\n/)[0]!.trim();
  if (clause && clause.length <= 60) return clause;
  const words = name.split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const video = (args: Args): string => normalizeVideoId(String(args.video_id ?? ""));
const count = (args: Args): number => (Array.isArray(args.video_ids) ? args.video_ids.length : 0);

/** What each write is about to do, in 1.x's words, for the audit log and a refusal. */
const SUMMARIES: Record<string, (args: Args) => string> = {
  update_video: (a) => `update video ${video(a)}`,
  delete_video: (a) => `permanently delete video ${video(a)}`,
  upload_video: (a) => `upload a video from ${String(a.url)}`,
  set_video_thumbnail: (a) => `set thumbnail on video ${video(a)}`,
  create_folder: (a) => `create folder "${String(a.name)}"`,
  update_folder: (a) => `rename folder ${String(a.folder_id)} to "${String(a.name)}"`,
  delete_folder: (a) =>
    a.delete_videos_too
      ? `delete folder ${String(a.folder_id)} AND permanently delete every video inside it`
      : `delete folder ${String(a.folder_id)}, keeping its videos`,
  add_videos_to_folder: (a) => `move ${count(a)} video(s) into folder ${String(a.folder_id)}`,
  remove_videos_from_folder: (a) =>
    a.delete_videos_too
      ? `permanently delete ${count(a)} video(s) from folder ${String(a.folder_id)}`
      : `unfile ${count(a)} video(s) from folder ${String(a.folder_id)}`,
  create_showcase: (a) => `create showcase "${String(a.name)}"`,
  update_showcase: (a) => `update showcase ${String(a.showcase_id)}`,
  delete_showcase: (a) => `delete showcase ${String(a.showcase_id)}, keeping its videos`,
  add_video_to_showcase: (a) => `add video ${video(a)} to showcase ${String(a.showcase_id)}`,
  remove_video_from_showcase: (a) => `remove video ${video(a)} from showcase ${String(a.showcase_id)}`,
  add_chapter: (a) => `add chapter "${String(a.title)}" at ${humanDuration(Number(a.timecode_seconds))} on video ${video(a)}`,
  update_chapter: (a) => `update chapter ${String(a.chapter_id)} on video ${video(a)}`,
  delete_chapter: (a) => `delete chapter ${String(a.chapter_id)} on video ${video(a)}`,
  upload_texttrack: (a) => `add a ${String(a.language)} ${String(a.type)} track to video ${video(a)}`,
  update_texttrack: (a) => `update caption track ${String(a.track_id)} on video ${video(a)}`,
  delete_texttrack: (a) => `delete caption track ${String(a.track_id)} on video ${video(a)}`,
  add_comment: (a) => `post a public comment on video ${video(a)}`,
  edit_comment: (a) => `edit comment ${String(a.comment_id)} on video ${video(a)}`,
  delete_comment: (a) => `delete comment ${String(a.comment_id)} on video ${video(a)}`,
  set_video_tags: (a) => `replace tags on video ${video(a)} with ${Array.isArray(a.tags) ? a.tags.length : 0} tag(s)`,
  allow_embed_domain: (a) => `allow ${String(a.domain)} to embed video ${video(a)}`,
  apply_embed_preset: (a) => `apply preset ${String(a.preset_id)} to video ${video(a)}`,
};

/**
 * What a confirmed call does, as its refusal and the approval form say it.
 * Every delete "cannot be undone", 1.x's words. A comment can be deleted
 * afterwards, so its refusal says what it does instead.
 */
const CONSEQUENCES: Record<string, string> = {
  add_comment: "posts publicly under your account",
};

function riskOf(annotations: Record<string, boolean>): Risk {
  return annotations.readOnlyHint ? "read" : annotations.destructiveHint ? "destructive" : "write";
}

const kit = toolkit<AppContext>();

/**
 * The tools, as Slipway serves them. Handlers are recorded once per client,
 * the first time a call needs them, so each runs against the client and
 * config of the environment Slipway built.
 */
export function slipwayTools(register: Register): Tool<AppContext>[] {
  const bound = new WeakMap<VimeoClient, Map<string, Handler>>();
  const handlerFor = (ctx: AppContext, name: string): Handler => {
    let handlers = bound.get(ctx.client);
    if (!handlers) {
      handlers = new Map(record(register, ctx.client, ctx.config).map((r) => [r.name, r.handler]));
      bound.set(ctx.client, handlers);
    }
    return handlers.get(name)!;
  };

  // The shapes and annotations do not depend on the client, so one pass with none builds the list.
  return record(register, undefined as never, undefined as never).map((tool) => {
    const declared = riskOf(tool.annotations);
    // Unfiling is a write; with delete_videos_too it destroys the videos, so that call is destructive.
    const unfiles = tool.name === "remove_videos_from_folder";
    const risk: Risk = unfiles ? "destructive" : declared;
    const summary = SUMMARIES[tool.name];
    return kit.defineTool({
      name: tool.name,
      title: shortTitle(tool.name, tool.description),
      description: tool.description,
      input: z.object(tool.shape),
      risk,
      idempotent: tool.annotations.idempotentHint ?? risk === "read",
      ...(unfiles ? { riskFor: (args: Args) => (args.delete_videos_too ? "destructive" : "write") as Risk } : {}),
      ...(risk === "destructive" ? { consequence: CONSEQUENCES[tool.name] ?? "cannot be undone" } : {}),
      ...(summary ? { summary: (args: Args) => summary(args) } : {}),
      handler: async (args, ctx) => {
        try {
          return unwrap(await handlerFor(ctx, tool.name)(args as Args));
        } catch (error) {
          throw toSlipway(error);
        }
      },
    });
  });
}

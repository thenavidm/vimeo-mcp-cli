/**
 * How much a tool can change on Vimeo.
 *
 * The hazard on this platform is narrower than on a social network but sharper.
 * Deleting a video removes the source file and every embed of it across every
 * site that has one, and Vimeo does not keep a copy to restore from. A deleted
 * showcase takes its ordering and its custom branding with it.
 *
 * Everything else here is cheap to undo. Moving videos between folders, adding
 * a video to a showcase, editing a title, retagging: all one call back.
 *
 * So confirmation sits on the deletes and nowhere else. Putting it on a bulk
 * folder move would be worse than useless, because that tool exists to be
 * called in a loop and the model would learn to confirm without reading.
 * Slipway's guard enforces it, from the risk each tool declares here.
 */

export type Risk =
  /** Reads your data, or public data. */
  | "read"
  /** Changes something that one more call puts back. */
  | "write"
  /** Cannot be undone. */
  | "destructive";

/**
 * MCP annotations for a risk level.
 *
 * Clients use these to decide what to auto-approve, so they have to be honest.
 * `openWorldHint` is true throughout because every call leaves the machine.
 */
export function annotationsFor(
  risk: Risk,
  options: { idempotent?: boolean } = {},
): Record<string, boolean> {
  return {
    readOnlyHint: risk === "read",
    destructiveHint: risk === "destructive",
    idempotentHint: options.idempotent ?? risk === "read",
    openWorldHint: true,
  };
}

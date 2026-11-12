/**
 * How the feed moves on by itself (design.md, "Recomendaciones de la demo"): a video
 * advances when it ends, a still after a few seconds; touching the feed holds it for a
 * while, after which it runs again; the diner's pause stops it until they press play.
 * Pure: the screen arms the timer this says and reports what happened.
 */
export type FeedPlayback = "running" | "held" | "paused";

/** What the active scene shows: a video ends on its own, a still needs a timer. */
export type SceneKind = "video" | "still";

export interface FeedTimings {
  /** How long a still stays before the feed moves on (design: 5 s). */
  stillMs: number;
  /** How long a touch holds the feed (design: 10 s). */
  holdMs: number;
}

export type FeedEvent =
  /** A new scene became the active one, by a swipe or by advancing. */
  | "entered"
  /** The video ended or the still's time ran out. */
  | "finished"
  /** The diner touched the scene. */
  | "touched"
  /** The hold after a touch ran out. */
  | "holdElapsed"
  | "pausePressed"
  | "playPressed";

export interface FeedTransition {
  playback: FeedPlayback;
  /** Move on to the next scene now: an automatic exit, as measurement will record it. */
  advance: boolean;
}

export function nextPlayback(
  playback: FeedPlayback,
  event: FeedEvent,
): FeedTransition {
  switch (event) {
    case "entered":
      return { playback: "running", advance: false };
    case "finished":
      return { playback, advance: playback === "running" };
    case "touched":
      return {
        playback: playback === "paused" ? "paused" : "held",
        advance: false,
      };
    case "holdElapsed":
      return {
        playback: playback === "held" ? "running" : playback,
        advance: false,
      };
    case "pausePressed":
      return { playback: "paused", advance: false };
    case "playPressed":
      return { playback: "running", advance: false };
  }
}

/** The timer the screen arms for a state, or none: a running video waits for its end. */
export type FeedTimer =
  | { event: "finished"; ms: number }
  | { event: "holdElapsed"; ms: number }
  | null;

export function feedTimer(
  playback: FeedPlayback,
  scene: SceneKind,
  timings: FeedTimings,
): FeedTimer {
  if (playback === "held") return { event: "holdElapsed", ms: timings.holdMs };
  if (playback === "running" && scene === "still")
    return { event: "finished", ms: timings.stillMs };
  return null;
}

/**
 * The scene after this one. Past the last it starts over: the feed never runs out
 * (design: "si se acaba, se repite").
 */
export const nextSceneIndex = (index: number, count: number): number =>
  count === 0 ? 0 : (index + 1) % count;

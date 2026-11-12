import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  feedTimer,
  nextPlayback,
  nextSceneIndex,
  type FeedEvent,
  type FeedPlayback,
} from "./feed-playback.ts";

const TIMINGS = { stillMs: 5000, holdMs: 10_000 };

/** Plays a sequence of events from a state, collecting the advances. */
function play(start: FeedPlayback, events: FeedEvent[]) {
  let playback = start;
  let advances = 0;
  for (const event of events) {
    const step = nextPlayback(playback, event);
    playback = step.playback;
    if (step.advance) advances += 1;
  }
  return { playback, advances };
}

describe("the feed's playback", () => {
  it("advances when a running scene finishes", () => {
    assert.deepEqual(nextPlayback("running", "finished"), {
      playback: "running",
      advance: true,
    });
  });

  it("never advances while held or paused", () => {
    assert.equal(nextPlayback("held", "finished").advance, false);
    assert.equal(nextPlayback("paused", "finished").advance, false);
  });

  it("holds on a touch and runs again when the hold elapses", () => {
    assert.deepEqual(play("running", ["touched", "finished", "holdElapsed"]), {
      playback: "running",
      advances: 0,
    });
    assert.deepEqual(play("running", ["touched", "holdElapsed", "finished"]), {
      playback: "running",
      advances: 1,
    });
  });

  it("keeps the diner's pause through touches and holds, until play", () => {
    assert.deepEqual(
      play("running", ["pausePressed", "touched", "holdElapsed", "finished"]),
      {
        playback: "paused",
        advances: 0,
      },
    );
    assert.deepEqual(play("paused", ["playPressed", "finished"]), {
      playback: "running",
      advances: 1,
    });
  });

  it("starts every new scene running, whatever the last one was doing", () => {
    for (const state of ["running", "held", "paused"] as const) {
      assert.deepEqual(nextPlayback(state, "entered"), {
        playback: "running",
        advance: false,
      });
    }
  });
});

describe("feedTimer", () => {
  it("times a running still, and lets a running video end by itself", () => {
    assert.deepEqual(feedTimer("running", "still", TIMINGS), {
      event: "finished",
      ms: 5000,
    });
    assert.equal(feedTimer("running", "video", TIMINGS), null);
  });

  it("times the hold after a touch, for stills and videos alike", () => {
    assert.deepEqual(feedTimer("held", "still", TIMINGS), {
      event: "holdElapsed",
      ms: 10_000,
    });
    assert.deepEqual(feedTimer("held", "video", TIMINGS), {
      event: "holdElapsed",
      ms: 10_000,
    });
  });

  it("arms nothing while paused", () => {
    assert.equal(feedTimer("paused", "still", TIMINGS), null);
    assert.equal(feedTimer("paused", "video", TIMINGS), null);
  });
});

describe("nextSceneIndex", () => {
  it("moves on and starts over past the last scene", () => {
    assert.equal(nextSceneIndex(0, 3), 1);
    assert.equal(nextSceneIndex(2, 3), 0);
    assert.equal(nextSceneIndex(0, 1), 0);
    assert.equal(nextSceneIndex(0, 0), 0);
  });
});

import { describe, expect, it } from "vitest";
import type { CultivationPresentationKind } from "../assets/scripts/core/CultivationPresentation";
import {
  audioCueForPresentation,
  audioResourceBasename,
  AUDIO_CUE_FILES,
  AUDIO_MUSIC_FILE,
  AUDIO_PREFERENCE_DEFAULT,
  getAudioToggleControls,
  MUSIC_VOLUME,
  normalizeAudioPreference,
  SFX_VOLUME,
  toggleAudioChannel,
  type AudioCue,
} from "../assets/scripts/core/AppAudioConfig";

/**
 * Written as a `satisfies` map so adding a fourth presentation moment fails this
 * file's typecheck rather than silently firing the 战力 cue for it.
 */
const CUE_BY_KIND = {
  breakthrough: "breakthrough",
  level_up: "levelUp",
  power_change: "powerUp",
} satisfies Record<CultivationPresentationKind, AudioCue>;

describe("audio resource names", () => {
  it("keys a clip by its own file name, whatever container it arrived in", () => {
    expect(audioResourceBasename("audio/sfx/Tap.MP3")).toBe("tap");
    expect(audioResourceBasename("Audio\\Music\\Main.ogg")).toBe("main");
    expect(audioResourceBasename("audio/sfx/level-up.wav")).toBe("level-up");
    expect(audioResourceBasename("breakthrough")).toBe("breakthrough");
  });

  it("leaves an image extension in place, so a png cannot claim a cue", () => {
    expect(audioResourceBasename("audio/sfx/tap.png")).toBe("tap.png");
  });
});

describe("audio cue mapping", () => {
  it("fires the cue that matches the overlay a player sees", () => {
    for (const rawKind in CUE_BY_KIND) {
      const kind = rawKind as CultivationPresentationKind;
      expect(audioCueForPresentation(kind)).toBe(CUE_BY_KIND[kind]);
    }
  });

  it("names one file per cue, so no two moments share a sound", () => {
    const files = Object.values(AUDIO_CUE_FILES);
    expect(files).toHaveLength(4);
    expect(new Set(files).size).toBe(files.length);
    for (const file of files) expect(file).toMatch(/^[a-z][a-z-]*[a-z]$/);
    // The loop lives in its own directory but must not collide there either.
    expect(files).not.toContain(AUDIO_MUSIC_FILE);
  });
});

describe("audio mix", () => {
  it("keeps the loop under the cue that fires on top of it", () => {
    expect(MUSIC_VOLUME).toBeGreaterThan(0);
    expect(SFX_VOLUME).toBeLessThanOrEqual(1);
    expect(MUSIC_VOLUME).toBeLessThan(SFX_VOLUME);
  });
});

describe("audio preference", () => {
  it("starts with both channels on", () => {
    expect(AUDIO_PREFERENCE_DEFAULT).toEqual({ music: true, sfx: true });
  });

  it("falls back to the default for anything that is not a record", () => {
    for (const raw of [null, undefined, "muted", 0, [], true]) {
      expect(normalizeAudioPreference(raw)).toEqual(AUDIO_PREFERENCE_DEFAULT);
    }
  });

  it("keeps the half a player set when the record is half corrupt", () => {
    expect(normalizeAudioPreference({ music: false, sfx: "yes" })).toEqual({
      music: false,
      sfx: true,
    });
    expect(normalizeAudioPreference({ sfx: false })).toEqual({
      music: true,
      sfx: false,
    });
    expect(normalizeAudioPreference({ music: false, extra: 1 })).toEqual({
      music: false,
      sfx: true,
    });
  });

  it("round-trips through the JSON storage does to it", () => {
    const stored = { music: false, sfx: true };
    expect(
      normalizeAudioPreference(JSON.parse(JSON.stringify(stored)) as unknown),
    ).toEqual(stored);
  });

  it("flips one channel and leaves the other alone", () => {
    const muted = toggleAudioChannel(AUDIO_PREFERENCE_DEFAULT, "music");
    expect(muted).toEqual({ music: false, sfx: true });
    expect(toggleAudioChannel(muted, "sfx")).toEqual({
      music: false,
      sfx: false,
    });
    expect(toggleAudioChannel(muted, "music")).toEqual(AUDIO_PREFERENCE_DEFAULT);
  });

  it("never mutates the preference it was handed", () => {
    toggleAudioChannel(AUDIO_PREFERENCE_DEFAULT, "music");
    expect(AUDIO_PREFERENCE_DEFAULT.music).toBe(true);
    expect(Object.isFrozen(normalizeAudioPreference({ music: false }))).toBe(
      true,
    );
  });

  it("draws the two switches in a fixed order", () => {
    const controls = getAudioToggleControls({ music: true, sfx: false });
    expect(controls.map((control) => control.channel)).toEqual([
      "music",
      "sfx",
    ]);
    expect(controls.map((control) => control.label)).toEqual(["音乐", "音效"]);
    expect(controls.map((control) => control.active)).toEqual([true, false]);
  });
});

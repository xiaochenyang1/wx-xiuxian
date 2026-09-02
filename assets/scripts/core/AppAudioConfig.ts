import type { CultivationPresentationKind } from "./CultivationPresentation";

/**
 * The two things a player mutes separately. Music is the one loop that plays
 * behind everything; sfx is every one-shot the interface fires. They are kept
 * apart because the loop is the part people turn off on a commute while still
 * wanting the tap to answer them.
 */
export type AudioChannel = "music" | "sfx";

export interface AudioPreference {
  readonly music: boolean;
  readonly sfx: boolean;
}

/** Both channels start on: a silent build is indistinguishable from a broken one. */
export const AUDIO_PREFERENCE_DEFAULT: AudioPreference = Object.freeze({
  music: true,
  sfx: true,
});

/**
 * Audio is a device preference, not character progress, so it lives beside the
 * save rather than inside it — a player muting the phone should not have that
 * choice travel through a backup code into someone else's session.
 */
export const AUDIO_PREFERENCE_STORAGE_KEY = "cultivation-diary:audio-preference";

/**
 * One cue per moment the interface already marks with something visible. Each
 * name is also the file an artist delivers, so a cue can be traced from the
 * moment it fires to the file on disk without a lookup table in between.
 */
export type AudioCue = "breakthrough" | "levelUp" | "powerUp" | "tap";

export const AUDIO_CUE_FILES: Readonly<Record<AudioCue, string>> = {
  breakthrough: "breakthrough",
  levelUp: "level-up",
  powerUp: "power-up",
  tap: "tap",
};

/** The single looping track. Named for the directory it sits alone in. */
export const AUDIO_MUSIC_FILE = "main";

export const SFX_RESOURCE_DIR = "audio/sfx";
export const MUSIC_RESOURCE_DIR = "audio/music";

/**
 * The trailing path segment of a clip's resource name, without its extension —
 * the art side has its own copy of this because the two families accept
 * different containers, and one regex that took both would let a `.png` claim a
 * cue. Subdirectories are allowed: only the file's own name identifies it.
 */
export function audioResourceBasename(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/\.(?:mp3|ogg|wav|m4a|aac)$/, "");
  const separator = normalized.lastIndexOf("/");
  return separator < 0 ? normalized : normalized.slice(separator + 1);
}

/**
 * Mixed well under the ceiling: the loop has to sit behind a cue that fires on
 * top of it, and a phone speaker at full scale on both would clip. These are the
 * numbers `docs/audio-asset-guide.md` asks the files to be mastered against.
 */
export const MUSIC_VOLUME = 0.34;
export const SFX_VOLUME = 0.7;

/**
 * The presentation layer already ranks its three moments, and `strongerKind`
 * collapses a burst of them into the loudest one. Reusing that ranking means the
 * cue a player hears always matches the overlay they see, including the merged
 * case where two settlements land in one frame.
 */
export function audioCueForPresentation(
  kind: CultivationPresentationKind,
): AudioCue {
  if (kind === "breakthrough") return "breakthrough";
  if (kind === "level_up") return "levelUp";
  return "powerUp";
}

/**
 * Reads back whatever storage holds. Anything that is not the shape we wrote is
 * replaced field by field rather than wholesale, so a half-corrupt record still
 * yields the half a player set.
 */
export function normalizeAudioPreference(raw: unknown): AudioPreference {
  if (typeof raw !== "object" || raw === null) return AUDIO_PREFERENCE_DEFAULT;
  const candidate = raw as Partial<Record<AudioChannel, unknown>>;
  return Object.freeze({
    music:
      typeof candidate.music === "boolean"
        ? candidate.music
        : AUDIO_PREFERENCE_DEFAULT.music,
    sfx:
      typeof candidate.sfx === "boolean"
        ? candidate.sfx
        : AUDIO_PREFERENCE_DEFAULT.sfx,
  });
}

export function toggleAudioChannel(
  preference: AudioPreference,
  channel: AudioChannel,
): AudioPreference {
  return Object.freeze({
    music: channel === "music" ? !preference.music : preference.music,
    sfx: channel === "sfx" ? !preference.sfx : preference.sfx,
  });
}

export interface AudioToggleControl {
  readonly channel: AudioChannel;
  readonly label: string;
  readonly active: boolean;
}

/**
 * The two switches the 档案 panel draws, in a fixed order so the pair never
 * swaps places between renders.
 */
export function getAudioToggleControls(
  preference: AudioPreference,
): readonly AudioToggleControl[] {
  return [
    { channel: "music", label: "音乐", active: preference.music },
    { channel: "sfx", label: "音效", active: preference.sfx },
  ];
}

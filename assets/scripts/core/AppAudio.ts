import { AudioClip, AudioSource, Node, resources } from "cc";
import type { PlatformAdapter } from "../platform/PlatformAdapter";
import {
  audioResourceBasename,
  AUDIO_CUE_FILES,
  AUDIO_MUSIC_FILE,
  AUDIO_PREFERENCE_DEFAULT,
  AUDIO_PREFERENCE_STORAGE_KEY,
  MUSIC_RESOURCE_DIR,
  MUSIC_VOLUME,
  normalizeAudioPreference,
  SFX_RESOURCE_DIR,
  SFX_VOLUME,
  toggleAudioChannel,
  type AudioChannel,
  type AudioCue,
  type AudioPreference,
} from "./AppAudioConfig";

/**
 * The audio half of the presentation layer, shaped like `AppArt`: a directory is
 * loaded once, a missing file is not an error, and every play call is safe to
 * make before — or without ever — that file arriving. So the cues can be dropped
 * in one at a time, and a build with an empty `audio/` sounds exactly like the
 * silent build that shipped before this module existed.
 */

let audioRoot: Node | null = null;
let musicSource: AudioSource | null = null;
let sfxSource: AudioSource | null = null;
let storage: PlatformAdapter | null = null;
let preference: AudioPreference = AUDIO_PREFERENCE_DEFAULT;
let cues: Partial<Record<AudioCue, AudioClip>> = {};
let musicClip: AudioClip | null = null;
let musicWanted = false;
let musicSuspended = false;

export function initializeAudio(host: Node, platform: PlatformAdapter): void {
  if (audioRoot) return;
  storage = platform;
  preference = normalizeAudioPreference(
    platform.load(AUDIO_PREFERENCE_STORAGE_KEY),
  );

  const root = new Node("AppAudio");
  root.layer = host.layer;
  host.addChild(root);
  audioRoot = root;
  musicSource = root.addComponent(AudioSource);
  musicSource.loop = true;
  musicSource.volume = MUSIC_VOLUME;

  // A second source, because one component owns one clip and the loop must keep
  // running underneath a cue rather than be replaced by it.
  const sfxNode = new Node("AppAudioSfx");
  sfxNode.layer = host.layer;
  root.addChild(sfxNode);
  sfxSource = sfxNode.addComponent(AudioSource);
  sfxSource.loop = false;
  sfxSource.volume = SFX_VOLUME;

  void loadAudioAssets();
}

export function getAudioPreference(): AudioPreference {
  return preference;
}

/**
 * Flips one channel, remembers it, and acts on it. Turning sfx back on answers
 * with the tap cue: without it the switch is silent in both positions and a
 * player cannot tell a working build from a fileless one.
 */
export function toggleAudio(channel: AudioChannel): AudioPreference {
  preference = toggleAudioChannel(preference, channel);
  storage?.save(AUDIO_PREFERENCE_STORAGE_KEY, preference);
  applyMusicState();
  if (channel === "sfx" && preference.sfx) playAudioCue("tap");
  return preference;
}

export function playAudioCue(cue: AudioCue): void {
  if (!preference.sfx) return;
  const clip = cues[cue];
  if (!clip || !sfxSource) return;
  sfxSource.playOneShot(clip, 1);
}

/** Called once the save is on screen, so the loop starts with a ready game. */
export function startAudioMusic(): void {
  musicWanted = true;
  applyMusicState();
}

/** The loop stops with the app; a cue fired on the way out is simply dropped. */
export function suspendAudioMusic(): void {
  musicSuspended = true;
  applyMusicState();
}

export function resumeAudioMusic(): void {
  musicSuspended = false;
  applyMusicState();
}

export function shutdownAudio(): void {
  if (musicSource?.playing) musicSource.stop();
  audioRoot?.removeFromParent();
  audioRoot?.destroy();
  audioRoot = null;
  musicSource = null;
  sfxSource = null;
  storage = null;
  cues = {};
  musicClip = null;
  musicWanted = false;
  musicSuspended = false;
}

function applyMusicState(): void {
  if (!musicSource) return;
  const shouldPlay =
    preference.music && musicWanted && !musicSuspended && musicClip !== null;
  if (!shouldPlay) {
    if (musicSource.playing) musicSource.stop();
    return;
  }
  if (musicSource.clip !== musicClip) {
    musicSource.clip = musicClip;
    musicSource.loop = true;
    musicSource.volume = MUSIC_VOLUME;
  }
  if (!musicSource.playing) musicSource.play();
}

function loadAudioAssets(): Promise<void> {
  return Promise.all([
    loadOptionalAudioClips(SFX_RESOURCE_DIR),
    loadOptionalAudioClips(MUSIC_RESOURCE_DIR),
  ]).then(([sfxClips, musicClips]) => {
    if (!audioRoot) return;
    cues = collectCues(sfxClips);
    musicClip = findAudioClip(musicClips, AUDIO_MUSIC_FILE) ?? null;
    applyMusicState();
  });
}

function collectCues(
  clips: readonly AudioClip[],
): Partial<Record<AudioCue, AudioClip>> {
  const loaded: Partial<Record<AudioCue, AudioClip>> = {};
  for (const rawCue in AUDIO_CUE_FILES) {
    const cue = rawCue as AudioCue;
    const clip = findAudioClip(clips, AUDIO_CUE_FILES[cue]);
    if (clip) loaded[cue] = clip;
  }
  return loaded;
}

function findAudioClip(
  clips: readonly AudioClip[],
  expectedName: string,
): AudioClip | undefined {
  return clips.find((clip) => audioResourceBasename(clip.name) === expectedName);
}

function loadOptionalAudioClips(
  resourceDir: string,
): Promise<readonly AudioClip[]> {
  return new Promise((resolve) => {
    resources.loadDir<AudioClip>(resourceDir, AudioClip, (error, clips) => {
      resolve(error ? [] : clips);
    });
  });
}

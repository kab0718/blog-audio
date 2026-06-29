import type { Article } from "../types/article";
import type { AudioTrack, AudioTrackSource } from "../types/audioTrack";
import type { NarrationScript } from "../types/narration";
import {
  generateLocalPreviewAudioResource,
  type GeneratedAudioResource,
} from "./localPreviewTtsAdapter";
import { generateRealTtsAudioResource } from "./realTtsAdapter";

export type TrackGenerationAdapter = (
  script: NarrationScript,
) => Promise<GeneratedAudioResource>;

export function createGeneratingAudioTrack(
  article: Article,
  narrationVersion: string | null = null,
  source: AudioTrackSource = getDefaultAudioTrackSource(),
): AudioTrack {
  return {
    id: buildAudioTrackId(article.id),
    articleId: article.id,
    status: "generating",
    playbackResource: null,
    durationSeconds: null,
    generatedAt: null,
    source,
    narrationVersion,
  };
}

export async function generateAudioTrack(
  article: Article,
  script: NarrationScript,
  adapter: TrackGenerationAdapter = getDefaultTrackGenerationAdapter(),
): Promise<AudioTrack> {
  const generatedAudio = await adapter(script);

  return {
    id: buildAudioTrackId(article.id),
    articleId: article.id,
    status: "ready",
    playbackResource: generatedAudio.playbackResource,
    durationSeconds: generatedAudio.durationSeconds,
    generatedAt: new Date().toISOString(),
    source: generatedAudio.source,
    narrationVersion: script.version,
  };
}

export function createFailedAudioTrack(
  article: Article,
  errorMessage: string,
  narrationVersion: string | null = null,
  source: AudioTrackSource = getDefaultAudioTrackSource(),
): AudioTrack {
  return {
    id: buildAudioTrackId(article.id),
    articleId: article.id,
    status: "failed",
    playbackResource: null,
    durationSeconds: null,
    generatedAt: null,
    source,
    narrationVersion,
    errorMessage,
  };
}

function buildAudioTrackId(articleId: string) {
  return `track:${articleId}`;
}

function getDefaultTrackGenerationAdapter(): TrackGenerationAdapter {
  return getDefaultAudioTrackSource() === "local-preview"
    ? generateLocalPreviewAudioResource
    : generateRealTtsAudioResource;
}

function getDefaultAudioTrackSource(): AudioTrackSource {
  return import.meta.env.VITE_TTS_PROVIDER === "local-preview"
    ? "local-preview"
    : "google-cloud-tts";
}

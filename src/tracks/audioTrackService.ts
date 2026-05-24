import type { Article } from "../types/article";
import type { AudioTrack } from "../types/audioTrack";
import type { NarrationScript } from "../types/narration";
import {
  generateLocalPreviewAudioResource,
  type GeneratedAudioResource,
} from "./localPreviewTtsAdapter";

export type TrackGenerationAdapter = (
  script: NarrationScript,
) => Promise<GeneratedAudioResource>;

export function createGeneratingAudioTrack(
  article: Article,
  narrationVersion: string | null = null,
): AudioTrack {
  return {
    id: buildAudioTrackId(article.id),
    articleId: article.id,
    status: "generating",
    playbackResource: null,
    durationSeconds: null,
    generatedAt: null,
    source: "local-preview",
    narrationVersion,
  };
}

export async function generateAudioTrack(
  article: Article,
  script: NarrationScript,
  adapter: TrackGenerationAdapter = generateLocalPreviewAudioResource,
): Promise<AudioTrack> {
  const generatedAudio = await adapter(script);

  return {
    id: buildAudioTrackId(article.id),
    articleId: article.id,
    status: "ready",
    playbackResource: generatedAudio.playbackResource,
    durationSeconds: generatedAudio.durationSeconds,
    generatedAt: new Date().toISOString(),
    source: "local-preview",
    narrationVersion: script.version,
  };
}

export function createFailedAudioTrack(
  article: Article,
  errorMessage: string,
  narrationVersion: string | null = null,
): AudioTrack {
  return {
    id: buildAudioTrackId(article.id),
    articleId: article.id,
    status: "failed",
    playbackResource: null,
    durationSeconds: null,
    generatedAt: null,
    source: "local-preview",
    narrationVersion,
    errorMessage,
  };
}

function buildAudioTrackId(articleId: string) {
  return `track:${articleId}`;
}

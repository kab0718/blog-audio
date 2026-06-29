export type AudioTrackStatus = "generating" | "ready" | "failed";

export type PlaybackResource = {
  kind: "url";
  url: string;
};

export type AudioTrackSource = "local-preview" | "google-cloud-tts";

export type AudioTrack = {
  id: string;
  articleId: string;
  status: AudioTrackStatus;
  playbackResource: PlaybackResource | null;
  durationSeconds: number | null;
  generatedAt: string | null;
  source: AudioTrackSource;
  narrationVersion: string | null;
  errorMessage?: string;
};

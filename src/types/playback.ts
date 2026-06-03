export type PlayerStatus = "idle" | "paused" | "playing";

export type PlaybackState = {
  currentQueueItemId: string | null;
  queueItemIds: string[];
  playerStatus: PlayerStatus;
  positionSeconds: number;
  durationSeconds: number | null;
  isSeeking: boolean;
  playbackError: string | null;
};

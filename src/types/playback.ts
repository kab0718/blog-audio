export type PlayerStatus = "idle" | "paused" | "playing";

export type PlaybackState = {
  currentQueueItemId: string | null;
  queueItemIds: string[];
  playerStatus: PlayerStatus;
  playbackRate: number;
  sleepTimerEndsAt: number | null;
  positionSeconds: number;
  durationSeconds: number | null;
  isSeeking: boolean;
  playbackError: string | null;
};

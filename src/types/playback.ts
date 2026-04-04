export type PlayerStatus = "idle" | "paused" | "playing";

export type PlaybackState = {
  currentQueueItemId: string | null;
  queueItemIds: string[];
  playerStatus: PlayerStatus;
};

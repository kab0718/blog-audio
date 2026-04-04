export type QueueState = "current" | "queued";

export type QueueItem = {
  id: string;
  articleId: string;
  order: number;
  queueState: QueueState;
};

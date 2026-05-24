import type { AudioTrack, AudioTrackStatus } from "../types/audioTrack";
import type { Article, SourceType } from "../types/article";
import type { PlayerStatus } from "../types/playback";
import type { QueueItem } from "../types/queue";

export type ArticleListItemViewModel = {
  id: string;
  indexLabel: string;
  title: string;
  summary?: string;
  sourceLabel: string;
  author: string;
  durationLabel: string;
  tags: string[];
  trackStatusLabel: string;
  trackStatusTone: AudioTrackStatus;
  isCurrent: boolean;
};

export type NowPlayingViewModel = {
  title: string;
  metaLine: string;
  audioTrackLabel: string;
  audioTrackCopy: string;
  playerStatusLabel: string;
  primaryActionLabel: string;
};

export type QueueListItemViewModel = {
  id: string;
  positionLabel: string;
  title: string;
  metaLine: string;
  badgeLabel: string;
};

export type MiniPlayerViewModel = {
  title: string;
  statusLine: string;
};

export function toArticleListItemViewModel(
  article: Article,
  track: AudioTrack | undefined,
  options: { index: number; isCurrent: boolean },
): ArticleListItemViewModel {
  return {
    id: article.id,
    indexLabel: String(options.index + 1).padStart(2, "0"),
    title: article.title,
    summary: article.summary,
    sourceLabel: getSourceLabel(article.sourceType),
    author: article.author,
    durationLabel: formatDurationLabel(article.estimatedDurationSeconds),
    tags: article.tags,
    trackStatusLabel: getAudioTrackLabel(track?.status ?? "generating"),
    trackStatusTone: track?.status ?? "generating",
    isCurrent: options.isCurrent,
  };
}

export function toNowPlayingViewModel(
  article: Article,
  track: AudioTrack | undefined,
  playerStatus: PlayerStatus,
): NowPlayingViewModel {
  return {
    title: article.title,
    metaLine: [
      getSourceLabel(article.sourceType),
      article.author,
      formatDurationLabel(article.estimatedDurationSeconds),
    ].join(" ・ "),
    audioTrackLabel: getAudioTrackLabel(track?.status ?? "generating"),
    audioTrackCopy: getAudioTrackCopy(track?.status ?? "generating"),
    playerStatusLabel: getPlayerStatusLabel(playerStatus),
    primaryActionLabel: playerStatus === "playing" ? "Pause" : "Play",
  };
}

export function toQueueListItemViewModel(
  article: Article,
  queueItem: QueueItem,
): QueueListItemViewModel {
  return {
    id: queueItem.id,
    positionLabel: String(queueItem.order).padStart(2, "0"),
    title: article.title,
    metaLine: [
      getSourceLabel(article.sourceType),
      article.author,
      formatDurationLabel(article.estimatedDurationSeconds),
    ].join(" ・ "),
    badgeLabel: queueItem.queueState === "current" ? "Now" : "Queued",
  };
}

export function toMiniPlayerViewModel(
  article: Article,
  track: AudioTrack | undefined,
  playerStatus: PlayerStatus,
): MiniPlayerViewModel {
  return {
    title: article.title,
    statusLine: [
      getSourceLabel(article.sourceType),
      getAudioTrackLabel(track?.status ?? "generating"),
      getPlayerStatusLabel(playerStatus),
    ].join(" ・ "),
  };
}

export function formatDurationLabel(durationSeconds: number) {
  return `${Math.max(1, Math.ceil(durationSeconds / 60))} min`;
}

export function getSourceLabel(sourceType: SourceType) {
  return sourceType === "zenn" ? "Zenn" : "Qiita";
}

export function getAudioTrackLabel(status: AudioTrackStatus) {
  switch (status) {
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    case "generating":
    default:
      return "Generating";
  }
}

function getAudioTrackCopy(status: AudioTrackStatus) {
  switch (status) {
    case "ready":
      return "音声トラックは再生可能な状態です。";
    case "failed":
      return "音声生成に失敗しており、再試行導線が必要です。";
    case "generating":
    default:
      return "音声を生成中で、完了前でも記事メタ情報は表示できます。";
  }
}

function getPlayerStatusLabel(status: PlayerStatus) {
  switch (status) {
    case "playing":
      return "Playing";
    case "paused":
      return "Paused";
    case "idle":
    default:
      return "Idle";
  }
}

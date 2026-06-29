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
  isQueued: boolean;
  queueStatusLabel: string;
};

export type NowPlayingViewModel = {
  title: string;
  metaLine: string;
  audioTrackLabel: string;
  audioTrackCopy: string;
  playbackResourceCopy: string;
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
  options: { index: number; isCurrent: boolean; isQueued: boolean },
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
    trackStatusLabel: track ? getAudioTrackLabel(track.status) : "未生成",
    trackStatusTone: track?.status ?? "generating",
    isCurrent: options.isCurrent,
    isQueued: options.isQueued,
    queueStatusLabel: getQueueStatusLabel(options.isCurrent, options.isQueued),
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
    audioTrackCopy: getAudioTrackCopy(track),
    playbackResourceCopy: getPlaybackResourceCopy(track),
    playerStatusLabel: getPlayerStatusLabel(playerStatus),
    primaryActionLabel: getPrimaryActionLabel(track, playerStatus),
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
    badgeLabel: queueItem.queueState === "current" ? "再生中" : "待機",
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
      return "再生準備完了";
    case "failed":
      return "生成失敗";
    case "generating":
    default:
      return "生成中";
  }
}

function getAudioTrackCopy(track: AudioTrack | undefined) {
  switch (track?.status ?? "generating") {
    case "ready":
      return "音声をすぐ再生できます。";
    case "failed":
      return track?.errorMessage ?? "音声生成に失敗しました。";
    case "generating":
    default:
      return "音声を準備しています。";
  }
}

function getPlaybackResourceCopy(track: AudioTrack | undefined) {
  if (track?.status !== "ready" || !track.playbackResource) {
    return "再生できる音声を準備しています。";
  }

  return track.playbackResource.kind === "url"
    ? "音声ファイルを読み込めます。"
    : "音声チャンクを読み込めます。";
}

function getPrimaryActionLabel(
  track: AudioTrack | undefined,
  playerStatus: PlayerStatus,
) {
  if (track?.status === "failed") {
    return "再試行";
  }

  if (track?.status !== "ready") {
    return "準備中";
  }

  return playerStatus === "playing" ? "一時停止" : "再生";
}

function getPlayerStatusLabel(status: PlayerStatus) {
  switch (status) {
    case "playing":
      return "再生中";
    case "paused":
      return "一時停止中";
    case "idle":
    default:
      return "待機中";
  }
}

function getQueueStatusLabel(isCurrent: boolean, isQueued: boolean) {
  if (isCurrent) {
    return "再生中";
  }

  return isQueued ? "キュー済み" : "未追加";
}

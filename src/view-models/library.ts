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
    trackStatusLabel: track ? getAudioTrackLabel(track.status) : "Pending",
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

function getAudioTrackCopy(track: AudioTrack | undefined) {
  switch (track?.status ?? "generating") {
    case "ready":
      return "生成済みトラックを再利用できます。";
    case "failed":
      return track?.errorMessage ?? "音声生成に失敗しました。";
    case "generating":
    default:
      return "音声トラックを生成中です。";
  }
}

function getPlaybackResourceCopy(track: AudioTrack | undefined) {
  if (track?.status !== "ready" || !track.playbackResource) {
    return "再生リソースは準備中です。";
  }

  return `PlaybackResource.kind = ${track.playbackResource.kind}`;
}

function getPrimaryActionLabel(
  track: AudioTrack | undefined,
  playerStatus: PlayerStatus,
) {
  if (track?.status === "failed") {
    return "Retry";
  }

  if (track?.status !== "ready") {
    return "Preparing";
  }

  return playerStatus === "playing" ? "Pause" : "Play";
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

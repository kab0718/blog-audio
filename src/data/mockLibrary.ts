import type { AudioTrack } from "../types/audioTrack";
import type { Article } from "../types/article";
import type { QueueItem, QueueState } from "../types/queue";

export const mockArticles: Article[] = [
  {
    id: "zenn:edge-streaming-patterns",
    sourceType: "zenn",
    sourceArticleId: "edge-streaming-patterns",
    title: "Edge で配信する API 設計のパターン整理",
    author: "kab",
    url: "https://zenn.dev/kab/articles/edge-streaming-patterns",
    estimatedDurationSeconds: 8 * 60,
    tags: ["Edge", "API", "設計"],
    summary:
      "エッジ実行環境で待ち時間を減らしながら、処理境界をどう切るかを整理した記事。",
  },
  {
    id: "qiita:react-state-audio",
    sourceType: "qiita",
    sourceArticleId: "react-state-audio",
    title: "音声プレーヤー UI における React 状態管理の落とし穴",
    author: "mori",
    url: "https://qiita.com/mori/items/react-state-audio",
    estimatedDurationSeconds: 6 * 60,
    tags: ["React", "State", "Audio"],
    summary:
      "再生状態、キュー、画面遷移が絡む時に破綻しやすい状態設計の注意点をまとめた記事。",
  },
  {
    id: "zenn:typescript-parser-notes",
    sourceType: "zenn",
    sourceArticleId: "typescript-parser-notes",
    title: "TypeScript で記事本文を段落ごとに整形するメモ",
    author: "sato",
    url: "https://zenn.dev/sato/articles/typescript-parser-notes",
    estimatedDurationSeconds: 5 * 60,
    tags: ["TypeScript", "Parser"],
    summary:
      "技術記事の本文からノイズを落として、読み上げしやすいテキストへ整形する流れを紹介。",
  },
];

export const mockAudioTracks: AudioTrack[] = [
  {
    id: "track:zenn:edge-streaming-patterns",
    articleId: "zenn:edge-streaming-patterns",
    status: "ready",
    playbackResource: {
      kind: "url",
      url: "/audio/zenn-edge-streaming-patterns.mp3",
    },
    durationSeconds: 8 * 60,
    generatedAt: "2026-04-04T07:30:00.000Z",
  },
  {
    id: "track:qiita:react-state-audio",
    articleId: "qiita:react-state-audio",
    status: "generating",
    playbackResource: null,
    durationSeconds: null,
    generatedAt: null,
  },
  {
    id: "track:zenn:typescript-parser-notes",
    articleId: "zenn:typescript-parser-notes",
    status: "failed",
    playbackResource: null,
    durationSeconds: null,
    generatedAt: null,
  },
];

export const initialQueueItemIds = mockArticles.map((article) => article.id);

export function getArticleById(articleId: string | null) {
  if (!articleId) {
    return undefined;
  }

  return mockArticles.find((article) => article.id === articleId);
}

export function getAudioTrackByArticleId(articleId: string | null) {
  if (!articleId) {
    return undefined;
  }

  return mockAudioTracks.find((track) => track.articleId === articleId);
}

export function buildQueueItems(
  queueItemIds: string[],
  currentQueueItemId: string | null,
): QueueItem[] {
  return queueItemIds.map((queueItemId, index) => {
    const queueState: QueueState =
      queueItemId === currentQueueItemId ? "current" : "queued";

    return {
      id: queueItemId,
      articleId: queueItemId,
      order: index + 1,
      queueState,
    };
  });
}

import type { Article } from "../types/article";

export const mockArticles: Article[] = [
  {
    id: "edge-streaming-patterns",
    title: "Edge で配信する API 設計のパターン整理",
    sourceType: "Zenn",
    author: "kab",
    durationMinutes: 8,
    tags: ["Edge", "API", "設計"],
    summary:
      "エッジ実行環境で待ち時間を減らしながら、処理境界をどう切るかを整理した記事。",
  },
  {
    id: "react-state-audio",
    title: "音声プレーヤー UI における React 状態管理の落とし穴",
    sourceType: "Qiita",
    author: "mori",
    durationMinutes: 6,
    tags: ["React", "State", "Audio"],
    summary:
      "再生状態、キュー、画面遷移が絡む時に破綻しやすい状態設計の注意点をまとめた記事。",
  },
  {
    id: "typescript-parser-notes",
    title: "TypeScript で記事本文を段落ごとに整形するメモ",
    sourceType: "Zenn",
    author: "sato",
    durationMinutes: 5,
    tags: ["TypeScript", "Parser"],
    summary:
      "技術記事の本文からノイズを落として、読み上げしやすいテキストへ整形する流れを紹介。",
  },
];

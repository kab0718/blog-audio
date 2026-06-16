# Blog Audio Player

技術ブログを 1 記事 1 トラックとして再生する音声プレーヤーのリポジトリです。

現在は `Vite + React + TypeScript` によるモバイル向けアプリ骨格まで実装されており、要件整理ドキュメントと合わせて段階的に機能を追加していきます。

## Documents

- `docs/blog_audio_player.md`: MVP の要件・優先順位・画面イメージ・読み上げ方針
- `docs/api_boundary.md`: client と server-side / local API 境界の contract
- `docs/codex_best_practices.md`: Codex 開発運用のベストプラクティス調査メモ
- `docs/codex_skills.md`: このプロジェクトで使う Codex skills の一覧と用途
- `docs/tasks/01-app-shell.md`: issue #1 に対応するアプリ骨格タスクの実装計画
- `docs/tasks/02-domain-model.md`: issue #2 に対応するドメインモデル定義タスクの実装計画
- `docs/tasks/03-zenn-article-list-ingestion.md`: issue #3 に対応する Zenn 記事一覧取り込みタスクの実装計画
- `docs/tasks/04-qiita-article-list.md`: issue #4 に対応する Qiita 記事一覧取り込みタスクの実装計画
- `docs/tasks/05-article-content-structure-extraction.md`: issue #5 に対応する記事本文構造抽出タスクの実装計画
- `docs/tasks/06-code-block-summary-pipeline.md`: issue #6 に対応するコードブロック要約パイプラインの実装計画
- `docs/tasks/07-tts-narration-script-generation.md`: issue #7 に対応する TTS 向けナレーション台本生成タスクの実装計画
- `docs/tasks/08-audio-track-generation-cache.md`: issue #8 に対応する音声トラック生成とキャッシュタスクの実装計画
- `docs/tasks/09-zenn-rate-limit-resilient-article-library.md`: issue #14 に対応する Zenn API rate limit 対策タスクの実装計画
- `docs/tasks/10-playback-controls-track-state-management.md`: issue #11 に対応する再生操作とトラック状態管理タスクの実装計画
- `docs/tasks/12-queue-management-continuous-playback.md`: issue #12 に対応するキュー管理画面と連続再生タスクの実装計画

## Commands

- `npm install`: 依存関係をインストールする
- `npm run dev`: 開発サーバーを起動する
- `npm run build`: TypeScript の型チェック付きで本番ビルドする
- `npm run preview`: ビルド結果をローカル確認する

## Environment

- `OPENAI_API_KEY`: `/api/tts` で OpenAI Speech API を呼ぶための server-side API key
- `VITE_TTS_PROVIDER=local-preview`: 実 TTS の代わりに開発用 preview tone を使う場合に設定する

## Status

- モバイル向け Web アプリ骨格を追加済み
- `Article` / `AudioTrack` / `QueueItem` と再生状態の MVP 契約を型定義とモックデータへ反映済み
- 記事一覧 / プレーヤー / キューの 3 画面と共通レイアウトを確認可能
- Zenn / Qiita の記事一覧を取得し、共通 `Article` 形式へ正規化する provider を追加済み
- 記事本文を取得し、見出し・段落・引用・リスト・コードブロックを共通 `ArticleContent` 形式へ抽出する provider / service を追加済み
- コードブロックを逐語読みしない変換と、TTS 向けナレーション台本生成を追加済み
- 生成中 / ready / failed を扱う `AudioTrack` 生成 service と in-memory cache を追加済み
- 記事の明示的なキュー追加 / 削除 / 並び替えと、Next / 音声終了時の連続再生制御を追加済み
- 再生速度変更とスリープタイマーを追加済み
- Zenn / Qiita / TTS provider を同一 origin API 境界へ寄せ、OpenAI Speech API による実 TTS 生成を追加済み
- 永続キャッシュ、キュー永続化、PWA 実機検証は今後追加予定

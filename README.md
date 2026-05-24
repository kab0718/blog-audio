# Blog Audio Player

技術ブログを 1 記事 1 トラックとして再生する音声プレーヤーのリポジトリです。

現在は `Vite + React + TypeScript` によるモバイル向けアプリ骨格まで実装されており、要件整理ドキュメントと合わせて段階的に機能を追加していきます。

## Documents

- `docs/blog_audio_player.md`: MVP の要件・優先順位・画面イメージ・読み上げ方針
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

## Commands

- `npm install`: 依存関係をインストールする
- `npm run dev`: 開発サーバーを起動する
- `npm run build`: TypeScript の型チェック付きで本番ビルドする
- `npm run preview`: ビルド結果をローカル確認する

## Status

- モバイル向け Web アプリ骨格を追加済み
- `Article` / `AudioTrack` / `QueueItem` と再生状態の MVP 契約を型定義とモックデータへ反映済み
- 記事一覧 / プレーヤー / キューの 3 画面と共通レイアウトを確認可能
- Zenn / Qiita の記事一覧を取得し、共通 `Article` 形式へ正規化する provider を追加済み
- 記事本文を取得し、見出し・段落・引用・リスト・コードブロックを共通 `ArticleContent` 形式へ抽出する provider / service を追加済み
- 音声再生ロジック、コードブロック要約、TTS 台本生成は今後追加予定

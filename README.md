# Blog Audio Player

技術ブログを 1 記事 1 トラックとして再生する音声プレーヤーのリポジトリです。

現在は `Vite + React + TypeScript` によるモバイル向けアプリ骨格まで実装されており、要件整理ドキュメントと合わせて段階的に機能を追加していきます。

## Documents

- `docs/blog_audio_player.md`: MVP の要件・優先順位・画面イメージ・読み上げ方針
- `docs/codex_best_practices.md`: Codex 開発運用のベストプラクティス調査メモ
- `docs/codex_skills.md`: このプロジェクトで使う Codex skills の一覧と用途
- `docs/tasks/01-app-shell.md`: issue #1 に対応するアプリ骨格タスクの実装計画

## Commands

- `npm install`: 依存関係をインストールする
- `npm run dev`: 開発サーバーを起動する
- `npm run build`: TypeScript の型チェック付きで本番ビルドする
- `npm run preview`: ビルド結果をローカル確認する

## Status

- モバイル向け Web アプリ骨格を追加済み
- 記事一覧 / プレーヤー / キューの 3 画面と共通レイアウトを仮データで確認可能
- 実データ取得、音声再生ロジック、コードブロック要約は今後追加予定

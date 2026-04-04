# Blog Audio Player で使う Codex Skills

このプロジェクトで使う前提の Codex skills をここにまとめる。  
custom skill 本体は `~/.codex/skills` 配下に置き、プロジェクト側では「何が使えるか」をこのファイルで管理する。

## Custom Skill

### blog-audio-task-planner

- path: `~/.codex/skills/blog-audio-task-planner`
- 役割: タスクごとの markdown ドキュメントを `docs/tasks/<slug>.md` に作成し、要件整理から実装計画まで落とし込む
- 使いどころ:
  - 新しいタスクの仕様を切り出したいとき
  - ざっくりした依頼を実装可能な粒度まで詰めたいとき
  - 実装前に scope / acceptance criteria / implementation plan を整理したいとき

### blog-audio-issue-implementation-planner

- path: `~/.codex/skills/blog-audio-issue-implementation-planner`
- 役割: `blog-audio` 向け issue の文面を読み、`docs/tasks/<slug>.md` に実装可能な計画として正規化する
- 使いどころ:
  - `blog-audio-task-planner` などで整理済みの issue から実装計画を起こしたいとき
  - issue URL / issue 本文を元に `docs/tasks/` の実装計画ドキュメントへ落としたいとき
  - 実装前に issue の曖昧さを assumptions / open questions として明示したいとき

### blog-audio-git-publish

- path: `~/.codex/skills/blog-audio-git-publish`
- 役割: `origin/main` と現在の作業状態を比較し、差分確認、明示的ステージ、コミット、`push` までを安全に進める
- 使いどころ:
  - リモートの `main` とローカル差分を確認してから反映したいとき
  - いまの変更をどのファイルでコミットするか整理してから `push` したいとき
  - この repo で定義されていない build / test / lint を捏造せずに公開フローを進めたいとき

## Installed Skills

### frontend-skill

- path: `~/.codex/skills/frontend-skill`
- 役割: モバイル向け UI やプレーヤー画面の見た目と構成を強くする
- 使いどころ:
  - プレーヤー UI の visual thesis を決めたい
  - スマホ向けの画面構成や情報密度を詰めたい
  - MVP でも安っぽく見えない UI を作りたい

### speech

- path: `~/.codex/skills/speech`
- 役割: OpenAI Audio API を使った TTS 音声生成の手順を標準化する
- 使いどころ:
  - 読み上げ文を音声に変換したい
  - ナレーションの voice / pacing / instructions を詰めたい
  - TTS の試作を再現可能な形で回したい

### playwright

- path: `~/.codex/skills/playwright`
- 役割: 実ブラウザで UI フローを確認し、画面挙動を検証する
- 使いどころ:
  - モバイル UI の崩れを確認したい
  - 再生フローや画面遷移をブラウザ上で検証したい
  - スクリーンショットや snapshot を使って UI を詰めたい

## 運用メモ

- 新しい project-specific skill を追加したら、このファイルにも追記する
- skill の本体更新後、Codex 側で認識させるには再起動が必要な場合がある
- `blog-audio-task-planner` の出力先は `docs/tasks/` を前提とする

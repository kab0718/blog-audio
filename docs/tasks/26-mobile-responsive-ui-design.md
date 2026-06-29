# Issue #26: モバイル優先のレスポンシブUIと全体デザイン整理

## 1. Task Summary

- Goal: Article list / Player / Queue / AppShell / mini player を、スマホ幅で横スクロールや重なりが起きない一貫したプレーヤーUIへ整える。
- User value: 寝る前や移動中に片手で記事を選び、再生状態とキュー状態を迷わず確認できる。
- Related priorities: smartphone playback UX、continuous playback / queue behavior、simple MVP scope。
- Source docs: `AGENTS.md`, `docs/blog_audio_player.md`, GitHub issue #26。

## 2. Scope

### In scope

- 360px前後のスマホ幅からタブレット / PC 幅まで、主要画面が横スクロールせず読めるようにする。
- AppShell、mini player、bottom nav、Article list、Player、Queue の余白、角丸、境界線、文字サイズ、状態表示を揃える。
- 長いタイトル、長い著者名、多数タグでもボタンやテキストが重ならないようにする。
- 再生準備完了 / 生成中 / 生成失敗、再生中 / 次 / 待機 が視覚的に判別できる状態表示にする。
- 主要操作のタップ領域をスマホで扱いやすい大きさにする。
- 記事一覧が長くなりすぎないように、ページ単位で表示件数を区切る。

### Out of scope

- アカウント、レコメンド、Podcast配信。
- 大規模なデザインシステム新設。
- 新しいUIライブラリやアイコンライブラリの導入。
- 記事取得、TTS生成、再生ロジックそのものの変更。

### Assumptions

- 既存の Vite + React + TypeScript 構成と CSS Modules を維持する。
- 主要 viewport は 360px、390-430px、tablet / desktop 幅を想定する。
- タブレット / PC ではスマホ幅に固定せず、読みやすい範囲でコンテンツと bottom nav を広げる。

## 3. UX / Behavior

### Primary flow

- 記事一覧でタイトル、ソース、著者、再生時間、生成状態、キュー状態を確認できる。
- 記事一覧では現在表示している件数範囲とページ位置を確認し、前後ページへ移動できる。
- 記事を再生またはキュー追加しても、mini player と bottom nav が本文操作を覆いすぎない。
- プレーヤー画面では記事タイトル、再生状態、トラック状態、シーク、再生速度がスマホで自然な順序で並ぶ。
- キュー画面では現在再生中と次に再生される記事が一目で分かる。

### Important states / edge cases

- 長い記事タイトルや著者名は折り返し、操作ボタンと重ならない。
- タグは折り返し、横スクロールを発生させない。
- 生成中、失敗、ready の状態は色とラベルで区別する。
- bottom nav と mini player は safe area を考慮し、main content と干渉しない。

## 4. Requirements

### Functional requirements

- Article list / Player / Queue は 360px 幅から PC 幅まで横スクロールしない。
- 主要ボタン、ナビゲーション、再生操作は最低44px相当のタップ領域を持つ。
- 現在再生中、次に再生、キュー済み、トラック生成状態が画面上で判別できる。
- mini player は長いタイトルでも1行または2行以内で収まり、bottom nav と重ならない。
- Article list は8件単位で表示し、ページ移動後も再生・キュー追加操作が同じように使える。

### Non-functional constraints

- MVP範囲を広げず、既存CSS Modules中心で実装する。
- 色、余白、角丸、境界線、文字サイズは共通トークンまたは近い値に寄せる。
- 文字サイズを viewport 幅で過度に変えず、説明文は不要な短幅制限で早く改行しない。

## 5. Technical Approach

### Proposed approach

- `src/styles/tokens.css` に共通の surface / border / radius / tap target 系トークンを追加する。
- `AppShell.module.css` で固定 footer 領域の高さ、safe area、tablet / desktop 幅の扱いを整理する。
- `ArticleListScreen.module.css` でリスト項目、タグ、アクション行の折り返しとタップ領域を調整する。
- `ArticleListScreen.tsx` で記事一覧を8件単位に分割し、現在の表示範囲と前後ページ操作を追加する。
- `PlayerScreen.module.css` でプレーヤーの情報階層、シーク、操作ボタン、速度設定のスマホ表示を整える。
- `QueueScreen.module.css` で現在/次/待機状態の表示と操作ボタンの折り返しを改善する。

### Data / API / state considerations

- 状態管理やAPI境界は変更しない。
- 表示ラベルは既存 view-model を利用し、必要な見た目だけ CSS で差別化する。

### Dependencies

- 既存の Article library、AudioTrack、Playback context。
- 既存コマンド `npm run build`。

## 6. Risks / Open Questions

- 実機ブラウザの safe area とアドレスバー挙動はローカル検証だけでは完全には確認できない。
- 長文の実データ量が mock より大きい場合、追加の折り返し制御が必要になる可能性がある。

## 7. Acceptance Criteria

- Article list / Player / Queue がスマホ幅から PC 幅まで横スクロールせず表示される。
- タブレット / PC 幅では画面がスマホ幅に固定されず、本文と footer が広い表示幅を使う。
- タイトルや説明文が不要な `ch` 幅制限で不自然に早く改行されない。
- 長いタイトル、著者名、タグがあってもボタンや状態ラベルと重ならない。
- 主要操作のタップ領域がスマホで扱いやすい。
- 再生準備完了 / 生成中 / 生成失敗、再生中 / 次 / 待機 が視覚的に区別できる。
- Article list が8件単位でページ分割され、前後ページへ移動できる。
- mini player / bottom nav / main content がレスポンシブ幅で互いに干渉しない。
- 色、余白、角丸、境界線、文字サイズに一貫性がある。
- `npm run build` が成功する。

## 8. Implementation Plan

1. 共通デザイントークンを追加し、背景、surface、border、radius、tap target の基準を定義する。
2. AppShell の header / main / fixed footer / nav を mobile first で再調整し、footer 分の余白と長文 mini player を安定させる。
3. Article list の meta、status badge、tags、actions を折り返し前提にし、タップ領域、状態表示、ページネーションを揃える。
4. Player の情報階層、wave plane、progress、controls、speed segmented control を小型スマホで崩れない寸法にする。
5. Queue の 再生中 / 次 / 待機 表示と並び替え操作を、長文でも重ならない構造に調整する。
6. `npm run build` を実行し、必要に応じて dev server で主要 viewport を確認する。

## 9. Validation

- Available commands: `npm run build`, `npm run dev`
- Manual checks: 360px、390-430px、tablet / desktop 幅で Article list / Player / Queue の横スクロール、重なり、footer 干渉、タップ領域を確認する。
- Known limitations: 実機の safe area とモバイルブラウザUIの動的な高さはローカルブラウザ検証では完全には再現できない。

# モバイル記事一覧画面を実装する

## 1. Task Summary

- Goal: スマホで使いやすい記事一覧画面を整え、記事を 1 トラックとして再生またはキュー追加できる入口を実装する
- User value: 移動中や就寝前でも、片手で記事を探して再生キューへ流し込める
- Related priorities: smartphone playback UX, 1 article = 1 track, continuous playback / queue behavior, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - Issue #9 `MVP: モバイル記事一覧画面を実装する` <https://github.com/kab0718/blog-audio/issues/9>
  - 現状実装: `src/screens/articles/ArticleListScreen.tsx`, `src/screens/articles/ArticleListScreen.module.css`, `src/app/articles/ArticleLibraryContext.tsx`, `src/view-models/library.ts`

## 2. Scope

### In scope

- 記事一覧で title / source / author / 推定再生時間を表示する
- 記事ごとに「今すぐ再生」と「キューに追加」の導線を持たせる
- current / queued / not queued の状態を記事カード上で判別できるようにする
- loading / empty / error の状態をスマホ幅で破綻しない表示にする
- 長いタイトル、タグ多数、生成状態 badge があっても横スクロールを出さない

### Out of scope

- 高度な検索、タグフィルタ、パーソナライズ
- あとで聴く保存の本格実装
- desktop-first の専用レイアウト
- 記事本文取得、音声生成、コードブロック要約の仕様変更

### Assumptions

- 一覧は縦スクロール主体にする
- MVP では source 混在の並び順は `ArticleLibraryContext` の取得結果順を使う
- 推定再生時間は本文抽出前の概算でよく、精度改善は別タスクで扱う
- 現状実装はあるため、このタスクでは issue 要件に照らした不足分の調整と検証を主に行う

## 3. UX / Behavior

### Primary flow

- ユーザーが記事一覧を開く
- アプリは取得状態に応じて loading / error / empty / success を表示する
- success では各記事のメタ情報、キュー状態、音声トラック状態を表示する
- 「今すぐ再生」で対象記事を current にしてプレーヤーへ遷移する
- 「キューに追加」で対象記事をキュー末尾へ追加し、追加済み状態へ変わる

### Important states / edge cases

- 記事一覧取得に失敗した場合は retry できる
- 記事が 0 件の場合は空状態を表示し、操作不能なカードを出さない
- current の記事は「再生画面へ」として、再生対象であることを見失わない
- queued の記事は重複追加できない
- タイトルが長くても action row と badge が重ならない

## 4. Requirements

### Functional requirements

- 記事カードに title / source / author / duration / tags / summary の利用可能な情報を表示できる
- 各記事から 1 タップで再生画面へ進める
- 各記事をキューへ追加でき、追加済みの記事は重複追加されない
- current article と queued article を UI 上で区別できる
- `ArticleLibraryContext` の loading / error / empty / success を画面に反映できる
- 音声トラック状態がある場合、生成前 / 生成中 / ready / failed の表示が崩れない

### Non-functional constraints

- iPhone 幅相当で横スクロールを発生させない
- primary action と secondary action は親指で押せる大きさを確保する
- article fetching、queue state、audio track state の責務を画面内で混ぜすぎない
- 新しい外部依存は追加しない
- コードブロック処理や TTS-ready text 生成へ影響を与えない

## 5. Technical Approach

### Proposed approach

- `ArticleListScreen` は `useArticleLibrary`, `usePlayback`, `useAudioTracks` から必要な状態だけを受け取る
- 表示用の整形は `toArticleListItemViewModel()` に寄せ、画面側は layout と action wiring を担当する
- `playArticleNow(article.id)` と `addArticleToQueue(article.id)` を分け、再生開始とキュー追加の意図を明確にする
- CSS は 1 カラムのリストを基本にし、meta row / footer row は狭幅で折り返せる構造にする
- loading / error / empty の文言は記事一覧取得の状態に限定し、音声生成失敗とは混同しない

### Data / API / state considerations

- `Article.id` を queue item id として扱う現状を前提にする
- `queueItemIds.includes(article.id)` で queued 状態を導出する
- `currentQueueItemId === article.id` で current 状態を導出する
- track status は `getTrackByArticleId(article.id)` の結果を表示に使うだけに留める

### Dependencies

- `docs/tasks/01-app-shell.md` の画面遷移
- `docs/tasks/02-domain-model.md` の `Article` / `QueueItem` 契約
- `docs/tasks/12-queue-management-continuous-playback.md` の queue 操作
- 主な対象は `src/screens/articles/ArticleListScreen.tsx`, `src/screens/articles/ArticleListScreen.module.css`, `src/view-models/library.ts`

## 6. Risks / Open Questions

- source 混在時の並び順は未決定。MVP では取得結果順に留める
- 推定再生時間は本文抽出や実音声生成後にずれる可能性がある
- タグや summary が長い記事で情報密度が上がりすぎる場合は、表示項目の優先度調整が必要
- 「今すぐ再生」が即時 autoplay まで行うかはブラウザ制約と player 実装に依存する

## 7. Acceptance Criteria

- 記事一覧画面で title / source / author / 推定再生時間がスマホ幅に収まる
- 各記事からプレーヤーへ 1 タップで進める
- 各記事をキューへ追加でき、追加済み記事は重複追加されない
- current / queued / not queued の状態が記事カード上で判別できる
- loading / empty / error の状態が分かり、retry 可能な状態では retry できる
- 長いタイトルや複数タグでも横スクロールや操作不能が起きない
- `npm run build` が通る

## 8. Implementation Plan

1. `ArticleListScreen` と `toArticleListItemViewModel()` の現状を issue #9 の要件と照合し、不足している表示状態や action を洗い出す
2. article card の情報優先度を title / source / author / duration / queue status / actions の順に整理する
3. `playArticleNow` と `addArticleToQueue` の action wiring を確認し、current / queued 表示が即時更新されるようにする
4. loading / empty / error の状態表示と retry 導線をスマホ幅で確認し、文言が source 取得状態と一致するようにする
5. CSS の折り返し、余白、ボタンサイズを調整し、長いタイトルと action row が重ならないようにする
6. `npm run build` を実行し、dev server のスマホ幅で一覧表示、再生遷移、キュー追加、状態表示を手動確認する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - iPhone 幅相当で記事一覧に横スクロールが出ないことを確認する
  - 「今すぐ再生」で current が更新され、プレーヤーへ遷移することを確認する
  - 「キューに追加」で queued 表示へ変わり、重複追加できないことを確認する
  - loading / empty / error / success の各状態が操作可能な UI として読めることを確認する
- Known limitations:
  - このタスクでは検索、フィルタ、保存機能は扱わない
  - 推定再生時間の精度改善は本文抽出・音声生成側の後続判断とする

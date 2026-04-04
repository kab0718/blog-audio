# MVP ドメインモデルと再生状態の契約を定義する

## 1. Task Summary

- Goal: `Article` `AudioTrack` `QueueItem` と再生状態の最小契約を定義し、UI 実装と音声生成実装が同じデータ前提で進められるようにする
- User value: 1 記事 = 1 トラックの体験を、記事一覧・プレーヤー・キュー・音声生成のどこでも破綻なく扱える
- Related priorities: natural listening experience, correct handling of code blocks, continuous playback / queue behavior, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - Issue #2 `MVP: ドメインモデルを定義する` <https://github.com/kab0718/blog-audio/issues/2>
  - 現状実装: `src/types/article.ts`, `src/app/playback/PlaybackContext.tsx`, `src/data/mockArticles.ts`

## 2. Scope

### In scope

- MVP で共通利用する `Article` `AudioTrack` `QueueItem` の属性を定義する
- エンティティ本体と画面表示用の派生 view model を分ける方針を明文化する
- 再生キューと現在再生中トラックを区別できる最小の再生状態契約を定義する
- 後続の本文整形やコードブロック要約を載せられる拡張点を決める
- モックデータと画面が新しい契約へ移行しやすい責務分離を整理する

### Out of scope

- Zenn / Qiita からの実取得処理
- TTS 実装、音声生成 API 連携、ストリーミング制御
- 永続化方式、キャッシュ保存形式、DB スキーマ詳細
- コードブロック要約アルゴリズム自体の実装
- chunked audio の最終仕様確定

### Assumptions

- 初期 MVP の source provider は `zenn` と `qiita` の 2 種に絞る
- UI 表示用ラベルは派生値として扱い、ドメイン契約の列挙値は機械処理しやすい安定 ID を使う
- 時間系の内部表現は `minutes` 表示ではなく、後続処理で再利用しやすい秒単位またはミリ秒単位を優先する
- 記事本文そのものと、読み上げ用に整形された内容は別責務として扱う
- MVP では同一記事をキューへ重複追加しない

## 3. UX / Behavior

### Primary flow

- 記事一覧で見えるタイトル、著者、配信元、推定再生時間が、プレーヤー画面とキュー画面でも同じ `Article` 契約から供給される
- ユーザーが記事を選ぶと、現在再生中のトラックと今後再生予定のキュー項目が別の責務として扱われる
- 音声生成が未完了でも、UI は `generating` `ready` `failed` の違いを表示できる
- 後続の本文整形タスクでコードブロックを要約・説明・スキップのいずれかに変換しても、`Article` 本体のメタ情報契約は崩れない

### Important states / edge cases

- 同一記事の重複キューは発生しない前提で、「現在再生中」と「次に再生される項目」が混同されない
- 音声未生成の記事でも、一覧掲載やキュー投入自体はできる
- 音声生成失敗時は `AudioTrack` 側の状態で扱い、`Article` 本体を failed 扱いしない
- コードブロック処理の中間表現が未生成でも、記事メタ情報だけで画面表示できる
- 将来 audio chunking が必要になっても、単一 URL 前提の MVP 契約を壊さず拡張できる

## 4. Requirements

### Functional requirements

- `Article` は少なくとも `id`, `sourceType`, `sourceArticleId`, `title`, `author`, `url`, `estimatedDuration`, `tags` を持つ
- `sourceType` は UI ラベルではなく、安定した provider 識別子として表現される
- `Article` は本文メタ情報と再生状態を混在させない
- `AudioTrack` は少なくとも `id`, `articleId`, `status`, `playbackResource`, `duration`, `generatedAt` を持てる
- `AudioTrack.status` は少なくとも `generating`, `ready`, `failed` を区別できる
- `QueueItem` は少なくとも `id`, `articleId`, `order`, `queueState` を持ち、現在再生中か次候補かを判定できる
- キュー追加時は同一 `articleId` の重複投入を防げる前提にする
- MVP では `QueueItem.id` は `articleId` と同一値で扱う
- 画面表示用に `ArticleListItem`, `NowPlaying`, `QueueListItem` などの派生 model をエンティティから導出できる
- 再生状態は `Article` や `QueueItem` に埋め込まず、現在トラック ID・キュー順序・プレーヤー状態を別契約として持てる
- 後続タスクでコードブロック処理用の中間表現を追加できるよう、`Article` から参照可能な拡張点または別型の差し込み位置を決める

### Non-functional constraints

- 命名は UI・ingestion・narration pipeline の 3 方向で解釈がズレにくいこと
- MVP に不要な属性を先回りで増やしすぎないこと
- 画面表示用フォーマット文字列をドメイン契約へ混ぜないこと
- モックデータから実データへ切り替えても、画面コンポーネントの責務が大きく変わらないこと
- コードブロック処理のための拡張余地は持ちつつ、初期契約はスマホ UI の実装速度を落とさないこと

## 5. Technical Approach

### Proposed approach

- `domain entities`、`playback state contract`、`screen view models` を 3 層に分けて定義する
- `Article` は「記事そのものの識別とメタ情報」、`AudioTrack` は「読み上げ音声の生成結果」、`QueueItem` は「再生順制御」に責務を限定する
- 画面はエンティティを直接描画するのではなく、必要な表示項目へ整形した派生 model を通して利用する
- 既存の `durationMinutes` や表示用の `sourceType: "Zenn" | "Qiita"` は、実装時にドメイン契約へ寄せて再整理する

### Data / API / state considerations

- `Article` は取得元 ID とアプリ内 ID を分け、provider 追加時に URL 文字列の差異へ引きずられないようにする
- 推定再生時間は `estimatedDurationSeconds` のような内部表現を持ち、`6 min` のような表示文字列は view model で生成する
- `AudioTrack.playbackResource` は MVP では単一 URL を第一候補にしつつ、将来 chunk 配列へ差し替え可能な union または拡張余地を持たせる
- `PlaybackState` は `currentTrackId`, `queueItemIds`, `playerStatus` のような再生セッション情報へ寄せ、記事メタ情報とは分離する
- 同一記事の再キューを許さないため、MVP では `QueueItem.id` を `articleId` と同一にする
- コードブロック処理の中間表現は、このタスクで全文設計し切るのではなく `ArticleContent` / `NarrationSegment` 相当の差し込み位置だけを決める

### Dependencies

- issue #1 で作ったアプリ骨格の上で、記事一覧・プレーヤー・キューが共通契約を参照できるようにするための基礎タスク
- 後続の本文整形、コードブロック要約、実プレーヤー UI はこの契約を前提に進める
- 既存の `mockArticles` と `PlaybackContext` はこのタスク完了後に移行対象になる

## 6. Risks / Open Questions

- `Article` に本文本体を持たせるか、本文は ingestion / parsing 層の別契約へ逃がすかの境界は最終決定が必要
- `AudioTrack` の `duration` を推定値で埋めるのか、生成後の実測値だけを持つのかは設計判断が残る
- `QueueItem.queueState` を `current / queued / played` まで持つか、MVP は `current / next` 相当へ絞るかを決める必要がある
- コードブロック処理用の中間表現を `Article` 参照に含めると、取得直後の生データ契約との境界が曖昧になりやすい

## 7. Acceptance Criteria

- `Article` `AudioTrack` `QueueItem` の責務と最小属性が文書化されている
- 現在再生中とキュー順序を別責務として扱う再生状態契約が定義されている
- 記事一覧、プレーヤー、キューの各画面がどのエンティティまたは派生 model を参照するか分かる
- `generating` `ready` `failed` を UI に反映できる前提が契約上明示されている
- コードブロック処理用の拡張点が記されており、後続タスクで literal narration を避ける設計余地がある
- 既存の `mockArticles` / `PlaybackContext` をどの方向へ置き換えるかが判断できる

## 8. Implementation Plan

1. 既存の `src/types/article.ts` と `src/app/playback/PlaybackContext.tsx` を基準に、画面表示用に偏っている属性と本来ドメインへ置くべき属性を分離する
2. `Article` `AudioTrack` `QueueItem` の最小属性セットと列挙値を決め、MVP で不要な属性は入れない方針を確定する
3. `PlaybackState` と `QueueItem` の責務境界を決め、現在再生中・次に再生される記事・重複禁止・生成状態をどう表すかを整理する
4. 記事一覧、プレーヤー、キュー用の派生 view model の責務を書き出し、画面が直接どの型へ依存するかを定義する
5. コードブロック処理用の拡張点と `AudioTrack.playbackResource` の将来拡張余地を文書へ残し、後続 issue が追加設計なしで着手できる状態にする

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - 記事一覧 / プレーヤー / キューの 3 画面で必要な表示項目を洗い出し、どの型から供給されるか追跡できることを確認する
  - `mockArticles` と `PlaybackContext` を見て、追加の場当たり的属性なしに移行方針を説明できることを確認する
  - `generating` `ready` `failed` の状態差分を UI 表示に落とせる契約になっていることを確認する
- Known limitations:
  - このタスクでは型定義やドキュメント設計が中心で、実際の parser / TTS / queue 操作実装は含まない
  - 推定再生時間や audio chunking の最終仕様は後続タスクで具体化が必要

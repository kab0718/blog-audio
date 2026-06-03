# キュー管理画面と連続再生を実装する

## 1. Task Summary

- Goal: 記事を明示的にキューへ追加・削除・並び替えできる状態管理とキュー画面を実装し、Next 操作と音声終了時にキュー順で連続再生できるようにする
- User value: 寝る前や移動中に複数記事を積んでおけば、スマホを見続けなくても 1 記事 = 1 トラックとして連続で聴ける
- Related priorities: smartphone playback UX, continuous playback / queue behavior, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - Issue #12 `MVP: キュー管理画面と連続再生を実装する` <https://github.com/kab0718/blog-audio/issues/12>
  - 現状実装: `src/app/playback/PlaybackContext.tsx`, `src/screens/queue/QueueScreen.tsx`, `src/screens/articles/ArticleListScreen.tsx`, `src/screens/player/PlayerScreen.tsx`, `src/App.tsx`

## 2. Scope

### In scope

- 記事一覧から記事をキューへ追加できる操作
- 記事をすぐ再生対象にする操作と、キュー末尾へ積む操作の整理
- キュー画面での待機記事の削除
- キュー画面での待機記事の上下並び替え
- 現在再生中の記事と次に再生される記事の明示
- Player の Next 操作をキュー順へ接続する
- 音声終了時に次のキュー項目へ進む連続再生
- 0 件 / 1 件 / 現在再生中のみのキューでも破綻しないモバイル UI

### Out of scope

- セッション間のキュー永続化
- あとで聴く保存
- 複数プレイリストや高度なプレイリスト管理
- レコメンドや自動追加
- ドラッグ&ドロップ並び替え用ライブラリの導入
- バックグラウンド再生、Media Session API、PWA 固有挙動

### Assumptions

- MVP では単一キューのみ扱う
- 同じ記事を同一キューへ重複追加する挙動は必須にしない
- 初期実装では `Article.id` をキュー項目の識別子として扱い、同一記事の重複追加が必要になった時点で独立した `QueueItem.id` へ拡張する
- 並び替えは依存追加を避け、タップしやすい上下移動ボタンで実装する
- 現在再生中の記事は待機キューとは別扱いに見せるが、内部状態では順序配列上の current index として扱ってよい

## 3. UX / Behavior

### Primary flow

- ユーザーは記事一覧で記事を選び、「今すぐ再生」または「キューに追加」に相当する操作を行える
- キュー画面では現在再生中の記事、次に再生される記事、それ以降の待機記事を順番に確認できる
- 待機記事はキュー画面から削除でき、上下ボタンで順序を変更できる
- Player の Next を押すと、キュー内の次の記事へ移動する
- 再生中の音声が最後まで到達した場合、次の記事があれば自動で current を進める

### Important states / edge cases

- キューが空の場合、記事一覧から追加する導線が分かる空状態を表示する
- 現在再生中の記事だけで待機記事がない場合、Next は無効になり、キュー画面では「次の記事なし」が分かる
- 現在再生中の記事を削除対象にするかどうかは UI 上で曖昧にせず、初期実装では削除操作は待機記事に限定する
- 並び替え後、Player の Next 対象とキュー画面の「次に再生」が即時に一致する
- 音声トラックが生成中の次記事へ進んだ場合、current は移動し、既存の音声生成状態に従って準備中表示を出す
- 最後の記事の再生終了時は連続再生を停止し、player status を `paused` または `idle` 相当に戻す

## 4. Requirements

### Functional requirements

- Playback state は現在再生中の記事 ID とキュー順序を一貫して保持できる
- 記事一覧から未追加の記事をキュー末尾へ追加できる
- 記事一覧から選んだ記事を current にし、必要に応じてキューへ含められる
- 待機中の記事をキューから削除できる
- 待機中の記事を 1 つ上または 1 つ下へ移動できる
- 現在再生中の記事と次に再生される記事をキュー画面で区別して表示できる
- Player の Next 操作はキュー順序に従って current を進められる
- `<audio>` の `ended` event で次の記事があれば current を進め、次がなければ再生状態を停止できる
- キュー操作後も `AudioTrackQueueSync` が current と next up の音声トラック準備を継続できる

### Non-functional constraints

- 主要操作はスマホ幅で横スクロールなしに押せるサイズと配置にする
- 新しい外部依存は追加せず、React state と既存 CSS Modules で実装する
- queue state と audio generation / article fetching の責務を混ぜない
- 現在の `ArticleLibraryContext` と `AudioTrackContext` の provider 境界を維持する
- 実装は MVP の単一キューに閉じ、永続化やアカウント前提のデータ構造へ広げない

## 5. Technical Approach

### Proposed approach

- `PlaybackContext` の reducer action を queue 操作単位へ整理する
  - `playArticleNow`
  - `addArticleToQueue`
  - `removeQueueItem`
  - `moveQueueItem`
  - `advanceToNext`
  - `setPlayerStatus`
- `syncQueueWithArticles` による「取得記事をすべて自動でキュー化する」挙動を見直し、記事一覧取得とユーザーのキュー操作を分離する
- 記事一覧では各記事に current / queued / not queued の状態を渡し、追加済みの記事は重複追加しない表示にする
- キュー画面では `currentQueueItemId` と `queueItemIds` から current、next up、waiting を導出し、待機記事だけに削除・上下移動ボタンを出す
- Player の `moveToQueueItem` 相当を reducer action に寄せ、Next button と `audio.onEnded` が同じ `advanceToNext` ロジックを使うようにする
- `AudioTrackQueueSync` は current と next の article ID を引き続き参照し、キュー順変更後に次記事の生成準備対象が更新されるようにする

### Data / API / state considerations

- 初期状態は `currentQueueItemId: null`, `queueItemIds: []`, `playerStatus: "idle"` とし、記事取得成功だけでは自動再生キューを作らない
- `queueItemIds` は当面 `Article.id[]` として扱い、`buildQueueItems()` は current と order を表示用に導出する
- `addArticleToQueue` は同じ article ID がすでにある場合は no-op にする
- `playArticleNow` は対象 article ID がキューになければ current 位置としてキューへ挿入し、すでにあればその位置を current にする
- `removeQueueItem` は初期実装では current 以外の待機項目を対象にし、current 削除は後続判断にする
- `moveQueueItem` は current を含む順序破綻を避けるため、初期実装では待機項目だけを移動対象にする
- `advanceToNext` は current index の次があればそこへ進み、なければ status を停止状態へ戻す

### Dependencies

- `docs/tasks/01-app-shell.md` の 3 画面構成と下部ナビゲーションを前提にする
- `docs/tasks/02-domain-model.md` の `Article` / `QueueItem` / `PlaybackState` 契約を前提にする
- `docs/tasks/08-audio-track-generation-cache.md` の current / next に対する音声準備導線を前提にする
- 主な変更箇所は `src/app/playback/PlaybackContext.tsx`, `src/App.tsx`, `src/screens/articles/ArticleListScreen.tsx`, `src/screens/queue/QueueScreen.tsx`, `src/screens/player/PlayerScreen.tsx`, `src/data/mockLibrary.ts`, `src/view-models/library.ts`

## 6. Risks / Open Questions

- current の削除を許可するかは UX 判断が残る。初期実装では待機記事の削除に限定して曖昧さを避ける
- `Article.id` を queue item ID と兼用すると同じ記事の複数回追加はできない。MVP では許容し、必要になったら独立 `QueueItem.id` へ拡張する
- 音声生成中の次記事へ自動遷移した場合、準備完了後に自動再生するか、ユーザー操作を待つかは実装時に既存 `playerStatus` の扱いと合わせて決める
- ブラウザの autoplay 制約により、ユーザー操作なしの連続再生が失敗する可能性がある。失敗時は `paused` に戻す既存方針を保つ
- キュー永続化がないため、リロードでキューは失われる。これは issue #12 の MVP 外として扱う

## 7. Acceptance Criteria

- 記事一覧から記事をキューへ追加でき、追加済み記事が重複して積まれない
- 記事一覧から記事を選んで current にでき、Player と Mini player が同じ記事を表示する
- キュー画面で現在再生中の記事と次に再生される記事が明示される
- 待機記事をキュー画面から削除でき、削除後の順序とキュー件数が即時に更新される
- 待機記事を上下移動でき、移動後の Next 対象が表示順と一致する
- Player の Next 操作でキュー順に次の記事へ進む
- 音声終了時、次の記事がある場合は current が次へ進み、最後の記事では再生状態が停止する
- キューが 0 件または 1 件でも、キュー画面と Player の操作が破綻しない
- `npm run build` が通る

## 8. Implementation Plan

1. `PlaybackContext` の現状 action と `PlaybackQueueSync` の自動キュー同期を確認し、ユーザー操作でキューを作る reducer API へ置き換える
2. `PlaybackContext` に `playArticleNow`, `addArticleToQueue`, `removeQueueItem`, `moveQueueItem`, `advanceToNext` を追加し、重複追加や空キューで no-op になる防御を入れる
3. `src/App.tsx` の `PlaybackQueueSync` を削除または役割縮小し、`AudioTrackQueueSync` が current と next up を準備する挙動だけを維持する
4. `ArticleListScreen` と view model を更新し、各記事に「今すぐ再生」と「キューに追加」の操作、追加済み / current 表示を持たせる
5. `QueueScreen` と queue view model / CSS を更新し、current、next up、waiting を分けて表示し、待機記事の削除と上下移動ボタンを実装する
6. `PlayerScreen` の Prev / Next と `<audio onEnded>` を新しい queue action へ接続し、最後まで再生した時の停止状態を揃える
7. スマホ幅で記事追加、削除、並び替え、Next、自動進行を手動確認し、`npm run build` を実行する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - dev server を開き、記事一覧から 2 件以上をキューへ追加できることを確認する
  - 追加済み記事が重複追加されず、current / queued 表示が崩れないことを確認する
  - キュー画面で待機記事を削除し、件数と next up 表示が更新されることを確認する
  - キュー画面で待機記事を上下移動し、Player の Next 対象と表示順が一致することを確認する
  - Player の Next button でキュー順に current が進むことを確認する
  - ready な音声の終了時に次記事へ進み、最後の記事では停止状態になることを確認する
  - iPhone 幅相当で主要操作に横スクロール、重なり、押しづらい小さすぎるボタンがないことを確認する
- Known limitations:
  - このタスクではキューの永続化は実装しない
  - 同一記事の複数回追加は扱わない
  - ブラウザの autoplay 制約に起因する失敗は完全には回避せず、失敗時に paused へ戻す挙動で扱う

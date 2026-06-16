# モバイルプレーヤー画面を実装する

## 1. Task Summary

- Goal: 1 記事 = 1 トラックとして違和感なく操作できるスマホ向けプレーヤー画面を実装する
- User value: 寝る前や移動中に、記事情報と再生操作を見失わずに音楽プレーヤー感覚で聴ける
- Related priorities: smartphone playback UX, natural listening experience, continuous playback / queue behavior
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - Issue #10 `MVP: モバイルプレーヤー画面を実装する` <https://github.com/kab0718/blog-audio/issues/10>
  - 現状実装: `src/screens/player/PlayerScreen.tsx`, `src/screens/player/PlayerScreen.module.css`, `src/app/playback/PlaybackContext.tsx`, `src/app/tracks/AudioTrackContext.tsx`

## 2. Scope

### In scope

- 現在記事の title / source / author をプレーヤー上部で表示する
- 再生 / 一時停止 / Prev / Next の主要操作をスマホ幅で押しやすく配置する
- シークバー、現在位置、総時間を表示する
- 音声 track の generating / ready / failed を表示し、操作可否へ反映する
- 速度変更とスリープタイマーへの導線を置ける余白を確保する
- 再生対象なし、記事取得中、音声生成失敗の状態を破綻なく表示する

### Out of scope

- 実 TTS provider の選定や API 接続
- キュー並び替え UI
- 再生速度変更とスリープタイマーの実処理
- Media Session API、PWA、ロック画面操作
- 高度なアニメーションや artwork 生成

### Assumptions

- ジャケット画像は必須ではなく、記事情報と track 状態の表示を優先する
- audio element 制御は当面 `PlayerScreen` と `PlaybackContext` の連携で扱う
- 速度 / タイマーは issue #13 の別タスクで実装するが、導線の配置余地は残す
- 現状実装はあるため、このタスクではモバイル体験と状態表示の抜けを補強する

## 3. UX / Behavior

### Primary flow

- ユーザーが記事一覧またはキューから記事を選ぶ
- プレーヤー画面に現在記事のタイトル、source、著者、track 状態が表示される
- 音声 track が ready なら再生 / 一時停止とシークができる
- Next / Prev でキュー上の前後記事へ移動できる
- failed の場合は retry 可能な primary action を表示し、通常再生ボタンと混同しない

### Important states / edge cases

- 再生対象がない場合は、記事一覧から選ぶ導線が分かる empty state を表示する
- generating では play / seek を無効化し、準備中であることを表示する
- ready では audio resource を再生し、timeupdate を UI に反映する
- failed では retry を試せるが、queue や player がクラッシュしない
- duration が未取得の場合でもシークバーが不正値で崩れない
- 長いタイトルが操作領域を押し出さない

## 4. Requirements

### Functional requirements

- 現在記事の title / source / author を表示できる
- `AudioTrack.status` に応じて primary action label と disabled state を切り替えられる
- ready track の `playbackResource.url` を `<audio>` へ接続できる
- play / pause / seek / next / previous の操作が UI から実行できる
- `currentTime`, `duration`, `ended`, `error` を playback state へ反映できる
- failed track では retry 導線を出し、再生不可状態を明示できる

### Non-functional constraints

- スマホ縦持ちで主要操作が横スクロールなしに収まる
- ボタン、シークバー、状態表示が重ならない
- UI は provider 固有の TTS response に依存しない
- raw article text やコードブロック本文を再生 fallback として扱わない
- 新しい外部依存は追加しない

## 5. Technical Approach

### Proposed approach

- `PlayerScreen` は `currentQueueItemId` から article と track を解決し、view model へ渡して表示する
- `<audio>` の event handler は `usePlayback()` の `seek`, `setDuration`, `next`, `reportPlaybackError` へ集約する
- primary action は `failed` なら retry、`playing` なら pause、それ以外なら play に分岐する
- duration は playback state、track metadata、article estimated duration の順で fallback する
- CSS は hero、track readout、progress、control rail を縦積みにし、狭幅で折り返しやすい構造にする

### Data / API / state considerations

- `PlaybackState.positionSeconds` と `durationSeconds` は一時再生状態として扱い、永続化しない
- `AudioTrack.durationSeconds` が不明でも `HTMLAudioElement.duration` 取得後に補正できる
- queue の前後 ID は `queueItemIds` と `currentQueueItemId` から導出する
- retry は `retryTrackForArticle(article)` に委ね、player は provider 詳細を知らない

### Dependencies

- `docs/tasks/08-audio-track-generation-cache.md` の `AudioTrack` 生成状態
- `docs/tasks/10-playback-controls-track-state-management.md` の playback state
- `docs/tasks/12-queue-management-continuous-playback.md` の queue 順序
- 主な対象は `src/screens/player/PlayerScreen.tsx`, `src/screens/player/PlayerScreen.module.css`, `src/view-models/library.ts`

## 6. Risks / Open Questions

- 速度 / タイマー導線を先に置く場合、未実装機能に見えないようにする必要がある
- autoplay 制約により、Next 後の自動再生が端末やブラウザで失敗する可能性がある
- background / lock screen 挙動は PWA 検証タスクで扱う
- artwork 代替表現をどこまで作るかは MVP では必須ではない

## 7. Acceptance Criteria

- iPhone 幅で title / source / author / シークバー / 再生操作が収まる
- ready track で再生 / 一時停止 / シーク / Next / Prev が操作できる
- generating / failed / no current article の状態がそれぞれ判別できる
- 長いタイトルでも主要操作が隠れない
- failed track で retry でき、失敗表示中も queue / player がクラッシュしない
- 後続の速度変更・スリープタイマー導線を追加できる配置余地がある
- `npm run build` が通る

## 8. Implementation Plan

1. `PlayerScreen` の現状レイアウトと issue #10 の表示要件を照合し、欠けている情報と状態を洗い出す
2. now playing view model を確認し、title / meta / track status / primary action label が状態ごとに一貫するよう補強する
3. `<audio>` event と playback state の同期を確認し、duration 未確定、play 失敗、ended、error の fallback を整理する
4. control rail と seek UI の disabled 条件を `generating` / `ready` / `failed` ごとに明確にする
5. CSS をスマホ幅で確認し、長いタイトル、error message、readout が操作領域と重ならないようにする
6. `npm run build` を実行し、dev server のスマホ幅で no current / generating / ready / failed / ended を手動確認する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - スマホ幅で主要操作とシークバーが横スクロールなしに操作できることを確認する
  - ready track の play / pause / seek / next / prev が playback state と一致することを確認する
  - generating / failed / no current の表示と disabled state が破綻しないことを確認する
  - 長いタイトルの記事でも controls が押せることを確認する
- Known limitations:
  - このタスクでは速度変更、スリープタイマー、Media Session API は実装しない
  - 実機 background 再生の保証は PWA 検証タスクで扱う

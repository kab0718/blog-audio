# 再生速度変更とスリープタイマーを実装する

## 1. Task Summary

- Goal: 再生速度変更とスリープタイマーを追加し、就寝前や移動中に使いやすい再生設定を実装する
- User value: ユーザーが自分に合う速度で聴き、寝落ち前に自動停止できる
- Related priorities: smartphone playback UX, natural listening experience, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - Issue #13 `MVP: 再生速度変更とスリープタイマーを実装する` <https://github.com/kab0718/blog-audio/issues/13>
  - 現状実装: `src/app/playback/PlaybackContext.tsx`, `src/screens/player/PlayerScreen.tsx`, `src/types/playback.ts`

## 2. Scope

### In scope

- 再生速度の状態を定義し、audio element の `playbackRate` へ反映する
- MVP 用の数段階の速度プリセットを用意する
- スリープタイマーの状態を定義し、満了時に再生を停止する
- プレーヤー画面から速度とタイマーを変更できる UI を追加する
- 現在の速度とタイマー設定をプレーヤー上で確認できるようにする
- track 切り替え時も速度設定が不自然にリセットされないようにする

### Out of scope

- ユーザーアカウントへの設定同期
- 複数 timer preset の高度な管理
- OS レベルの sleep / alarm 連携
- background / lock screen での完全保証
- voice selection や音質設定

### Assumptions

- MVP の速度プリセットは `0.8x`, `1.0x`, `1.2x`, `1.5x`, `2.0x` 程度で十分とする
- タイマーは「現在時刻から N 分後に停止する」単純な方式にする
- 速度とタイマーはブラウザ内一時状態でよく、永続化は後続判断とする
- タイマー満了時は current article を保持したまま `paused` にする

## 3. UX / Behavior

### Primary flow

- ユーザーはプレーヤー画面で速度を選ぶ
- 再生中または停止中に選んだ速度は、次に再生される audio element に反映される
- ユーザーはスリープタイマーを選ぶ
- タイマー満了時、再生は一時停止し、タイマー状態は解除される
- ユーザーはタイマーを途中で解除できる

### Important states / edge cases

- audio resource が未準備でも速度設定は変更できる
- timer 設定中に pause しても、満了時は paused のまま安全に timer を解除する
- timer 設定中に track が変わっても、残り時間は引き継ぐ
- timer 満了直前にユーザーが解除した場合、停止処理が二重に走らない
- background では browser timer が遅延する可能性を docs / limitation に残す

## 4. Requirements

### Functional requirements

- `PlaybackState` または playback settings state に現在の playback speed を保持できる
- 選択された speed が `<audio>.playbackRate` へ反映される
- speed preset をプレーヤー画面から切り替えられる
- sleep timer の終了時刻または残り秒数を状態として保持できる
- timer 満了時に audio を pause し、player status を `paused` にできる
- timer を解除できる
- 現在の speed と timer 状態が UI で分かる

### Non-functional constraints

- 操作はスマホで 1 から 2 手以内に収める
- 新しい外部依存は追加しない
- タイマー処理は queue advance や audio generation と責務を混ぜない
- ブラウザ制約で保証できない background 挙動を隠さない
- MVP コアの play / pause / seek / next の操作性を悪化させない

## 5. Technical Approach

### Proposed approach

- `src/types/playback.ts` に `playbackRate` と `sleepTimerEndsAt` または `sleepTimerRemainingSeconds` を追加する
- `PlaybackContext` に `setPlaybackRate`, `setSleepTimer`, `clearSleepTimer` 相当の action / helper を追加する
- `PlayerScreen` の audio element に `playbackRate` を反映する `useEffect` を追加する
- timer は `setTimeout` と state を組み合わせ、満了時に `pause()` と timer clear を実行する
- UI はプレーヤー画面内に compact な segmented control または button group と timer selector を置く

### Data / API / state considerations

- `playbackRate` は numeric value として保持し、UI label は view model で生成する
- timer は deadline timestamp を持つと track 切り替えや一時停止中も扱いやすい
- timer 満了後は `sleepTimerEndsAt: null` へ戻す
- audio element 未生成時でも state 更新は可能にし、ready 後に反映する

### Dependencies

- `docs/tasks/10-playback-controls-track-state-management.md` の playback state
- `docs/tasks/15-mobile-player-screen.md` のプレーヤー UI
- 主な対象は `src/types/playback.ts`, `src/app/playback/PlaybackContext.tsx`, `src/screens/player/PlayerScreen.tsx`, `src/screens/player/PlayerScreen.module.css`

## 6. Risks / Open Questions

- iOS Safari や background tab では timer の発火が遅延する可能性がある
- 速度変更時の音質は browser の audio 実装に依存する
- timer 満了時に queue を進めるか停止だけにするかは issue で明示されていないため、MVP では停止にする
- speed / timer の永続化は便利だが、MVP では scope を広げすぎない

## 7. Acceptance Criteria

- プレーヤー画面から再生速度を切り替えられる
- 選択した速度が現在の audio 再生に反映される
- スリープタイマーを設定でき、満了時に再生が停止する
- タイマーを解除できる
- 現在速度とタイマー状態が UI 上で分かる
- speed / timer UI がスマホ幅で play / pause / seek / next と重ならない
- `npm run build` が通る

## 8. Implementation Plan

1. `PlaybackState` の拡張方針を決め、`playbackRate` と sleep timer の state / action を追加する
2. `PlaybackContext` に speed と timer を更新する helper を追加し、初期値と範囲外値の防御を入れる
3. `PlayerScreen` で audio element の `playbackRate` を state と同期する
4. sleep timer の timeout 管理を追加し、満了時に `pause()` と timer clear が一度だけ走るようにする
5. プレーヤー画面に speed selector と timer selector / clear control を追加し、スマホ幅の CSS を調整する
6. pause 中、track 切り替え、timer 解除、audio 未準備時の edge case を手動確認する
7. `npm run build` を実行する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - ready track を再生し、各 speed preset が audio に反映されることを確認する
  - timer を短い時間に設定し、満了時に pause されることを確認する
  - timer 解除後に満了処理が走らないことを確認する
  - track 切り替え後も speed が反映されることを確認する
  - スマホ幅で設定 UI が主要操作と重ならないことを確認する
- Known limitations:
  - background / lock screen 中の timer 精度はブラウザ制約を受ける
  - このタスクでは speed / timer の永続化は扱わない

# 再生操作とトラック状態管理を実装する

## 1. Task Summary

- Goal: 1 記事 = 1 トラック前提で、現在トラック、再生 / 一時停止、シーク、次へ、再生位置を一元的に扱える playback state と UI 接続を実装する
- User value: 技術記事を音楽プレーヤーのように自然に操作でき、移動中や寝る前でも再生状態を見失わずに聴き続けられる
- Related priorities: smartphone playback UX, continuous playback / queue behavior, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - `docs/tasks/02-domain-model.md`
  - `docs/tasks/08-audio-track-generation-cache.md`
  - Issue #11 `MVP: 再生操作とトラック状態管理を実装する` <https://github.com/kab0718/blog-audio/issues/11>
  - 現状実装: `src/types/playback.ts`, `src/app/playback/PlaybackContext.tsx`, `src/app/tracks/AudioTrackContext.tsx`, `src/screens/player/PlayerScreen.tsx`

## 2. Scope

### In scope

- 現在再生中 article / track と queue 順序を playback state で一元管理する
- `play()`, `pause()`, `seek(seconds)`, `next()` 相当の操作を UI から呼べる契約にする
- `HTMLAudioElement` の `currentTime`, `duration`, `ended`, `timeupdate`, `error` を playback state へ同期する
- `AudioTrack.status` の `generating`, `ready`, `failed` に応じて再生操作の可否と表示を切り替える
- シークバーと現在位置 / 総時間表示をスマホ幅のプレーヤー UI に追加する
- トラック終了時または `Next` 操作時に queue 内の次記事へ進める
- 再生対象が切り替わるときに前トラックの再生状態と位置表示を破綻させない

### Out of scope

- キュー並び替え UI、削除 UI、複数キュー管理
- 再生速度、スリープタイマー、前回位置の永続化
- Media Session API、バックグラウンド再生、ロック画面操作
- 実 TTS provider、音声生成 API、音声キャッシュ方式の変更
- chapter 分割、見出し単位のスキップ、コードブロック単位のシーク

### Assumptions

- MVP では `QueueItem.id` と `Article.id` が同じ値として扱われている現状を前提にする
- `AudioTrack` は `docs/tasks/08-audio-track-generation-cache.md` の責務で生成され、このタスクは ready track の再生制御を主に扱う
- `AudioTrack.status === "ready"` かつ `playbackResource.kind === "url"` のときだけ実再生できる
- `durationSeconds` が未確定の場合は `HTMLAudioElement.duration` を優先し、取得できるまでは推定時間または未確定表示に fallback する
- ブラウザの autoplay 制約により、初回再生はユーザー操作から開始する

## 3. UX / Behavior

### Primary flow

- ユーザーが記事を選ぶと、その記事が現在トラックとしてプレーヤーに表示される
- track が `generating` の間は、記事情報と生成待ち状態を表示し、再生ボタンは実再生できない状態にする
- track が `ready` になると、ユーザーは再生 / 一時停止を切り替えられる
- 再生中は現在位置が更新され、シークバーで任意位置へ移動できる
- `Next` を押す、または現在 track が最後まで再生されると、queue の次記事へ進む
- 次記事の track が未生成なら、次記事の情報を保ったまま generating / failed / ready の状態に従って表示する

### Important states / edge cases

- `generating`: 再生位置は 0 または未確定表示とし、play / seek は無効化する
- `ready`: `playbackResource.url` を audio element に接続し、play / pause / seek / next を有効化する
- `failed`: 再生操作は無効化し、retry 導線がある場合は音声生成の再試行だけを行う
- シーク直後は `currentTime` と UI 表示を即時更新し、次の `timeupdate` まで古い位置を見せ続けない
- `audio.play()` がブラウザ制約や resource error で失敗した場合、`playing` のまま固定せず `paused` または error 相当へ戻す
- queue の末尾で `next()` または `ended` が発生した場合は、現在 track を保持して `paused` にする
- track 切り替え中は前 track の `timeupdate` が新 track の位置表示へ混ざらないようにする

## 4. Requirements

### Functional requirements

- `PlaybackState` は現在 queue item、queue 順序、player status、現在位置、duration、seek 可否を表現できる
- UI は `dispatch` 直呼びだけでなく、`play`, `pause`, `seek`, `next`, `selectTrack` などの意図ベース操作を呼べる
- `ready` ではない track に対して `play` と `seek` が実行されない
- `play` 実行時に audio element の再生成功 / 失敗を state へ反映できる
- `pause` 実行時に audio element と `playerStatus` が同期する
- `seek(seconds)` 実行時に audio element の `currentTime` と UI 上の現在位置が同期する
- audio element の `timeupdate` と `loadedmetadata` から現在位置と duration を更新できる
- `ended` 時に次 queue item があれば移動し、なければ現在 track を停止状態にできる
- `next()` は queue 順序を参照し、次 article への切り替えと player status の初期化を一貫して行う
- `generating`, `ready`, `failed` ごとにプレーヤー UI の primary action、シークバー、Next ボタンの状態が判定できる

### Non-functional constraints

- playback UI と audio resource 制御を密結合させすぎず、状態契約は `PlaybackContext` 側に寄せる
- `Article` や `AudioTrack` 型に再生中の一時状態を混ぜない
- 新しい外部依存は追加せず、React state と browser audio API で実装する
- スマホ幅で再生 / 一時停止、シーク、次へが横スクロールなしで操作できる
- track 状態表示、シーク表示、主要操作が重なって読めなくならない
- raw article text やコードブロック本文を playback fallback として扱わない

## 5. Technical Approach

### Proposed approach

- `src/types/playback.ts` を拡張し、`positionSeconds`, `durationSeconds`, `isSeeking`, `playbackError` などの最小 state を追加する
- `PlaybackContext` は reducer だけでなく、現在 track と audio element event から状態更新する action / helper を持てる形へ整理する
- `PlayerScreen` で直接 `audio.play()` と `dispatch` を分散させている処理を、意図ベース handler に寄せて読みやすくする
- audio element はまず `PlayerScreen` 内に保持し、必要になった場合だけ dedicated hook へ切り出す
- `AudioTrackContext` から得た current track の status と `playbackResource` を `PlaybackContext` / `PlayerScreen` へ渡し、ready 判定を 1 箇所へ集める
- `next()` は `queueItemIds` と `currentQueueItemId` から次 ID を解決し、末尾では `paused` にする
- シーク UI は `<input type="range">` を使い、`min=0`, `max=durationSeconds`, `value=positionSeconds` の安定した制約で実装する

### Data / API / state considerations

- `PlayerStatus` は現状の `"idle" | "paused" | "playing"` を維持し、必要なら `buffering` は後続で追加する
- `PlaybackState.currentQueueItemId` は現状維持し、MVP では article ID と同一として扱う
- duration は `AudioTrack.durationSeconds`、`HTMLAudioElement.duration`、`Article.estimatedDurationSeconds` の順で利用可否を判断する
- position は再生 resource ごとの一時 state とし、永続化しない
- `playbackError` は provider の raw error ではなく、UI 表示に使える短い message に正規化する
- `AudioTrack.status` が `failed` になった場合、再生 state は `idle` または `paused` へ落とし、audio element は停止する

### Dependencies

- `docs/tasks/02-domain-model.md` の `Article`, `AudioTrack`, `QueueItem`, `PlaybackState` の責務分離を前提にする
- `docs/tasks/08-audio-track-generation-cache.md` の track service / `AudioTrackContext` を前提にする
- 現状の `src/app/playback/PlaybackContext.tsx`, `src/types/playback.ts`, `src/screens/player/PlayerScreen.tsx`, `src/view-models/library.ts` が主な変更箇所になる
- 必要に応じて `src/screens/player/PlayerScreen.module.css` をスマホ操作向けに最小調整する

## 6. Risks / Open Questions

- `PlaybackContext` が audio element ref まで持つべきか、UI 層に保持して event だけ state へ流すべきかは実装時に判断が必要
- `ended` 後に次 track を自動再生する場合、ブラウザ制約や generating 待ちとの組み合わせで追加制御が必要になる可能性がある
- `durationSeconds` が不正または `Infinity` になる audio resource では、シークバーの fallback 表示が必要になる
- queue 末尾での挙動を「停止」か「先頭へ戻る」かは issue で明示されていないため、MVP では停止として扱う
- failed track を `Next` で自動スキップするかは未決定で、このタスクではユーザー操作による next を優先する
- player state を画面遷移で保持するため Context は維持するが、リロード後の復元は out of scope とする

## 7. Acceptance Criteria

- 現在 track が `ready` のとき、プレーヤー UI から再生 / 一時停止を切り替えられる
- 現在位置と duration が表示され、再生中に現在位置が更新される
- シークバー操作で audio の再生位置が変わり、UI 表示も破綻しない
- `Next` 操作で queue 内の次記事へ移動し、記事タイトル、track 状態、再生位置が次 track 用に更新される
- 現在 track の再生終了時、次記事があれば次記事へ進み、末尾なら停止状態になる
- `generating` では再生 / シークが無効化され、待機状態が分かる
- `failed` では再生 / シークが無効化され、失敗状態または retry 導線が表示される
- 画面をまたいでも `PlaybackContext` から現在再生中 article / track を参照できる
- スマホ幅で主要操作、シークバー、状態表示が重ならず操作できる
- `npm run build` が通る

## 8. Implementation Plan

1. 現状の `PlaybackContext`, `PlayerScreen`, `AudioTrackContext` の責務を確認し、audio element event をどこから playback state へ流すか決める
2. `src/types/playback.ts` と reducer action を拡張し、現在位置、duration、seek 中状態、再生 error、track 切り替え時の reset を表現できるようにする
3. `PlayerScreen` の audio element 制御を整理し、ready track の `playbackResource.url`、`play`, `pause`, `timeupdate`, `loadedmetadata`, `ended`, `error` を playback state と同期する
4. `play`, `pause`, `seek`, `next`, `selectTrack` の意図ベース handler を追加し、`generating` / `ready` / `failed` に応じて操作可否を判定する
5. プレーヤー UI に現在位置、duration、シークバーを追加し、スマホ幅で既存の track 状態表示と主要操作が重ならないよう CSS を調整する
6. queue 末尾、play 失敗、duration 未確定、failed track の retry / next などの edge case を手動確認しながら状態遷移を補強する
7. `npm run build` を実行し、dev server でスマホ幅の再生 / 一時停止 / シーク / next / ended / generating / failed 表示を確認する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - スマホ幅で ready track を再生し、play / pause の state と audio が同期することを確認する
  - 再生中に現在位置表示が進み、pause 後に止まることを確認する
  - シークバーを動かし、指定位置へ移動して表示も即時更新されることを確認する
  - `Next` を押して次 article へ移動し、前 track の位置表示が残らないことを確認する
  - track 終了時に次 article へ進み、queue 末尾では停止状態になることを確認する
  - generating track では play / seek が無効化され、ready になると操作可能になることを確認する
  - failed track では失敗表示または retry 導線が出て、アプリがクラッシュしないことを確認する
- Known limitations:
  - このタスクでは再生位置の永続化、Media Session API、バックグラウンド再生は扱わない
  - 実 TTS provider や audio cache の仕様は `AudioTrack` の ready resource を受け取る前提に留める
  - 自動 next の挙動はブラウザ再生制約の影響を受けるため、実装後に端末上で追加確認が必要

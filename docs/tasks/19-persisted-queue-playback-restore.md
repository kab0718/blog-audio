# キューと再生状態を復元できるようにする

## 1. Task Summary

- Goal: キュー、現在再生中の記事、可能なら再生位置をブラウザ内に保存し、リロード後に復元できるようにする
- User value: スマホの再読み込みや PWA 再起動後も、次に聴く記事と現在位置を簡単に失わない
- Related priorities: smartphone playback UX, continuous playback / queue behavior, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - `docs/tasks/12-queue-management-continuous-playback.md`
  - Issue #18 `MVP: キューと再生状態を復元できるようにする` <https://github.com/kab0718/blog-audio/issues/18>
  - 現状実装: `src/app/playback/PlaybackContext.tsx`, `src/screens/queue/QueueScreen.tsx`, `src/types/playback.ts`

## 2. Scope

### In scope

- queue item ids を browser storage に保存する
- current article id を保存する
- 再生位置を軽量に保存し、復元時に duration 範囲内へ clamp する
- article library 再取得後に保存済み queue を復元する
- 保存済み article が取得できない場合、安全に除外する
- queue を手動で空にした場合、保存状態も更新する
- storage unavailable、JSON parse error、schema mismatch でクラッシュしないようにする

### Out of scope

- アカウント同期
- 複数キュー / playlist
- あとで聴く保存の本格実装
- offline playback
- cross-device resume
- 音声 resource の永続保存

### Assumptions

- MVP では `localStorage` に schema version 付き payload を保存する
- `queueItemIds` は現状どおり `Article.id[]` として扱う
- 復元は article library の取得成功後に実行する
- 再生位置は自動再生せず、復元後は paused / idle からユーザー操作で再開する

## 3. UX / Behavior

### Primary flow

- ユーザーが記事をキューへ追加し、再生する
- queue、current article、position が保存される
- リロード後、記事一覧取得が成功すると保存済み ID と照合される
- 取得できた記事だけで queue と current が復元される
- ユーザーは復元された current article を確認し、再生を再開できる

### Important states / edge cases

- 保存済み current article が library にない場合、queue 内の最初に取得できた記事へ fallback するか current なしにする
- 保存済み queue の一部だけ取得できない場合、取得できない ID を除外する
- position が duration を超える場合は duration 以下へ clamp する
- storage 例外や JSON parse 失敗時は初期状態で起動する
- schema version が違う場合は保存 payload を使わない

## 4. Requirements

### Functional requirements

- `queueItemIds`, `currentQueueItemId`, `positionSeconds` を保存できる
- 保存 payload には schema version を含める
- article library 取得後に queue と current を復元できる
- 復元対象の記事が見つからない場合、安全に除外できる
- 範囲外 position は 0 以上 duration 以下へ clamp される
- queue 変更、current 変更、position 更新に応じて保存 payload が更新される
- 保存失敗や storage 不可でアプリがクラッシュしない

### Non-functional constraints

- article fetching と playback persistence の責務を混ぜすぎない
- 復元処理は UI を長時間 block しない
- 自動再生はしない
- localStorage payload は最小限にし、article 本文や音声 binary を保存しない
- 新しい外部依存は追加しない

## 5. Technical Approach

### Proposed approach

- `src/app/playback/` に persistence helper を追加し、read / write / validate を `PlaybackContext` から分離する
- payload は `{ schemaVersion, queueItemIds, currentQueueItemId, positionSeconds, savedAt }` とする
- `PlaybackProvider` は初期 state または hydration action で保存 payload を読み込めるようにする
- `ArticleLibraryContext` の success 後、保存済み IDs と取得済み articles を照合して `hydratePlaybackState` action を実行する
- position は audio metadata 取得後に再 clamp し、seek UI が壊れないようにする
- manual clear 相当の queue 操作では payload も空状態へ更新する

### Data / API / state considerations

- storage key は `blog-audio:playback-state:v1` のように version を含める
- payload 内の ID は article ID のみで、title や provider response は保存しない
- `positionSeconds` は短い interval または `timeupdate` で頻繁に書きすぎないよう throttle を検討する
- `durationSeconds` は保存せず、復元後に track / audio metadata から判断する

### Dependencies

- `docs/tasks/10-playback-controls-track-state-management.md`
- `docs/tasks/12-queue-management-continuous-playback.md`
- 主な対象は `src/app/playback/PlaybackContext.tsx`, `src/types/playback.ts`, `src/App.tsx` または hydration 用 component

## 6. Risks / Open Questions

- position を頻繁に localStorage へ書くと performance に影響する可能性がある
- 復元時に audio track が未生成の場合、position をいつ seek へ反映するか調整が必要
- 保存済み queue が daily popular 更新で library から消えた場合、復元率が下がる
- current article が消えた場合の fallback を「先頭へ戻す」か「空にする」かは UX 判断が残る
- 同一記事の複数回追加を導入すると payload 形式の見直しが必要

## 7. Acceptance Criteria

- リロード後に queue item ids と current article が復元される
- 復元対象の記事が article library にない場合、安全に除外または empty state へ落ちる
- 再生位置が保存・復元される場合、範囲外値で seek UI が壊れない
- storage 例外や JSON parse 失敗でアプリがクラッシュしない
- 手動で queue を空にした場合、保存 payload も空状態になる
- `npm run build` が通る

## 8. Implementation Plan

1. `PlaybackState` と reducer action を確認し、永続化対象を `queueItemIds`, `currentQueueItemId`, `positionSeconds` に限定する
2. playback persistence helper を追加し、schema validation、storage read / write、例外 fallback を実装する
3. `PlaybackContext` に hydration action を追加し、保存 payload を安全に state へ反映できるようにする
4. article library success 後に保存済み ID を取得済み articles と照合し、存在しない ID を除外して復元する
5. position 保存の頻度を調整し、復元時は duration 取得後に clamp / seek できるようにする
6. queue 追加、削除、並び替え、current 変更、clear 相当操作で保存 payload が更新されることを確認する
7. `npm run build` を実行し、リロード復元、破損 JSON、存在しない article ID を手動確認する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - 2 件以上の queue を作ってリロードし、queue と current が復元されることを確認する
  - 再生位置を進めてリロードし、範囲内の位置として復元されることを確認する
  - localStorage の payload を壊してもアプリが初期状態で起動することを確認する
  - 保存済み ID が library にない場合、安全に除外されることを確認する
  - storage を無効化しても操作がクラッシュしないことを確認する
- Known limitations:
  - このタスクでは cross-device resume と offline playback は扱わない
  - 復元後の自動再生は行わない

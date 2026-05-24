# 音声トラック生成とキャッシュの最小フローを実装する

## 1. Task Summary

- Goal: TTS-ready text から 1 記事 = 1 トラックの `AudioTrack` を生成または取得し、再生に必要なリソースと状態を管理できるようにする
- User value: 記事を選ぶと実際に再生可能な音声トラックへつながり、同じ記事の再生では生成済み音声を再利用して待ち時間を抑えられる
- Related priorities: smartphone playback UX, natural listening experience, continuous playback / queue behavior, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - `docs/tasks/02-domain-model.md`
  - Issue #8 `MVP: 音声トラック生成とキャッシュを実装する` <https://github.com/kab0718/blog-audio/issues/8>
  - 現状実装: `src/types/audioTrack.ts`, `src/app/playback/PlaybackContext.tsx`

## 2. Scope

### In scope

- TTS-ready text から `AudioTrack` を生成または取得する track service の境界を作る
- `AudioTrack.status` として `generating`, `ready`, `failed` を扱う状態管理を実装する
- 同一記事の再生時に生成済み `AudioTrack` を再利用する最小キャッシュを用意する
- 生成中、再生可能、失敗の状態をプレーヤー UI が参照できる契約にする
- MVP では単一 URL の `playbackResource` を第一候補にし、将来 chunk 群へ拡張できる余地を残す

### Out of scope

- TTS-ready text の生成、本文抽出、コードブロック要約アルゴリズム
- 高度なオフライン保存、永続 DB、キャッシュ同期
- 複数 voice の切り替え、話速や音質の詳細設定
- バックグラウンド大量事前生成
- Podcast 配信やアカウント単位の音声ライブラリ

### Assumptions

- このタスクの入力は、コードブロックを逐語読みしない形に整形済みの TTS-ready text とする
- 初期 MVP はストリーミング優先だが、待ち時間が UX を壊す場合に備えて生成済み音声の再利用を許容する
- キャッシュはまずアプリ内メモリまたはブラウザ内の軽い保存に留め、永続性や期限管理は最小限にする
- `AudioTrack.id` は article 単位で安定して引ける値にし、同一記事の重複生成を避けられるようにする
- 実 TTS provider や backend API の詳細は実装時に確定するが、UI と playback は provider 固有レスポンスに依存しない

## 3. UX / Behavior

### Primary flow

- ユーザーが記事を選ぶと、該当 article の `AudioTrack` を探し、未生成なら生成を開始する
- 生成中はプレーヤーが待機状態を表示し、記事タイトルやキュー位置は見失わない
- `AudioTrack` が `ready` になると、プレーヤーは `playbackResource` を使って再生を開始または再開できる
- 同じ記事を再度選んだ場合は、可能な限り既存の `AudioTrack` を再利用し、重複生成を避ける

### Important states / edge cases

- `generating`: 再生リソース未確定でも、現在対象の記事と生成中であることを UI に出せる
- `ready`: `playbackResource` と可能なら `durationSeconds` を持ち、プレーヤーが再生対象として扱える
- `failed`: 失敗した記事を UI で明示し、アプリ全体やキューをクラッシュさせない
- 生成失敗後の再試行は、同じ article に対する失敗状態を上書きして再生成できる形にする
- キュー再生中に次の記事の track が未生成の場合は、次 track の生成中状態を扱い、再生順序を壊さない
- 生成前の待機中でも、コードブロックを含む raw article text を直接読み上げ対象にしない

## 4. Requirements

### Functional requirements

- 1 記事ごとに `AudioTrack` を生成または取得できる
- 既存の `AudioTrack` が `ready` の場合、同一記事で重複生成せず再利用できる
- `AudioTrack.status` の `generating`, `ready`, `failed` を UI と playback state へ伝えられる
- `ready` の `AudioTrack` は再生可能な `playbackResource` を必ず持つ
- `failed` の `AudioTrack` は失敗理由または UI 表示に必要な最小情報を参照できる
- 生成要求、状態更新、キャッシュ参照を track service の責務として UI から分離できる
- プレーヤーは provider 固有の TTS response ではなく、共通 `AudioTrack` 契約を参照する
- キュー内の記事が次に再生される前に、必要に応じて track の生成または取得を開始できる構造にする

### Non-functional constraints

- トラック単位の責務を崩さず、`Article` に音声生成状態を混ぜない
- 初回待ち時間を短くするため、生成済みリソースの参照と生成開始を分離する
- 新しい外部依存や外部サービスは、実装に明確な必要がある場合だけ追加する
- キャッシュの失敗や期限切れでアプリ全体を落とさない
- スマホ幅のプレーヤーで generating / failed 表示が主要操作やキュー導線と重ならない
- 読み上げ対象は TTS-ready text に限定し、コードブロックの raw text を fallback として使わない

## 5. Technical Approach

### Proposed approach

- `src/services/tracks/` または `src/app/tracks/` に track service を追加し、生成要求、状態管理、キャッシュ参照をまとめる
- `getOrCreateAudioTrack(articleId, narrationText)` のような境界を用意し、既存 ready track があれば返し、なければ生成状態を作って生成を開始する
- `AudioTrack` の repository / cache を UI から切り離し、まずは in-memory map で最小実装する
- TTS provider 呼び出しは adapter として隔離し、戻り値を `PlaybackResource` へ正規化してからアプリ内へ渡す
- `PlaybackContext` は現在の記事や player status に加えて、現在参照すべき `AudioTrack` を解決できるように接続する
- プレーヤー画面は `AudioTrack.status` に応じて、待機、再生可能、失敗の表示を切り替える

### Data / API / state considerations

- 既存の `src/types/audioTrack.ts` は `status`, `playbackResource`, `durationSeconds`, `generatedAt` の基礎契約として使う
- 失敗状態を UI へ出すため、実装時に `errorMessage` か別の track error map を追加するか判断する
- cache key は原則 `articleId` とし、将来 voice や narration version が入る場合は key の構造を拡張する
- `playbackResource` は MVP では `{ kind: "url", url }` を使い、chunk 再生が必要になった場合に union を追加できる形を保つ
- ブラウザで直接 TTS API を呼ぶと API key や CORS の問題が出るため、実装時は server-side / local API 境界が必要か確認する
- キャッシュ寿命、保存先、生成済み音声ファイルの配置は MVP では最小限に留め、恒久仕様として固定しない

### Dependencies

- `docs/tasks/02-domain-model.md` の `AudioTrack` 契約を前提にする
- 本文抽出、コードブロック要約、TTS-ready text 生成の後続または先行タスクと接続する
- 現状の `src/types/audioTrack.ts`, `src/types/playback.ts`, `src/app/playback/PlaybackContext.tsx`, `src/screens/player/PlayerScreen.tsx` が主な接続箇所になる
- 実 source provider は `Article.id` と `sourceArticleId` を保持している必要がある

## 6. Risks / Open Questions

- TTS provider をどこで呼ぶかが未確定で、ブラウザ直呼びは API key 保護と CORS の観点で避ける必要がある可能性が高い
- 生成待ち時間が長い場合、記事選択後に即座に再生できない UX をどこまで許容するか判断が必要
- キャッシュ保存先を in-memory に留めるとリロードで消えるが、永続化すると容量管理や期限管理が必要になる
- 音声生成に失敗した記事をキュー再生中にどうスキップまたは再試行するかは、実装時に player / queue behavior と合わせて決める必要がある
- `durationSeconds` は生成後に取得できない provider もあるため、未確定時のシーク UI 表示に fallback が必要になる
- narration text の version が変わったときに、古い cached track をどう無効化するかが未決定

## 7. Acceptance Criteria

- 記事選択時に対象 article の `AudioTrack` が生成または再利用される
- 同一記事の再生で、ready な既存 track がある場合は重複生成されない
- `generating`, `ready`, `failed` の状態をプレーヤー UI が区別して表示できる
- `ready` の track は共通 `PlaybackResource` 経由でプレーヤーへ渡される
- 生成失敗時にプレーヤーが失敗状態を表示し、アプリ全体やキューがクラッシュしない
- track service、TTS adapter、UI 表示、playback state の責務が分離されている
- raw article text やコードブロック本文を音声生成の fallback として使わない
- `npm run build` が通る

## 8. Implementation Plan

1. 現状の `AudioTrack` 型、`PlaybackContext`、`PlayerScreen` の依存関係を確認し、track 状態をどこで保持するか決める
2. track service の interface を定義し、`articleId` から既存 track を取得する処理と未生成時の `generating` 作成を実装する
3. 最小キャッシュを追加し、`ready` track の再利用、`failed` track の保持、再試行時の状態更新を扱えるようにする
4. TTS provider adapter の境界を作り、実生成または当面の stub から `PlaybackResource` へ正規化する
5. プレーヤーと playback state を track service へ接続し、記事選択時に生成開始、ready 時に再生リソース参照、failed 時に失敗表示を行う
6. キュー内の次記事でも track 未生成状態を扱えるよう、現在 track と次 track の生成・失敗がキュー順序を壊さないことを確認する
7. `npm run build` を実行し、スマホ幅で generating / ready / failed の表示と同一記事再生時の再利用を手動確認する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - スマホ幅で記事を選び、生成中状態がプレーヤーに表示されることを確認する
  - 生成完了後に `ready` track の `playbackResource` から再生できることを確認する
  - 同一記事を 2 回再生し、2 回目に ready track が再利用されることを確認する
  - 生成失敗を起こし、プレーヤーが failed 状態を表示してクラッシュしないことを確認する
  - キュー再生中に次記事の track が未生成または failed でも、再生順序と表示が破綻しないことを確認する
- Known limitations:
  - このタスクでは TTS-ready text 生成やコードブロック要約自体は扱わない
  - cache の永続化、期限管理、容量管理は MVP の最小範囲に留める
  - 実 TTS provider と backend 境界は、API key 保護と CORS を確認したうえで実装時に確定する
  - 初期実装では provider 境界を保つため、実 TTS ではなく local preview adapter が短い再生可能 WAV リソースを返す

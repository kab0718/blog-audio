# 実 TTS 音声を生成して再生する

## 1. Task Summary

- Goal: `local-preview` の確認用 WAV ではなく、TTS-ready narration script から実際の読み上げ音声を生成して再生できるようにする
- User value: 技術記事を 1 記事 = 1 トラックとして実際に聴ける MVP 体験になる
- Related priorities: natural listening experience, correct handling of code blocks, smartphone playback UX, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - `docs/tasks/07-tts-narration-script-generation.md`
  - `docs/tasks/08-audio-track-generation-cache.md`
  - Issue #16 `MVP: 実TTS音声を生成して再生する` <https://github.com/kab0718/blog-audio/issues/16>
  - 現状実装: `src/narration/articleNarration.ts`, `src/tracks/audioTrackService.ts`, `src/tracks/localPreviewTtsAdapter.ts`, `src/app/tracks/AudioTrackContext.tsx`

## 2. Scope

### In scope

- `NarrationScript` から実 TTS provider へ渡す adapter 境界を実装する
- browser bundle に API key を含めない server-side / local API 境界を用意する
- `NarrationScript.textChunks` を使い、provider の入力上限に合わせて長文を分割する
- provider response を共通 `PlaybackResource` へ正規化する
- 生成中、ready、failed の既存 track state を維持する
- raw article body や raw code block を TTS に直接渡さない
- local preview adapter は開発用 fallback として残す

### Out of scope

- voice の高度な選択 UI
- 永続音声ファイル管理の完成版
- offline playback
- podcast 配信
- 複数 TTS provider の完全な抽象化
- ユーザーアカウントや課金管理

### Assumptions

- TTS 入力は `generateNarrationScript()` が返す `NarrationScript` に限定する
- MVP では provider は 1 種類に絞る
- dev では local endpoint、本番では server-side / edge endpoint を想定する
- 生成結果はまず URL または Blob object URL として `PlaybackResource` に正規化する

## 3. UX / Behavior

### Primary flow

- ユーザーが記事を再生する
- 記事本文が抽出され、コードブロックを逐語読みしない narration script が生成される
- track service が TTS adapter を呼び、音声 resource を生成する
- `AudioTrack.status` が ready になると、player がその resource を再生する
- provider 失敗時は failed track になり、player で retry または失敗状態を表示する

### Important states / edge cases

- 長文記事は chunk ごとに生成し、順序を保って再生可能 resource へまとめる
- provider 入力上限を超える chunk はさらに分割するか、明示的に failed にする
- 一部 chunk の生成に失敗した場合、raw text fallback で読み上げず failed として扱う
- code block は narration script 上の summary / explanation / skip 結果だけを渡す
- API key 未設定時は分かる error を返し、アプリ全体を落とさない

## 4. Requirements

### Functional requirements

- `TrackGenerationAdapter` として実 TTS adapter を差し込める
- 実 TTS adapter は `NarrationScript` を入力にし、`GeneratedAudioResource` を返す
- TTS provider 呼び出しは browser 直呼びせず、server-side / local API 境界を通す
- `NarrationScript.textChunks` を使った chunked generation ができる
- 生成結果は `AudioTrack.playbackResource` として player に渡せる
- provider 失敗時は failed track と error message に正規化される
- API key や secret が client JS に含まれない

### Non-functional constraints

- UI と playback state は provider 固有 response に依存しない
- raw code block を TTS fallback として使わない
- 新規依存やサーバー構成は MVP に必要な最小限に留める
- 長文生成中でも queue / player がクラッシュしない
- 既存の local preview adapter は開発確認用に維持できる

## 5. Technical Approach

### Proposed approach

- `src/tracks/audioTrackService.ts` の adapter 注入を維持し、実 TTS adapter を別 module として追加する
- client からは `/api/tts` のような同一 origin endpoint を呼び、secret は server-side / local API に置く
- endpoint は narration chunks と script metadata を受け取り、provider response を audio binary または URL に正規化する
- adapter は chunk response を結合または順序付き resource として扱い、MVP では単一再生 URL に寄せる
- `AudioTrack.source` は `local-preview` と実 TTS provider を区別できる値へ拡張する
- provider error は `AudioTrack.errorMessage` に出せる短い message へ正規化する

### Data / API / state considerations

- `NarrationScript.version` を cache key や track metadata に残す
- `textChunks` の順序は生成 audio の順序と一致させる
- provider の max input length は adapter 内の制約として管理する
- endpoint response は `{ url, durationSeconds }` または audio blob を client で `PlaybackResource` へ変換できる形にする
- API key は `.env` 等の server-side 環境変数から読む

### Dependencies

- `docs/tasks/07-tts-narration-script-generation.md`
- `docs/tasks/08-audio-track-generation-cache.md`
- `docs/tasks/18-production-api-boundary.md` と密接に接続する
- 主な対象は `src/tracks/audioTrackService.ts`, `src/app/tracks/AudioTrackContext.tsx`, 新規 TTS adapter / API endpoint

## 6. Risks / Open Questions

- この repo は現状 Vite client app であり、本番 server-side endpoint の実行環境を決める必要がある
- TTS provider の選定、料金、入力上限、音声 format は未確定
- chunk 音声の結合を client で行うか server で行うかにより実装負荷が変わる
- provider latency が長い場合、queue の next track 事前生成や永続 cache が重要になる
- API key 未設定時に local preview へ fallback するか、明示的 failed にするかは運用方針が必要

## 7. Acceptance Criteria

- Zenn または Qiita 記事を Play すると、確認用 tone ではなく記事本文由来の TTS 音声が再生される
- TTS 入力は `generateNarrationScript()` の結果であり、raw article body や raw code block ではない
- 長文記事で `NarrationScript.textChunks` を使った分割生成ができる
- provider 失敗時に track は failed になり、queue / player がクラッシュしない
- API key や secret が client bundle に含まれない
- local preview adapter を開発用 fallback として維持できる
- `npm run build` が通る

## 8. Implementation Plan

1. 実行環境を確認し、dev 用 local API endpoint と本番 API 境界の最小 contract を決める
2. 実 TTS adapter module を追加し、`NarrationScript.textChunks` から endpoint request を作る
3. server-side / local endpoint を実装し、環境変数から API key を読み provider を呼び出す
4. provider response を `GeneratedAudioResource` / `PlaybackResource` へ正規化し、duration が取れない場合の fallback を決める
5. `generateAudioTrack()` または adapter selection を更新し、実 TTS と local preview を切り替えられるようにする
6. error handling を failed track に接続し、API key 未設定、provider error、chunk error を手動確認する
7. `npm run build` を実行し、dev server で代表 Zenn / Qiita 記事の再生を確認する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - 記事を選び、local preview tone ではなく本文由来の音声が再生されることを確認する
  - コードブロックを含む記事で raw code が逐語読みされないことを確認する
  - 長文記事で chunked generation が走ることを確認する
  - API key 未設定または provider error で failed track が表示されることを確認する
  - client bundle に secret が含まれないことを確認する
- Known limitations:
  - provider 選定と本番 endpoint 実行基盤が未確定の場合、このタスクは API contract までを先に固定する
  - 永続 cache と容量管理は別タスクで扱う

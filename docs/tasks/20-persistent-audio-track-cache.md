# 生成済み音声を永続キャッシュする

## 1. Task Summary

- Goal: 生成済み音声を article id と narration version 単位で再利用できる永続 cache に保存し、リロード後の重複生成を減らす
- User value: 同じ記事を聴くたびの生成待ち時間と API cost を抑え、スマホでの再生開始を速くできる
- Related priorities: smartphone playback UX, natural listening experience, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - `docs/tasks/08-audio-track-generation-cache.md`
  - Issue #19 `MVP: 生成済み音声を永続キャッシュする` <https://github.com/kab0718/blog-audio/issues/19>
  - 現状実装: `src/app/tracks/AudioTrackContext.tsx`, `src/tracks/audioTrackService.ts`, `src/types/audioTrack.ts`

## 2. Scope

### In scope

- 生成済み `AudioTrack` metadata を永続化する
- 再生可能 resource の保存先または再取得方法を定義する
- cache key に article id と narration version を含める
- stale / incompatible cache を誤用しないようにする
- cache hit 時に TTS provider 呼び出しを省略する
- quota error、storage unavailable、cache 破損時に通常生成へ fallback する
- UI と player は既存の `AudioTrack` 契約を維持する

### Out of scope

- 完全な offline playback
- ユーザーアカウント間同期
- 高度な容量管理 UI
- Podcast 配信
- 複数端末同期
- 長期保存用 storage 運用設計の完成版

### Assumptions

- browser 内保存にする場合は IndexedDB が第一候補
- 初期実装では metadata と resource URL の復元から始める
- object URL はリロード後に使えないため、永続化するなら Blob / ArrayBuffer または再取得可能 URL が必要
- narration version が変わったら古い audio track は cache miss として扱う

## 3. UX / Behavior

### Primary flow

- ユーザーが記事を再生する
- track service は article id と narration version で cache を確認する
- cache hit なら TTS 生成を省略し、ready track として player に渡す
- cache miss なら通常どおり narration script から音声生成する
- 生成成功後、metadata と再生 resource を cache に保存する

### Important states / edge cases

- cache payload が壊れている場合は破棄し、通常生成へ進む
- storage quota に達した場合は保存を諦め、再生自体は継続する
- narration version が変わった場合は古い track を使わない
- resource URL が期限切れの場合は cache stale として再生成または再取得する
- cache hit した track でも audio load に失敗したら通常生成へ fallback する

## 4. Requirements

### Functional requirements

- `articleId + narrationVersion` で cache key を作れる
- ready track metadata を永続保存できる
- playback resource をリロード後に再生可能な形で復元できる、または再取得できる
- cache hit 時に TTS provider 呼び出しを省略できる
- cache miss / stale / corrupt 時は通常生成へ fallback できる
- storage error や quota error でアプリがクラッシュしない
- `AudioTrack` の共通契約を維持する

### Non-functional constraints

- cache 実装は UI から隠し、track service / repository の責務にする
- browser storage の容量を無制限に使わない
- 新しい外部依存は必要性が明確な場合だけ追加する
- raw article text や raw code block を cache fallback として音声化しない
- API cost と待ち時間削減のための MVP 最小実装に留める

## 5. Technical Approach

### Proposed approach

- `src/tracks/` に audio track cache repository を追加し、`getCachedTrack`, `putCachedTrack`, `deleteCachedTrack` 相当を提供する
- cache key は `articleId`, `narrationVersion`, `voice/provider` の最小要素から作る
- browser 永続化は IndexedDB を第一候補にし、metadata と Blob / ArrayBuffer を保存する
- resource が URL の場合、URL の寿命を判定できないなら metadata だけを信用しない
- `AudioTrackContext.ensureTrackForArticle()` の前段で cache lookup を行い、hit すれば state に ready track を入れる
- generation 成功後に cache write を試し、失敗しても ready track の再生は継続する

### Data / API / state considerations

- `AudioTrack.narrationVersion` は cache validation に必須
- 実 TTS provider を導入する場合、voice / model / language も cache compatibility に含める可能性がある
- Blob から復元した resource は `URL.createObjectURL()` で playback URL を作り、不要時の revoke 方針を決める
- cache schema version を payload に含め、互換性がない payload は miss として扱う

### Dependencies

- `docs/tasks/08-audio-track-generation-cache.md`
- `docs/tasks/17-real-tts-audio-generation.md`
- `docs/tasks/18-production-api-boundary.md` の resource URL / storage 方針
- 主な対象は `src/app/tracks/AudioTrackContext.tsx`, `src/tracks/audioTrackService.ts`, `src/types/audioTrack.ts`, 新規 cache repository

## 6. Risks / Open Questions

- IndexedDB に audio binary を保存する場合、容量上限と eviction 挙動がブラウザ依存になる
- provider が短命 URL を返す場合、URL だけの永続化では replay できない
- Blob object URL の revoke timing を誤ると再生中 resource が消える可能性がある
- narration version の定義が粗いと古い音声を誤用する
- 完全 offline に近づけると scope が広がるため、MVP では「重複生成削減」を目的に絞る

## 7. Acceptance Criteria

- 生成済み track が article id + narration version で cache される
- リロード後、利用可能な cache があれば TTS provider 呼び出しを省略できる
- narration version が変わった場合、古い cache を誤用しない
- cache miss / stale / corrupt の場合は通常生成へ fallback できる
- storage 不可や quota error でもアプリがクラッシュしない
- `AudioTrack` の共通契約を維持する
- `npm run build` が通る

## 8. Implementation Plan

1. 現状の `AudioTrack` と `NarrationScript.version` の関係を確認し、cache key に含める互換性要素を決める
2. audio track cache repository を追加し、schema validation と IndexedDB read / write / delete を実装する
3. `ensureTrackForArticle()` の flow を cache lookup、in-flight dedupe、generation、cache write の順に整理する
4. Blob / ArrayBuffer または再取得 URL から `PlaybackResource` を復元する処理を実装する
5. stale / corrupt / incompatible payload の検出と通常生成 fallback を実装する
6. storage error / quota error / audio load error の fallback を手動確認する
7. `npm run build` を実行し、リロード後の cache hit と narration version mismatch を確認する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - 記事を再生して track が cache に保存されることを確認する
  - リロード後に同じ記事を再生し、TTS provider 呼び出しが省略されることを確認する
  - narration version を変えた場合、古い cache が使われないことを確認する
  - cache payload を壊しても通常生成へ fallback することを確認する
  - storage quota / unavailable を模擬してもアプリがクラッシュしないことを確認する
- Known limitations:
  - このタスクでは完全 offline playback と容量管理 UI は扱わない
  - provider の短命 URL だけでは永続再生できないため、resource 保存方式は実 TTS 実装と合わせて確定する

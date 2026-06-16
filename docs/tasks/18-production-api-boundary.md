# 本番用 API 境界を実装する

## 1. Task Summary

- Goal: 記事取得、本文取得、TTS 音声生成を client 直呼びから server-side / edge API 境界へ寄せる
- User value: スマホで使える MVP として、API key 保護、CORS、rate limit、cache を client から分離して安定動作させられる
- Related priorities: smartphone playback UX, natural listening experience, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - `docs/tasks/03-zenn-article-list-ingestion.md`
  - `docs/tasks/04-qiita-article-list.md`
  - `docs/tasks/05-article-content-structure-extraction.md`
  - Issue #17 `MVP: 本番用API境界を実装する` <https://github.com/kab0718/blog-audio/issues/17>
  - 現状実装: `vite.config.ts`, `src/sources/zenn/articles.ts`, `src/sources/qiita/articles.ts`, `src/tracks/audioTrackService.ts`

## 2. Scope

### In scope

- client が同一 origin API contract を呼ぶ設計にする
- Zenn / Qiita 記事一覧と本文取得を API 境界越しに扱えるようにする
- TTS provider 呼び出しを server-side / edge endpoint に閉じる
- API key や secret を browser bundle に含めない環境変数設計にする
- rate limit、timeout、unsupported response shape を共通 error に正規化する
- MVP 用の軽量 cache 方針を API 境界に置ける構造にする
- dev / production で client 側の呼び出し contract を揃える

### Out of scope

- ユーザーアカウント
- 課金管理
- 高度な observability
- 複数 provider の完全抽象化
- CDN / object storage の本格運用設計
- native app 化

### Assumptions

- 現状の Vite proxy は dev 専用の便宜とし、本番 contract は別途同一 origin API として定義する
- client は `/api/articles`, `/api/article-content`, `/api/tts` 相当の自前 endpoint を呼ぶ
- Zenn の非公式 API 依存は API 境界内へ閉じる
- TTS endpoint は issue #16 の実 TTS 生成と接続する

## 3. UX / Behavior

### Primary flow

- ユーザーが記事一覧を開く
- client は本番でも同一 origin API へ記事一覧取得を要求する
- API 境界が外部 source を呼び、正常化した `Article[]` を返す
- 記事再生時、client は本文取得と TTS 生成を同一 origin API 経由で進める
- 外部 API 失敗時は共通 error として UI に渡され、raw provider response を表示しない

### Important states / edge cases

- Zenn rate limit 時は stale cache または部分失敗許容で記事一覧全体の破綻を避ける
- Qiita だけ成功した場合は Qiita 記事を表示できる
- TTS provider timeout は failed track として扱う
- unsupported response shape は API 境界で検出し、client contract を壊さない
- secret 未設定時は startup または request error として明示する

## 4. Requirements

### Functional requirements

- client は Zenn / Qiita / TTS provider の secret や内部 URL に直接依存しない
- production build / preview 相当でも同一 origin API contract を呼べる
- 記事一覧 API は `Article[]` または正規化 error を返す
- 本文取得 API は source ごとの差を隠し、抽出 pipeline が扱える input を返す
- TTS API は `NarrationScript` または chunks を受け、再生可能 resource 情報を返す
- provider 固有 error は API 境界で正規化される
- rate limit / timeout / unsupported shape を client が同じ分類で扱える

### Non-functional constraints

- API key や secret を client JS に含めない
- client 側の `Article`, `RawArticleContentInput`, `AudioTrack` 契約を壊さない
- cache は MVP に必要な範囲に留め、過度な運用設計を持ち込まない
- 新しい runtime / deployment 前提を導入する場合は docs に明記する
- code block を raw narration に戻す fallback を作らない

## 5. Technical Approach

### Proposed approach

- client source adapter は provider URL ではなく app API URL を呼ぶようにする
- API 境界内に Zenn / Qiita / TTS provider adapter を配置し、response normalization と error normalization を担当させる
- `ApiError` 形を定義し、`code`, `message`, `retryAfterSeconds` など UI に必要な最小情報へ正規化する
- Zenn daily popular / content fetch の cache key と rate limit handling を API 側へ移せるようにする
- TTS endpoint は secret を server-side env から読み、provider response を `PlaybackResource` に必要な形へ変換する
- dev では Vite proxy または local server、production では edge/server function で同じ path contract を使う

### Data / API / state considerations

- client contract は source 固有 field を含めず、既存型に合わせる
- timeout と retry-after は source provider ごとに検出し、共通 error code に変換する
- cache payload は article source、order、date、narration version などを key に含める
- TTS resource URL の寿命が短い場合は、永続 cache タスクと連携して再取得方法を定義する

### Dependencies

- `docs/tasks/17-real-tts-audio-generation.md`
- `docs/tasks/19-persisted-queue-playback-restore.md` とは直接依存しないが復元時の再取得 contract に関係する
- `docs/tasks/20-persistent-audio-track-cache.md`
- 主な対象は API layer、新規 server / edge files、既存 client source adapters

## 6. Risks / Open Questions

- この repo の本番実行環境が未確定で、Vite 単体では server-side endpoint を提供できない
- Edge runtime を使う場合、audio binary handling や provider SDK 利用可否に制限がある
- TTS 音声ファイルを endpoint response として返すか、storage URL として返すかの判断が必要
- Zenn 非公式 API の shape 変化にどこまで追従するかは運用判断が必要
- server-side cache の保存先は MVP では memory / platform cache / browser cache のどれに寄せるか決める必要がある

## 7. Acceptance Criteria

- production 相当の build / preview でも client が同一 origin API contract を呼べる
- API key や secret が client JS に含まれない
- Zenn / Qiita / TTS の外部 request が server-side / edge 境界に閉じている
- rate limit / timeout / unsupported response shape が共通 error として扱える
- 既存の article library / track generation / player UI の contract を壊さない
- `npm run build` が通る

## 8. Implementation Plan

1. 本番実行環境の前提を確認し、API endpoint の配置場所と path contract を決める
2. client source adapters が呼ぶ URL を同一 origin API contract に寄せる設計へ更新する
3. API 境界に Zenn / Qiita 記事一覧・本文取得 adapter を移し、既存 `Article` / `RawArticleContentInput` へ正規化する
4. TTS endpoint を追加し、secret を server-side env から読み込む構造にする
5. 共通 error response と timeout / rate limit / unsupported shape の扱いを実装する
6. MVP 用 cache key と cache placement を定義し、Zenn rate limit と TTS 重複生成を抑えられる形にする
7. `npm run build` と dev / preview 相当の手動確認を行い、client bundle に secret が入らないことを確認する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - client が外部 provider ではなく同一 origin API を呼ぶことを Network tab で確認する
  - secret 値が client bundle に含まれないことを確認する
  - Zenn / Qiita の片方失敗時に記事一覧が可能な範囲で表示されることを確認する
  - TTS provider error が failed track として表示されることを確認する
  - rate limit / timeout の error response が UI で raw response にならないことを確認する
- Known limitations:
  - deployment target が未確定の場合、API 境界の contract と local implementation を先に固定し、本番 adapter は別 PR に分ける可能性がある

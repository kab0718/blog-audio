# API 境界

このアプリの client は外部 provider を直接呼ばず、同一 origin の API contract を呼ぶ。

## Endpoints

- `GET /api/articles?source=zenn&order=daily`
  - Zenn のデイリー人気記事を取得し、共通 `Article[]` として返す。
- `GET /api/articles?source=qiita`
  - Qiita の記事一覧を取得し、共通 `Article[]` として返す。
- `GET /api/article-content?source={zenn|qiita}&articleId=...&sourceArticleId=...&url=...`
  - provider 固有の本文取得を API 境界に閉じ、`RawArticleContentInput` として返す。
- `POST /api/tts`
  - `NarrationScript.textChunks` 相当の chunks を受け取り、Google Cloud Text-to-Speech で音声を生成する。
  - response は `{ audioBase64, mimeType, durationSeconds, source }`。
  - 同じ narration version / chunk / voice の生成結果は MVP 用の in-memory cache に保持する。

## Error contract

API error response は provider 固有 payload を client へ漏らさず、次の形へ正規化する。

```json
{
  "code": "provider_request_failed",
  "message": "Provider request failed",
  "retryAfterSeconds": 60
}
```

- `retryAfterSeconds` は provider の `Retry-After` が解釈できる場合だけ含める。
- rate limit は `code: "rate_limited"`、timeout は `code: "provider_timeout"` として返す。
- 外部 provider response shape が想定外の場合は `code: "unsupported_response_shape"` として返す。

## Runtime

- local development と `npm run preview` では `server/blogAudioApi.ts` を Vite middleware として使う。
- 本番配信では同じ endpoint contract を server / edge function に移植する。
- Google Cloud 認証情報、service account key、provider secret は server-side だけで扱い、client bundle には含めない。
- `VITE_TTS_PROVIDER=local-preview` を設定すると、実 TTS ではなく local preview adapter を使う。未設定時の TTS provider failure は failed track として扱う。

## Google Cloud Text-to-Speech 設定

- Google Cloud project、billing、Cloud Text-to-Speech API、budget alert は issue #22 で準備済み。
- local development は Application Default Credentials を使う。
  - `gcloud auth application-default login`
  - `gcloud auth application-default set-quota-project <project-id>`
- service account key JSON を使う場合は `GOOGLE_APPLICATION_CREDENTIALS` に local path だけを設定し、key file は repository に含めない。
- production は deployment target の secret manager / workload identity / service account attachment を優先し、key file の直置きは避ける。
- `VITE_` prefix 付き環境変数に credential や provider secret を入れない。

```env
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_TTS_LANGUAGE_CODE=ja-JP
GOOGLE_CLOUD_TTS_VOICE=ja-JP-Neural2-B
GOOGLE_CLOUD_TTS_AUDIO_ENCODING=MP3
GOOGLE_CLOUD_TTS_API_KEY=
```

## TTS 方針

- TTS 入力は `generateNarrationScript()` の出力だけに限定する。
- raw article body や raw code block は `/api/tts` に渡さない。
- Google Cloud Text-to-Speech の初期 voice は `ja-JP-Neural2-B`、language code は `ja-JP`、audio encoding は `MP3` を使う。
- narration chunks は順序どおりに生成し、API 境界で 1 記事 = 1 track の再生可能 resource に正規化する。
- provider 入力上限を超える chunk は API 境界で sentence-aware に再分割する。

## Cache

- Zenn / Qiita の記事一覧は API 境界の in-memory cache に短時間保持する。
- 記事本文は source article id ごとに API 境界の in-memory cache に保持する。
- provider request が rate limit / timeout / 一時失敗した場合、stale cache があれば stale payload を返して article library 全体の破綻を避ける。

## Cost control

- Google Cloud Billing budget alert は設定済み。ただし budget alert は通知であり、課金の hard cap ではない。
- 永続 audio cache が入るまでは、同じ記事の TTS 生成を不必要に繰り返さない。
- 必要に応じて Cloud Text-to-Speech quota を確認し、MVP 運用に合う上限を設定する。

## Limitations

- Vite middleware は MVP 用の local implementation であり、本番運用では同じ contract の server / edge 実装が必要。
- 現行の `/api/tts` adapter は Google Cloud Text-to-Speech の MP3 生成に対応している。
- 生成済み音声の永続 cache と容量管理は [20-persistent-audio-track-cache.md](./tasks/20-persistent-audio-track-cache.md) の範囲。
- PWA / background / lock screen の挙動確認は [21-pwa-mobile-device-playback-validation.md](./tasks/21-pwa-mobile-device-playback-validation.md) の範囲。

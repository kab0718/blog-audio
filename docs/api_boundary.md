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
  - `NarrationScript.textChunks` 相当の chunks を受け取り、OpenAI Speech API で WAV 音声を生成する。
  - response は `{ audioBase64, mimeType, durationSeconds, source }`。

## Runtime

- local development と `npm run preview` では `server/blogAudioApi.ts` を Vite middleware として使う。
- 本番配信では同じ endpoint contract を server / edge function に移植する。
- `OPENAI_API_KEY` は server-side 環境変数として扱い、client bundle には含めない。
- `VITE_TTS_PROVIDER=local-preview` を設定すると、実 TTS ではなく local preview adapter を使う。

## TTS 方針

- TTS 入力は `generateNarrationScript()` の出力だけに限定する。
- raw article body や raw code block は `/api/tts` に渡さない。
- OpenAI Speech API には `gpt-4o-mini-tts`、voice `marin`、`response_format: "wav"` を使う。
- narration chunks は順序どおりに生成し、API 境界で 1 つの WAV に連結して返す。

## Limitations

- Vite middleware は MVP 用の local implementation であり、本番運用では同じ contract の server / edge 実装が必要。
- 生成済み音声の永続 cache と容量管理は [20-persistent-audio-track-cache.md](./tasks/20-persistent-audio-track-cache.md) の範囲。
- PWA / background / lock screen の挙動確認は [21-pwa-mobile-device-playback-validation.md](./tasks/21-pwa-mobile-device-playback-validation.md) の範囲。

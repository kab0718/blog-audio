# Google Cloud Text-to-Speech 利用準備と認証設定

## 1. Task Summary

- Goal: Google Cloud Text-to-Speech へ TTS provider を切り替える前提として、Google Cloud 側の project / billing / API / 認証 / budget 設定を整える
- User value: provider 差し替え実装時に credential 管理や課金設定で止まらず、server-side API 境界から安全に TTS を呼べる
- Related priorities: natural listening experience for technical articles, correct handling of code blocks, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - `docs/api_boundary.md`
  - Issue #22 `MVP: Google Cloud Text-to-Speech利用準備と認証設定を整える` <https://github.com/kab0718/blog-audio/issues/22>

## 2. Scope

### In scope

- Google Cloud project を用意する
- billing account を project に紐付ける
- Cloud Text-to-Speech API を有効化する
- local development 用の認証方式を決める
- production 用の認証方式を決める
- service account を使う場合の secret 管理方針を決める
- `.env` に入れる値を決める
- budget alert / usage monitoring を設定する
- 利用 voice の初期候補を決める

### Out of scope

- `/api/tts` の Google Cloud adapter 差し替え
- 永続音声 cache
- Cloud Storage への音声保存
- PWA / 実機再生検証

## 3. Completed Setup

- Google Cloud project は準備済み
- billing account は project に紐付け済み
- Cloud Text-to-Speech API は有効化済み
- Billing budget alert は設定済み
- local development は Application Default Credentials を使う方針に決定済み
- ADC による Cloud Text-to-Speech smoke test で MP3 生成を確認済み
- smoke test 用の JSON と生成物は repository から削除済み

## 4. Environment Contract

```env
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_TTS_LANGUAGE_CODE=ja-JP
GOOGLE_CLOUD_TTS_VOICE=ja-JP-Neural2-B
GOOGLE_CLOUD_TTS_AUDIO_ENCODING=MP3
```

service account key JSON を local で使う場合のみ、path を設定する。

```env
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

`GOOGLE_APPLICATION_CREDENTIALS` が指す key file は repository に含めない。

## 5. Authentication Policy

### Local development

local development は Application Default Credentials を使う。

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

### Production

- deployment target が Google Cloud の場合は、実行環境に service account を attach する
- deployment target が Google Cloud 外の場合は、platform secret / workload identity / environment secret を優先する
- service account key file の直置きは避ける
- credential や provider secret は server-side だけで扱い、client bundle へ含めない
- `VITE_` prefix 付き env に secret を入れない

## 6. Initial TTS Settings

- `languageCode`: `ja-JP`
- `voice`: `ja-JP-Neural2-B`
- `audioEncoding`: `MP3`

voice は後続の listening check で変更してよいが、cache compatibility のため voice / language / encoding は cache key に含められる形で扱う。

## 7. Cost Controls

- Billing budget alert は設定済み
- budget alert は通知であり、課金停止の hard cap ではない
- 永続 audio cache が入るまでは、同じ記事を不要に繰り返し生成しない
- 必要に応じて Cloud Text-to-Speech quota を確認し、MVP 運用に合う上限を設定する

## 8. Acceptance Criteria

- Google Cloud project が用意されている
- billing が有効化されている
- Cloud Text-to-Speech API が有効化されている
- local development で使う認証方式が決まっている
- production で使う認証方式の方針が決まっている
- repository に secret / service account key を commit しない方針が明記されている
- 初期 voice / languageCode / audioEncoding が決まっている
- budget alert が設定されている
- 後続の Google Cloud TTS adapter 実装時に使う環境変数名が決まっている

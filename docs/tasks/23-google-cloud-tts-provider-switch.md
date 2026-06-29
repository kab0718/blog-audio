# Google Cloud Text-to-Speech へ TTS provider を切り替える

## 1. Task Summary

- Goal: `/api/tts` の server-side provider adapter を OpenAI Speech API から Google Cloud Text-to-Speech へ差し替え、client の同一 origin API contract は維持する
- User value: 技術記事を 1 記事 = 1 トラックとして実音声再生する MVP 体験を、今後利用する Google Cloud TTS 前提で確認できる
- Related priorities: natural listening experience for technical articles, correct handling of code blocks, smartphone playback UX, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - `docs/api_boundary.md`
  - `docs/tasks/17-real-tts-audio-generation.md`
  - `docs/tasks/18-production-api-boundary.md`
  - `docs/tasks/22-google-cloud-text-to-speech-setup.md`
  - Issue #21 `MVP: Google Cloud Text-to-SpeechへTTS providerを切り替える` <https://github.com/kab0718/blog-audio/issues/21>
  - 現状実装: `server/blogAudioApi.ts`, `src/tracks/realTtsAdapter.ts`, `src/tracks/audioTrackService.ts`, `src/types/audioTrack.ts`, `vite.config.ts`

## 2. Scope

### In scope

- `/api/tts` の provider 呼び出しを Google Cloud Text-to-Speech に変更する
- `OPENAI_API_KEY` / OpenAI Speech API 固有の model / voice / WAV 前提処理を廃止または legacy 扱いにする
- issue #22 で決めた Google Cloud 用 env contract を server-side で読む
- `NarrationScript.textChunks` を順序どおり Google Cloud TTS に渡す
- provider input limit を超える chunk は sentence-aware に再分割する
- Google Cloud TTS response の `audioContent` を既存 `/api/tts` response の `audioBase64`, `mimeType`, `durationSeconds`, `source` へ正規化する
- `AudioTrackSource` と client-side adapter の source 名を `google-cloud-tts` へ更新する
- provider error / credential 未設定 / unsupported response shape を failed track に接続する
- `.env.example`, `README.md`, `docs/api_boundary.md` を Google Cloud TTS 実装後の状態に更新する
- local preview fallback は開発用として維持する

### Out of scope

- Google Cloud project / billing / API enablement / budget alert の新規設定
- 永続音声キャッシュ
- Cloud Storage への音声保存
- 複数 voice の UI 切り替え
- ユーザー別課金やアカウント管理
- PWA / lock screen 実機検証

### Assumptions

- Google Cloud 利用準備と local ADC 方針は issue #22 で完了済み
- 初期 voice は `ja-JP-Neural2-B`、language code は `ja-JP`、audio encoding は `MP3` を使う
- MVP の provider は Google Cloud TTS 1 種類に寄せ、provider 抽象化を広げない
- client は引き続き `/api/tts` だけを呼び、credential や provider secret を持たない
- duration を provider response から正確に得られない場合は、既存どおり narration の推定 duration に fallback する

## 3. UX / Behavior

### Primary flow

- ユーザーが記事を再生する
- 記事本文から `generateNarrationScript()` が TTS-ready text chunks を生成する
- client adapter が `/api/tts` に `NarrationScript.textChunks` 由来の chunks を送る
- server-side adapter が chunks を Google Cloud TTS に渡し、MP3 音声を生成する
- `/api/tts` response が `PlaybackResource` に変換され、player で再生される
- 生成失敗時は track が failed になり、queue / player 全体はクラッシュしない

### Important states / edge cases

- credential 未設定時は `tts_credential_missing` 相当の分かる error を返す
- Google Cloud TTS が rate limit / timeout / provider error を返した場合は既存 error contract へ正規化する
- Google Cloud TTS response に `audioContent` がない場合は `unsupported_response_shape` として扱う
- 長文 chunk は provider limit に収まるよう再分割し、生成順序を維持する
- raw article body や raw code block は provider に渡さない
- `VITE_TTS_PROVIDER=local-preview` の場合は Google Cloud を呼ばず preview tone を使う

## 4. Requirements

### Functional requirements

- `/api/tts` は OpenAI Speech API へ request しない
- `/api/tts` は Google Cloud Text-to-Speech `text:synthesize` 相当の server-side request で音声を生成する
- API request body は `NarrationScript.textChunks` 由来の `id`, `order`, `text` を受け付け、`order` 順に処理する
- API response は既存 client contract の `{ audioBase64, mimeType, durationSeconds, source }` を維持する
- `source` は Google Cloud TTS 由来であることが分かる値にする
- credential / provider secret は client bundle に含めない
- local preview fallback は明示的に選べる
- failed track に表示できる短い error message を返す

### Non-functional constraints

- mobile player / queue UI は provider 固有 response に依存しない
- code block を逐語読みする fallback を追加しない
- 新しい外部依存は、Google Cloud TTS 呼び出しに明確に必要な場合だけに留める
- provider 切り替えで `/api/articles` と `/api/article-content` の contract を変えない
- 同じ narration version / chunk / voice / language / encoding の in-memory cache key が衝突しない

## 5. Technical Approach

### Proposed approach

- `vite.config.ts` から `blogAudioApiPlugin` に Google Cloud TTS 設定を渡す
- `server/blogAudioApi.ts` の OpenAI 定数と `generateOpenAiSpeech()` を Google Cloud TTS adapter 関数へ置き換える
- Google Cloud TTS REST endpoint へ ADC または API key 方針に沿った認証で request する
- provider request は `input.text`, `voice.languageCode`, `voice.name`, `audioConfig.audioEncoding` を明示する
- Google Cloud response の `audioContent` base64 を既存 response へそのまま載せ、`mimeType` は encoding から決める
- `buildTtsCacheKey()` に provider, voice, languageCode, audioEncoding, narrationVersion, chunks を含める
- `src/types/audioTrack.ts`, `src/tracks/audioTrackService.ts`, `src/tracks/realTtsAdapter.ts`, `src/tracks/localPreviewTtsAdapter.ts` の source 名を更新する
- README / `.env.example` / `docs/api_boundary.md` から OpenAI legacy 記述を削り、Google Cloud TTS 実装済みの説明へ揃える

### Data / API / state considerations

- `/api/tts` client contract は維持し、provider 差し替えを client UI へ漏らさない
- `AudioTrack.source` は `local-preview` または `google-cloud-tts` のどちらかにする
- `durationSeconds` は推定値 fallback を許容し、正確な音声長解析はこのタスクでは必須にしない
- Google Cloud TTS の quota / billing 設定は runtime error ではなく運用前提として issue #22 に残す

### Dependencies

- `docs/tasks/22-google-cloud-text-to-speech-setup.md` が完了済みであること
- `docs/tasks/17-real-tts-audio-generation.md` の `/api/tts` contract と track state が維持されていること
- 主な対象は `server/blogAudioApi.ts`, `vite.config.ts`, `src/tracks/realTtsAdapter.ts`, `src/tracks/audioTrackService.ts`, `src/types/audioTrack.ts`, `.env.example`, `README.md`, `docs/api_boundary.md`

## 6. Risks / Open Questions

- Google Cloud TTS を REST で呼ぶ場合、ADC の access token 取得方法を Node/Vite middleware 内でどう扱うか決める必要がある
- API key 認証を使う場合、Text-to-Speech API の有効な認証方式と secret 管理方針を確認する必要がある
- MP3 chunk を単純連結してよいかは format 上の確認が必要で、問題があれば WAV/LINEAR16 生成または sequential playback へ寄せる
- 長文記事の複数 request は latency と cost が増えるため、永続 cache が入るまでは生成回数を抑える必要がある
- Google Cloud の voice 名や pricing は変わる可能性があるため、実装直前に公式 docs で再確認する

## 7. Acceptance Criteria

- `/api/tts` から OpenAI Speech API への request が発生しない
- Google Cloud Text-to-Speech で生成した音声が player で再生できる
- TTS provider に渡る input は `NarrationScript.textChunks` 由来だけで、raw article body / raw code block は渡らない
- API credential や service account key は client bundle に含まれない
- Google Cloud credential 未設定時は分かる error になり、アプリ全体はクラッシュしない
- `VITE_TTS_PROVIDER=local-preview` で local preview fallback を明示的に選べる
- `.env.example`, `README.md`, `docs/api_boundary.md` が Google Cloud TTS 実装後の env / contract と一致している
- `npm run build` が通る

## 8. Implementation Plan

1. Google Cloud TTS の認証方式を確定し、`blogAudioApiPlugin` options と server-side env 読み込みを `GOOGLE_CLOUD_*` 前提に変更する
2. `server/blogAudioApi.ts` の OpenAI Speech API 呼び出しを Google Cloud TTS synthesize 呼び出しへ置き換える
3. chunk 分割、cache key、provider error normalization を Google Cloud の input limit / response / error に合わせて更新する
4. `/api/tts` response を既存 contract に正規化し、`source: "google-cloud-tts"` と MP3 mime type を client へ返す
5. client の `AudioTrackSource`、default provider selection、real TTS adapter の source 名を Google Cloud TTS に揃える
6. `.env.example`, `README.md`, `docs/api_boundary.md` の OpenAI legacy 記述を削除または過去実装として整理し、Google Cloud TTS 前提に更新する
7. credential 未設定、provider error、local preview fallback、代表記事の実音声再生を手動確認し、`npm run build` を実行する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - Google Cloud credential 設定済み環境で記事を再生し、本文由来の音声が再生されることを確認する
  - コードブロックを含む記事で raw code が provider input に渡らないことを確認する
  - credential 未設定時に failed track へ接続され、アプリ全体がクラッシュしないことを確認する
  - `VITE_TTS_PROVIDER=local-preview` で Google Cloud を呼ばず preview tone が使われることを確認する
  - client bundle や `VITE_` env に credential が含まれないことを確認する
- Known limitations:
  - Google Cloud 実 request の確認には local ADC または server-side credential が必要
  - 実機 mobile playback や lock screen 挙動は `docs/tasks/21-pwa-mobile-device-playback-validation.md` の範囲
  - 永続音声 cache は `docs/tasks/20-persistent-audio-track-cache.md` の範囲

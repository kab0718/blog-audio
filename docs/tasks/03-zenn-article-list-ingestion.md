# Zenn 記事一覧を取り込み Article 形式へ正規化する

## 1. Task Summary

- Goal: Zenn の記事一覧を取得し、既存 UI と再生キューが扱える共通 `Article` 配列へ正規化する
- User value: まず Zenn から記事を選べる入口を作り、1記事=1トラックの MVP 体験を実データで検証できる
- Related priorities: smartphone playback UX, natural listening experience, continuous playback / queue behavior, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - `docs/tasks/02-domain-model.md`
  - Issue #3 `MVP: Zenn 記事一覧を取り込む` <https://github.com/kab0718/blog-audio/issues/3>
  - Zenn community examples for `/api/articles` <https://zenn.dev/h_ymt/articles/5e44b4967f6764/>

## 2. Scope

### In scope

- Zenn 全体の記事一覧を取得する provider を追加する
- Zenn の article response から MVP の `Article` 契約へ必要なメタ情報を正規化する
- `sourceType="zenn"`、詳細取得用の `sourceArticleId`、記事 URL を保持する
- 一覧表示用にタイトル、著者、source、推定再生時間、任意の summary / tags を供給できる形にする
- 取得中、空状態、取得失敗を記事一覧画面で扱える状態へ整理する
- 取得成功後の `Article[]` を既存の list / player / queue が共通 `Article` として扱えるようにする

### Out of scope

- Zenn 記事本文の詳細抽出、Markdown cleanup、コードブロック要約
- 音声生成、ストリーミング再生、キャッシュ保存
- Qiita 対応、複数 source の統合フィード、検索 / フィルタ
- username 指定、pagination、無限スクロール
- 本番環境向けの server-side ingestion / edge proxy

### Assumptions

- MVP の取得対象は Zenn 全体のデイリー人気記事一覧に固定する
- ブラウザは同一 origin の `/api/zenn/articles?order=daily` を呼び、Vite dev server が `https://zenn.dev/api/articles?order=daily` へ proxy する
- Zenn の endpoint は公式に安定保証された API として扱わず、response 変更や取得失敗に備えて正規化層で defensive に処理する
- `Article.summary` は実一覧で欠落しうるため、任意値として扱う
- 取得成功後にキューへ article ids を同期するが、自動再生は開始しない

## 3. UX / Behavior

### Primary flow

- ユーザーが記事一覧を開くと、Zenn のデイリー人気記事が既存の記事リスト UI に表示される
- 各 Zenn 記事には `Zenn` の source label、タイトル、著者、推定再生時間が表示される
- Zenn 記事を選択またはキューへ渡す後続処理へ、`Article.id`、`sourceArticleId`、`url` が渡せる
- 取得成功後、プレーヤーとキューは provider 固有の raw response ではなく共通 `Article` を参照する

### Important states / edge cases

- 取得中は記事一覧領域に loading state を表示し、既存レイアウトが崩れないようにする
- 取得結果が空配列の場合は empty state を表示する
- ネットワーク失敗や response shape の変更は error state として扱い、再試行導線を出す
- summary がない記事では summary 行を非表示にし、`undefined` や空文字を画面に出さない
- tags が取得できない場合は空配列にし、UI 側で provider 固有分岐を増やさない
- `body_letters_count` がない場合も暫定の `estimatedDurationSeconds` を補う

## 4. Requirements

### Functional requirements

- Zenn の一覧取得処理を provider 責務として UI から分離できる
- Zenn article から `Article.id`, `sourceType`, `sourceArticleId`, `title`, `author`, `url`, `estimatedDurationSeconds`, `tags`, `summary` を生成できる
- 生成される Zenn 記事には必ず `sourceType="zenn"` が設定される
- `Article.id` は `zenn:${sourceArticleId}` 形式にして他 source と衝突しない
- `url` は Zenn response の path から `https://zenn.dev${path}` を基本に生成する
- `author` は Zenn user の display name を優先し、なければ username を使う
- `estimatedDurationSeconds` は `body_letters_count` があれば 500 文字/分で概算し、なければ 5 分にする
- UI は `loading`, `success`, `empty`, `error` 相当の状態を表示できる
- 取得成功後の article ids を playback queue に同期できる
- 一覧、プレーヤー、キュー画面は Zenn 固有の raw response に直接依存しない

### Non-functional constraints

- provider 実装、正規化、画面表示、playback state 同期の責務を分ける
- 新しい外部依存は追加せず、まずは browser `fetch` と TypeScript の型で実装する
- Zenn endpoint の失敗でアプリ全体をクラッシュさせない
- スマホ幅で loading / empty / error / success の各状態が横スクロールや重なりを起こさない
- 本文やコードブロックを読み上げ用テキストとして扱わず、後続の narration pipeline に委ねる

## 5. Technical Approach

### Proposed approach

- `src/sources/zenn/` に provider 境界を作り、取得関数と mapper を分ける
- `fetchZennDailyPopularArticles()` は同一 origin の `/api/zenn/articles?order=daily` を呼び、成功時に `Article[]` を返す
- `toArticleFromZenn()` は Zenn article response の最小型から共通 `Article` へ変換する純粋関数にする
- 記事一覧画面は provider を直接叩くのではなく、article library hook / adapter 経由で `loading`, `articles`, `error`, `retry` を受け取る
- `Article.summary` を任意化し、view model は summary がある場合だけ一覧へ表示する
- `PlaybackContext` は初期状態を空 queue でも成立する形にし、取得成功後に article ids を受け取れる action を使う

### Data / API / state considerations

- Zenn response の詳細型は provider 内に閉じ、画面や playback state へ漏らさない
- `sourceArticleId` は response の stable id または slug 相当を使い、`id` は provider prefix 付きで生成する
- `tags` は一覧 API で取れない場合があるため、取得できた場合のみ article tag names へ正規化する
- `summary` は response に emoji / description 相当があれば短い表示用テキストとして使い、なければ未設定にする
- `AudioTrack` はこのタスクでは実生成しないため、実記事には `generating` 相当の fallback track status を表示できるようにする
- Vite dev server の proxy で Zenn の CORS 制約を回避する。本番環境では同等の server-side / edge proxy が必要になる

### Dependencies

- `docs/tasks/02-domain-model.md` で整理した `Article` / playback state 契約を前提にする
- 現状の `src/types/article.ts`, `src/data/mockLibrary.ts`, `src/view-models/library.ts`, `src/screens/articles/ArticleListScreen.tsx`, `src/app/playback/PlaybackContext.tsx` が主な接続箇所になる
- 後続の本文抽出、コードブロック要約、音声生成タスクは、このタスクで保持する `sourceArticleId` と `url` を利用する

## 6. Risks / Open Questions

- Zenn の `/api/articles` は公式に安定保証された API として扱えないため、response 変更で正規化が壊れる可能性がある
- 本番配信時は Vite dev proxy と同等の server-side / edge proxy を用意しないと、ブラウザからの直接取得は CORS で失敗する
- `body_letters_count` ベースの推定再生時間は本文抽出前の暫定値であり、TTS-ready text 生成後に置き換える必要がある
- 実 provider 導入により `PlaybackProvider` の初期 queue が非同期データへ依存するため、空 queue / current article なしの表示を丁寧に扱う必要がある
- `summary` の取得元が response に存在しない場合、一覧密度が下がるため UI 側で無理に placeholder を出さない

## 7. Acceptance Criteria

- Zenn 記事一覧取得の実装責務が UI から分離されている
- Zenn の取得結果を MVP の `Article` 配列へ変換できる
- 変換後の各記事に `sourceType="zenn"`、`sourceArticleId`、`url` が含まれている
- 既存の記事一覧 UI が Zenn 記事を provider 固有の raw response なしで表示できる
- 取得中、空状態、取得失敗を記事一覧画面で破綻なく扱える
- 取得成功後の article ids がキューへ同期され、プレーヤーとキューが共通 `Article` を参照できる
- `summary` がない記事でも一覧 UI が崩れない
- `npm run build` が通る

## 8. Implementation Plan

1. 現状の `Article` 契約、`mockLibrary`、`PlaybackContext`、記事一覧画面の依存関係を確認し、実 provider 導入時に残す mock / fallback の責務を決める
2. `Article.summary` を任意化し、view model と記事一覧 UI を summary なしでも表示できるようにする
3. Zenn article の最小 TypeScript 型、`toArticleFromZenn()`、`fetchZennDailyPopularArticles()` を `src/sources/zenn/` に追加する
4. 記事一覧の data source を mock 直参照から provider / hook / adapter 経由へ移し、loading / empty / error / success を表示できるようにする
5. Playback 初期状態と queue 同期を調整し、非同期取得前の空状態と取得成功後の article ids を扱えるようにする
6. App shell、player、queue の mock 直参照を必要最小限に減らし、共通 `Article` 参照へ寄せる
7. `npm run build` を実行し、スマホ幅の記事一覧で Zenn 記事、空状態、失敗表示が崩れないことを手動確認する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - スマホ幅で記事一覧を開き、Zenn デイリー人気記事が既存のリスト UI で表示されることを確認する
  - Zenn 記事の source label、著者、推定再生時間、summary なし表示がスマホ幅で重ならないことを確認する
  - Zenn 取得失敗時と空配列時に、記事一覧画面が横スクロールやクラッシュなしで表示されることを確認する
  - 取得成功後に queue 件数が記事一覧と同期し、player / queue が Zenn raw response なしで表示されることを確認する
- Known limitations:
  - このタスクでは記事本文の cleanup やコードブロック要約は実装しない
  - 非公式寄りの endpoint 依存のため、response shape の変化は実装時に実リクエストで確認が必要
  - Vite dev proxy は開発環境向けであり、本番配信には同等の server-side / edge proxy が必要
  - 推定再生時間と summary は、本文抽出タスクが入るまで暫定精度に留まる

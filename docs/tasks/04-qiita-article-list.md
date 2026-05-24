# Qiita 記事一覧を取り込み Article 形式へ正規化する

## 1. Task Summary

- Goal: Qiita の記事一覧を取得し、既存 UI と再生キューが扱える共通 `Article` 配列へ正規化する
- User value: Zenn と同じ記事トラック体験で Qiita 記事も選び、後続の再生・本文抽出・音声生成へ渡せる
- Related priorities: smartphone playback UX, continuous playback / queue behavior, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - `docs/tasks/02-domain-model.md`
  - Issue #4 `MVP: Qiita 記事一覧を取り込む` <https://github.com/kab0718/blog-audio/issues/4>
  - Qiita API v2 documentation <https://qiita.com/api/v2/docs>

## 2. Scope

### In scope

- Qiita の公開記事一覧を取得する provider を追加する
- Qiita の item response から MVP の `Article` 契約へ必要なメタ情報を正規化する
- `sourceType="qiita"`、詳細取得用の `sourceArticleId`、記事 URL を保持する
- 一覧表示用にタイトル、著者、タグ、要約または短い説明、推定再生時間を供給できる形にする
- 取得中、空状態、取得失敗を UI 側が provider 差分なしで扱える共通結果へ寄せる
- 既存の mock data 依存を、実 provider へ差し替えやすい境界に整理する

### Out of scope

- Qiita 記事本文の詳細抽出、Markdown cleanup、コードブロック要約
- 音声生成、ストリーミング再生、キャッシュ保存
- Zenn provider の実装変更または Zenn 側の取得仕様確定
- ログイン、個人アクセストークン管理、保存済み記事同期
- provider ごとの高度な検索 UI や詳細フィルタ

### Assumptions

- MVP では Qiita の公開記事一覧を非認証で取得する
- Qiita API v2 の非認証 rate limit は小さいため、初期表示で大量取得せず、少件数の取得に絞る
- `Article.id` は既存契約に合わせて `qiita:${sourceArticleId}` のような provider prefix 付き ID にする
- Qiita 側に読み上げ時間がないため、MVP では取得できる本文量または説明文から暫定の `estimatedDurationSeconds` を算出する
- 既存 UI は `Article` と view model を通して Qiita / Zenn を表示し、画面側で provider 固有の分岐を増やさない

## 3. UX / Behavior

### Primary flow

- ユーザーが記事一覧を開くと、Qiita 記事が既存の記事リストと同じ見た目で表示される
- 各 Qiita 記事には source label として `Qiita` が表示され、Zenn 記事と区別できる
- Qiita 記事を選択またはキューへ含める後続処理へ、`Article.id` と `sourceArticleId` と `url` が渡せる
- Qiita の取得結果が空の場合でも、記事一覧画面は壊れず、空状態として扱える

### Important states / edge cases

- 取得失敗時は provider 固有の例外を UI に漏らさず、共通の error state として扱う
- rate limit やネットワーク失敗は再試行可能な失敗として表現し、mock data と混在しても画面が破綻しない
- author 情報や tag が欠ける場合は、`Article` 契約を満たす安全な fallback を正規化層で補う
- URL や本文断片をそのまま長く一覧表示せず、スマホ幅で読める要約または短い説明へ抑える
- Qiita の Markdown 本文をこのタスクで読み上げ用テキストとして扱わない

## 4. Requirements

### Functional requirements

- Qiita の一覧取得処理を provider 責務として分離できる
- Qiita item から `Article.id`, `sourceType`, `sourceArticleId`, `title`, `author`, `url`, `estimatedDurationSeconds`, `tags`, `summary` を生成できる
- 生成される Qiita 記事には必ず `sourceType="qiita"` が設定される
- 詳細抽出タスクが使えるよう、Qiita item id と公開 URL を保持する
- UI に渡す取得結果は `loading`, `success`, `empty`, `error` 相当の状態を表現できる
- 一覧画面は Qiita 固有の raw response へ直接依存しない
- 既存の `mockArticles` は fallback または fixture として残しつつ、実 provider の戻り値と同じ `Article` 契約で扱える

### Non-functional constraints

- provider 実装、正規化、画面表示の責務を分ける
- Qiita API の rate limit を踏まえ、MVP では不要な連続リクエストや詳細取得を行わない
- 新しい外部依存は追加せず、まずは `fetch` と TypeScript の型で実装する
- UI 側の provider 分岐は `sourceLabel` 程度に留める
- 取得失敗時もモバイルの記事一覧レイアウトが横スクロールや重なりを起こさない
- コードブロックを読み上げない方針と矛盾しないよう、本文処理は後続の narration pipeline に委ねる

## 5. Technical Approach

### Proposed approach

- `src/services/articles/` または `src/features/articles/` 配下に provider 境界を作り、Qiita 一覧取得と正規化を UI から切り離す
- `QiitaItem` の最小 response 型を定義し、`normalizeQiitaItemToArticle` のような純粋関数で `Article` へ変換する
- 一覧取得関数は `fetchQiitaArticles` として `Article[]` ではなく、成功・空・失敗を表せる共通 result 型を返す
- `ArticleListScreen` は raw mock import から、記事一覧を供給する hook または adapter へ依存を移す
- 初期 MVP では query や page size を固定し、検索 UI や pagination は後続タスクへ回す

### Data / API / state considerations

- Qiita API v2 の公開 host は `qiita.com` で、公開データ取得にも HTTPS endpoint を使う
- Qiita API v2 は非認証アクセスに hourly rate limit があるため、初期表示では `per_page` を小さくし、詳細取得を同時に走らせない
- `sourceArticleId` は Qiita item の安定 ID を利用し、アプリ内 `id` は provider prefix 付きで衝突を避ける
- `tags` は Qiita item の tag names から生成し、空の場合は空配列にする
- `summary` は API で扱える本文または説明に由来する短い文字列へ正規化するが、読み上げ用本文とは別物として扱う
- `estimatedDurationSeconds` は暫定値であり、本文抽出と TTS-ready text 生成が入った段階で置き換え可能にする

### Dependencies

- `docs/tasks/02-domain-model.md` で定義された `Article` 契約を前提にする
- 現状の `src/types/article.ts`, `src/data/mockLibrary.ts`, `src/view-models/library.ts`, `src/screens/articles/ArticleListScreen.tsx` が主な接続箇所になる
- 後続の本文抽出、コードブロック要約、音声生成タスクは、このタスクで保持する `sourceArticleId` と `url` を利用する

## 6. Risks / Open Questions

- Qiita API の search query、pagination、並び順を MVP でどこまで固定するかは未決定
- 非認証 rate limit により、開発中やユーザー操作で簡単に上限へ達する可能性がある
- ブラウザから Qiita API を直接呼ぶ場合の CORS や rate limit の扱いは実装時に確認が必要
- `summary` と `estimatedDurationSeconds` の算出元は、本文詳細抽出タスクが入るまで暫定になりやすい
- 実 provider を導入すると `PlaybackProvider` の初期 queue が非同期データに依存するため、初期状態の持ち方を見直す必要がある
- Zenn provider が未実装の場合、共通 provider interface を Qiita だけで先に作るか、mock provider と並べて設計するかを決める必要がある

## 7. Acceptance Criteria

- Qiita 記事一覧取得の実装責務が UI から分離されている
- Qiita の取得結果を MVP の `Article` 配列へ変換できる
- 変換後の各記事に `sourceType="qiita"`、`sourceArticleId`、`url` が含まれている
- 既存の記事一覧 UI が Qiita 記事を provider 固有の raw response なしで表示できる
- 取得中、空状態、取得失敗を記事一覧画面で破綻なく扱える
- Qiita の詳細抽出タスクへ必要な識別子を渡せる
- `npm run build` が通る

## 8. Implementation Plan

1. 現状の `Article` 契約と `mockLibrary` の使われ方を確認し、Qiita provider が返すべき共通 result 型を決める
2. Qiita item の最小 TypeScript 型と `normalizeQiitaItemToArticle` を追加し、ID、URL、著者、タグ、要約、暫定再生時間の変換を実装する
3. Qiita 一覧取得関数を追加し、少件数取得、エラー捕捉、空配列の扱いを共通 result 型へ寄せる
4. 記事一覧の data source を mock 直参照から provider / hook / adapter 経由へ移し、loading / empty / error / success を表示できるようにする
5. Playback 初期状態と queue 生成が非同期記事一覧でも壊れないよう、現在記事なしの状態と queue 更新の境界を調整する
6. mock data または fixture で正規化ロジックを確認できる最小の検証を追加し、必要に応じて手動確認用の開発表示を整える
7. `npm run build` を実行し、スマホ幅の記事一覧で Qiita 記事、空状態、失敗表示が崩れないことを手動確認する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - スマホ幅で記事一覧を開き、Qiita 記事が既存の Zenn / mock 記事と同じリスト UI で表示されることを確認する
  - Qiita 記事の source label、著者、推定再生時間、タグ、summary がスマホ幅で重ならないことを確認する
  - Qiita 取得失敗時と空配列時に、記事一覧画面が横スクロールやクラッシュなしで表示されることを確認する
  - Qiita 記事の `sourceArticleId` と `url` が後続の詳細抽出へ渡せる形で保持されていることを確認する
- Known limitations:
  - このタスクでは記事本文の cleanup やコードブロック要約は実装しない
  - 非認証 API の rate limit と CORS 挙動は実装時に実リクエストで確認が必要
  - 推定再生時間と summary は、本文抽出タスクが入るまで暫定精度に留まる

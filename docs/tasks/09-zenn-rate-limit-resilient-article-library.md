# Zenn API rate limit に備えて記事一覧取得を安定化する

## 1. Task Summary

- Goal: Zenn の記事一覧取得が rate limit や一時失敗に当たっても、キャッシュと部分失敗許容により記事ライブラリを破綻させない
- User value: Zenn が一時的に取得できない状態でも、直近の記事一覧や Qiita 記事を使って 1 記事 = 1 トラックの MVP 体験を続けられる
- Related priorities: smartphone playback UX, continuous playback / queue behavior, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - `docs/tasks/03-zenn-article-list-ingestion.md`
  - `docs/tasks/04-qiita-article-list.md`
  - Issue #14 `MVP: Zenn API rate limit に備えて記事一覧取得を安定化する` <https://github.com/kab0718/blog-audio/issues/14>
  - 現状実装: `src/sources/zenn/articles.ts`, `src/sources/qiita/articles.ts`, `src/app/articles/ArticleLibraryContext.tsx`

## 2. Scope

### In scope

- Zenn 記事一覧取得結果を日次 client-side cache し、同じローカル日付では再取得しない
- Zenn 記事一覧取得の同時重複 request を抑制する
- Zenn の 429 または一時失敗時に、利用可能な stale cache があれば記事一覧として返す
- Zenn response の `Retry-After` header を取得し、再試行抑制または error metadata に使える形で扱う
- Zenn / Qiita の一覧取得を部分失敗許容にし、片方が成功した場合は成功分の記事を表示する
- 全 source 失敗時のみ記事ライブラリ全体を error として扱う

### Out of scope

- server-side / edge proxy cache の実装
- Zenn endpoint の変更、pagination、username 指定、検索 / フィルタ
- Qiita 側の cache 実装
- 本文詳細取得や音声生成 cache の変更
- `React.StrictMode` の削除
- 取得失敗履歴や source 別 status を表示する詳細 UI

### Assumptions

- 初期 MVP では `localStorage` に `Article[]`、保存時刻、取得対象日を持つ軽量 cache で十分とする
- 「1 日 1 回」はブラウザのローカル日付 `YYYY-MM-DD` 単位で判定し、同じ日付では Zenn へ再取得しない
- 当日中に Zenn 取得へ失敗した場合も取得試行済みとして扱い、同じ日付では自動 retry しない
- 前日以前の cache は日次更新対象だが、外部 API が失敗した場合の stale fallback として利用してよい
- `Retry-After` は秒数形式を優先して扱い、HTTP date 形式は必要なら防御的に parse する
- UI は当面、source 別の warning 表示までは必須にせず、取得できた記事を優先して表示する

## 3. UX / Behavior

### Primary flow

- ユーザーが記事一覧を開くと、当日分の Zenn cache があれば外部 request なしで cached articles を表示できる
- 当日分の cache がない場合だけ Zenn API を 1 回呼び、成功時に cache の取得対象日を当日に更新する
- 同じタイミングで複数の Zenn 一覧取得要求が来ても、同一の in-flight request を共有する
- Zenn が失敗して Qiita が成功した場合、記事一覧には Qiita 記事を表示し、アプリ全体を error にしない

### Important states / edge cases

- Zenn が 429 を返し、stale cache がある場合は cached Zenn 記事を使って成功扱いにできる
- Zenn が 429 を返し、cache がない場合でも Qiita が成功していれば `success` または `empty` を Qiita 結果で判定する
- Zenn と Qiita の両方が失敗した場合だけ `error` とし、retry 操作でも Zenn は日次取得制約に従う
- 当日分の取得をすでに試みた後は、明示的な retry や StrictMode の二重 effect でも Zenn に再アクセスしない
- cache の JSON parse に失敗した場合は cache を無効扱いにし、アプリをクラッシュさせない
- cached articles も provider 固有の raw response ではなく、共通 `Article` 形式だけを保存・復元する

## 4. Requirements

### Functional requirements

- `fetchZennLatestArticles()` は当日分の cache がある場合、外部 request なしで `Article[]` を返せる
- `fetchZennLatestArticles()` は in-flight request を共有し、同時呼び出しで同じ Zenn endpoint を複数回叩かない
- Zenn response が成功した場合、正規化済み `Article[]` と保存時刻を cache へ保存できる
- Zenn response が失敗した場合も当日の取得試行日を保存し、同じ日付での再取得を抑制できる
- Zenn response が 429 または fetch 失敗の場合、利用可能な stale cache があればそれを返せる
- Zenn response の `Retry-After` を読み取り、日次取得に失敗した場合の短時間再試行抑制 metadata として保持できる
- `ArticleLibraryContext` は Zenn / Qiita を `Promise.all` の全失敗連鎖にせず、source ごとの成功・失敗を集約できる
- 片方の source が成功した場合、取得できた `Article[]` で `success` / `empty` を決定できる
- 両 source が失敗した場合、日次取得制約と矛盾しない error message を設定できる

### Non-functional constraints

- 記事一覧 cache は article ingestion の責務に閉じ、画面や playback state に provider 固有実装を漏らさない
- 新しい外部依存は追加せず、browser storage と `fetch` で実装する
- cache 破損、storage 不可、quota error が起きても記事一覧全体をクラッシュさせない
- mobile UI の主要導線を増やさず、取得できる記事を表示することを優先する
- Zenn の非公式 endpoint 依存を前提に、防御的な error handling を保つ

## 5. Technical Approach

### Proposed approach

- `src/sources/zenn/articles.ts` に cache key、日次取得判定、retry suppression の定数と、storage 読み書き helper を追加する
- `fetchZennLatestArticles()` の外側に module-level の in-flight promise を持ち、同時取得を dedupe する
- cache hit 判定は cache の取得対象日がブラウザのローカル日付と一致するかを基本にし、同じ日付では外部 request を省略する
- 外部 request 失敗時は当日の取得試行を記録し、`Retry-After` を含む source error を作り、stale cache があれば fallback として返す
- `ArticleLibraryContext` の `fetchArticleLibraryArticles()` を `Promise.allSettled` 相当の集約に変更し、成功 source の記事を結合する
- 両 source 失敗時は provider 例外を UI にそのまま漏らしすぎず、Zenn の同日再取得を促さない集約 error message を返す

### Data / API / state considerations

- cache payload は `{ cachedAt: number, cacheDate: string, lastAttemptDate: string, articles: Article[] }` のような最小構造にする
- retry suppression は `{ retryAfterUntil: number }` のように Zenn provider 内へ閉じる
- `Article` の schema validation は最小限に留め、配列でない、必須 field が明らかに欠ける場合は cache miss として扱う
- `Retry-After` は `response.headers.get("Retry-After")` から読み、秒数なら現在時刻へ加算する
- `ArticleLibraryStatus` は現状の `"loading" | "success" | "empty" | "error"` を維持し、source 別 warning は後続判断にする
- cache 保存先はリロードや翌日の判定に耐えられる `localStorage` を第一候補にする

### Dependencies

- `docs/tasks/03-zenn-article-list-ingestion.md` の Zenn provider 境界を前提にする
- `docs/tasks/04-qiita-article-list.md` の Qiita provider と共通 `Article` 契約を前提にする
- 現状の `src/sources/zenn/articles.ts`, `src/sources/qiita/articles.ts`, `src/app/articles/ArticleLibraryContext.tsx` が主な変更箇所になる
- `src/screens/articles/ArticleListScreen.tsx` は既存 state 表示を使い、必要がある場合のみ文言を最小調整する

## 6. Risks / Open Questions

- Zenn の rate limit 条件は公開仕様ではないため、日次取得でも retry suppression の扱いは実装後に調整が必要になる可能性がある
- `Retry-After` が返らない失敗では、どの程度再取得を抑制するかを実装時に決める必要がある
- stale cache を何日前まで許容するかは未決定で、MVP では「失敗時 fallback」として広めに許容する
- source 別 warning を UI に出さない場合、ユーザーは Zenn が stale cache かどうかを判別できない
- browser storage が無効な環境では、in-memory dedupe のみになり、リロード後の 429 回避効果は限定される
- 本番環境では client-side cache だけでは利用者全体の rate limit 対策として不十分で、server-side / edge proxy cache が必要になる可能性が高い

## 7. Acceptance Criteria

- アプリ起動直後に同じ Zenn 一覧 request が不要に複数回発火しない
- 当日分の Zenn cache がある場合、外部 request なしで Zenn 記事を表示できる
- 同じローカル日付でアプリを開き直しても、Zenn 一覧 request が再発火しない
- 当日中に Zenn 取得へ失敗した後、同じ日付でアプリを開き直しても Zenn 一覧 request が再発火しない
- Zenn が 429 を返しても、直近 cache があれば Zenn 記事一覧を表示できる
- Zenn が失敗しても Qiita が成功していれば Qiita 記事は表示される
- 両 source が失敗した場合のみ記事一覧を error として扱う
- cache 破損や storage 例外が起きてもアプリがクラッシュしない
- 失敗時の UI / state が provider 固有の raw response に依存しない
- `npm run build` が通る

## 8. Implementation Plan

1. 現状の `fetchZennLatestArticles()` と `ArticleLibraryContext` の呼び出し経路を確認し、日次 cache 判定、stale fallback、retry suppression の最小定数を決める
2. `src/sources/zenn/articles.ts` に cache payload 型、storage helper、`Retry-After` parse helper を追加し、storage 不可や破損 payload を安全に無視できるようにする
3. Zenn 一覧取得に module-level in-flight promise と日次 cache hit を追加し、成功時に正規化済み `Article[]`、取得対象日、最終取得試行日を cache へ保存する
4. Zenn の 429 / fetch 失敗時に最終取得試行日を保存し、stale cache fallback と retry suppression を適用し、cache がない場合は source error として上位へ伝える
5. `ArticleLibraryContext` の source 集約を `Promise.allSettled` ベースへ変更し、成功 source の記事を結合、全失敗時だけ error にする
6. 必要に応じて記事一覧の error message を source 集約向けに最小調整し、provider raw response に依存しない文言にする
7. `npm run build` を実行し、手動で Zenn 429 / cache hit / Qiita のみ成功の挙動を確認する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - dev server を開き、初回表示後の再 render で Zenn 一覧 request が重複しないことを Network tab で確認する
  - 当日分の Zenn cache がある状態でリロードし、外部 request なしで記事が表示されることを確認する
  - 当日中に Zenn 取得へ失敗した状態でリロードし、同じ日付では Zenn へ再 request しないことを確認する
  - Zenn が 429 を返す状態で、stale cache があれば記事一覧が表示されることを確認する
  - Zenn を失敗させ、Qiita が成功している場合に Qiita 記事だけで一覧が表示されることを確認する
  - 両 source を失敗させた場合にのみ error state が出て、同日 retry で Zenn へ再 request しないことを確認する
- Known limitations:
  - このタスクでは server-side / edge proxy cache は実装しない
  - client-side cache はユーザー環境ごとの緩和策であり、Zenn 側 rate limit を根本的に回避するものではない
  - source 別 warning UI は必須範囲外とし、必要なら後続タスクで扱う

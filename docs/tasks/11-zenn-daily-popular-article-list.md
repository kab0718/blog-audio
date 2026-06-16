# Zenn 記事一覧をデイリー人気順で取得する

## 1. Task Summary

- Goal: Zenn の記事一覧取得を最新順からデイリー人気順へ変更し、記事ライブラリの入口でその日に注目されている記事を再生候補として表示できるようにする
- User value: ユーザーがアプリを開いたとき、直近投稿だけでなく「今聴く価値が高そうな技術記事」を 1 記事 = 1 トラックとして選びやすくなる
- Related priorities: smartphone playback UX, natural listening experience, continuous playback / queue behavior, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - `docs/tasks/03-zenn-article-list-ingestion.md`
  - `docs/tasks/09-zenn-rate-limit-resilient-article-library.md`
  - Issue #15 `MVP: Zennの記事一覧をデイリー人気順で取得する` <https://github.com/kab0718/blog-audio/issues/15>
  - 現状実装: `src/sources/zenn/articles.ts`, `src/app/articles/ArticleLibraryContext.tsx`, `vite.config.ts`

## 2. Scope

### In scope

- Zenn 記事一覧の取得条件を latest から daily popular 相当へ変更する
- `fetchZennLatestArticles`, `ZENN_LATEST_ARTICLES_URL`, `zennLatestArticlesRequest` など、latest 前提の関数名・定数名・内部変数名を実態に合わせて見直す
- daily popular response を既存の共通 `Article` 契約へ正規化し続ける
- `ArticleLibraryContext` が Zenn / Qiita を引き続き共通 `Article[]` として扱える状態を維持する
- rate limit 対策の cache key、cache date、last attempt の意味を daily popular 用に合わせ、latest 用 cache と混ざらないようにする
- 実装時に `/api/zenn/articles?order=daily` が利用できること、response shape が既存 mapper で扱えることを確認する
- latest 前提の既存 task doc や実装コメントが今回の挙動と矛盾する場合は、必要最小限で更新する

### Out of scope

- パーソナライズ、推薦アルゴリズム、ユーザー別フィード
- topic / tag フィルタ UI
- Zenn 以外の source の並び順変更
- Qiita provider の取得条件変更
- server-side / edge proxy の新規導入
- 記事本文取得、コードブロック要約、TTS 用台本生成、音声生成 pipeline の変更
- podcast 配信、アカウント機能、保存済み記事の高度な整理

### Assumptions

- MVP では Zenn 全体の daily popular feed を使い、ユーザー別最適化は行わない
- 候補 endpoint は Vite proxy 経由の `/api/zenn/articles?order=daily` とし、実体は `https://zenn.dev/api/articles?order=daily` へ rewrite される
- daily popular の response は `articles` 配列を持ち、現状の `toArticleFromZenn()` で大きな変更なく正規化できる想定とする
- latest 用の localStorage cache は daily popular と意味が違うため、原則として移行せず、新しい cache key を使う
- daily popular の「日次」はユーザーのローカル日付ではなく Zenn 側の人気順ロジックに従うが、client-side cache の日次判定は既存どおりブラウザのローカル日付で扱う
- `/api/zenn/articles?order=daily` が使えない場合は、latest に silently fallback せず、代替取得方法を確認して task doc または issue へ判断を戻す

## 3. UX / Behavior

### Primary flow

- ユーザーが記事一覧を開くと、Zenn の最新記事ではなくデイリー人気記事が既存の記事リスト UI に表示される
- 各 Zenn 記事は従来どおり `Zenn` の source label、タイトル、著者、推定再生時間、任意の summary / tags を表示できる
- ユーザーは表示された Zenn 記事を選択し、既存の player / queue flow へ渡せる
- Qiita 記事との統合表示は維持し、`ArticleLibraryContext` は provider 固有の order 値を意識しない

### Important states / edge cases

- daily popular の取得が成功した場合、daily popular 用 cache として保存し、同じローカル日付では再取得を抑制できる
- daily popular の取得に失敗して stale cache がある場合、rate limit 対策タスクの方針どおり cached Zenn 記事を fallback として使える
- daily popular の取得に失敗し、Qiita が成功している場合、記事一覧は Qiita 記事で表示を継続できる
- daily popular の response shape が latest と異なる場合、provider 内で防御的に扱い、UI や playback state に raw response を漏らさない
- 古い latest cache が localStorage に残っていても、daily popular の記事として表示しない
- daily popular の結果が空の場合、既存の source 集約方針に従い、Qiita の結果があれば成功、全体で空なら empty として扱う

## 4. Requirements

### Functional requirements

- Zenn 記事一覧取得 URL は latest ではなく daily popular 相当を指す
- Zenn provider の public function と内部定数は latest 前提の名前を残さず、daily popular または neutral な意味に揃える
- `ArticleLibraryContext` の import / call site は変更後の provider function を使う
- daily popular response から `Article.id`, `sourceType`, `sourceArticleId`, `title`, `author`, `url`, `estimatedDurationSeconds`, `tags`, `summary` を生成できる
- Zenn 固有の `order=daily` は Zenn provider または proxy 設定の責務に閉じ、画面・playback・queue へ漏れない
- daily popular 用の cache key は latest 用 cache key と分離される
- cache payload の `cacheDate`, `lastAttemptDate`, `retryAfterUntil`, `articles` は daily popular 取得結果として解釈される
- daily popular 取得失敗時の stale fallback、同日 retry 抑制、`Retry-After` handling は既存方針を維持する
- Qiita provider、本文取得、コードブロック処理、音声生成の挙動は変えない

### Non-functional constraints

- 新しい外部依存は追加せず、既存の `fetch`、Vite proxy、localStorage cache で実装する
- daily popular への変更は Zenn provider の責務に閉じ、共通 `Article` 契約を変えない
- rate limit 回避のため、同一日付の再取得抑制と in-flight request dedupe を維持する
- スマホ UI の主要導線や記事カードの密度をこのタスクで増やさない
- Zenn の非公式 endpoint 依存を前提に、response shape の変更や失敗時にアプリがクラッシュしないようにする

## 5. Technical Approach

### Proposed approach

- `src/sources/zenn/articles.ts` の取得 URL を `/api/zenn/articles?order=daily` に変更し、定数名を `ZENN_DAILY_POPULAR_ARTICLES_URL` または同等の名前へ変更する
- exported function は `fetchZennDailyPopularArticles()` のように実態が分かる名前へ変更するか、将来の order 差し替えを見越して `fetchZennArticles()` のような neutral name にする
- module-level request 変数と memory cache 変数も renamed function に合わせ、latest 前提の命名を残さない
- localStorage key は `blog-audio:zenn-daily-popular-articles:v1` のように変更し、旧 latest cache を daily popular として読まない
- `ArticleLibraryContext` の import と `fetchArticleLibraryArticles()` の呼び出しを新しい Zenn provider function へ更新する
- `toArticleFromZenn()` はまず既存を再利用し、daily popular response で不足 field がある場合だけ provider 内で最小補正する
- `docs/tasks/03-zenn-article-list-ingestion.md` や `docs/tasks/09-zenn-rate-limit-resilient-article-library.md` に最新順前提の記述が残る場合、今回の変更と矛盾しないよう短く更新する

### Data / API / state considerations

- `Article` 型は変更しない
- Vite proxy の rewrite は現状の `/api/zenn` から `/api` への変換をそのまま使える見込み
- cache payload shape は現状の `{ cachedAt, cacheDate, lastAttemptDate, retryAfterUntil, articles }` を維持し、key と命名だけ daily popular 用へ寄せる
- old latest cache は削除必須にせず、new key を読むことで自然に無視する
- `cacheDate` は「そのローカル日付に取得した daily popular feed」を表す値として扱う
- Zenn daily popular の順位や更新時刻は Zenn 側仕様に依存するため、アプリ側では並び替えず response order を保持する

### Dependencies

- `docs/tasks/03-zenn-article-list-ingestion.md` の Zenn provider 境界と `Article` 正規化を前提にする
- `docs/tasks/09-zenn-rate-limit-resilient-article-library.md` の日次 cache、stale fallback、source 別部分失敗許容を前提にする
- 現状の主な変更箇所は `src/sources/zenn/articles.ts`, `src/app/articles/ArticleLibraryContext.tsx`
- docs 更新が必要な場合の主な対象は `docs/tasks/03-zenn-article-list-ingestion.md`, `docs/tasks/09-zenn-rate-limit-resilient-article-library.md`

## 6. Risks / Open Questions

- Zenn の `order=daily` は公式安定契約として扱えないため、実装時に endpoint と response shape の確認が必要
- daily popular の更新頻度やタイムゾーンは Zenn 側仕様に依存し、client-side の日次 cache と完全には一致しない可能性がある
- daily popular response が latest response と異なる shape の場合、どこまで補正するかを provider 内で判断する必要がある
- 旧 latest cache を削除しない場合、localStorage に未使用データが残るが、MVP では新 key 分離で十分とする
- 既存 docs の latest 前提をすべて書き換えると過去 task の記録まで変わるため、実装後の現状説明として必要な箇所だけ更新する
- `/api/zenn/articles?order=daily` が利用できない場合の代替 endpoint は未決定

## 7. Acceptance Criteria

- Zenn 記事一覧取得 URL が latest ではなく daily popular 相当になっている
- `fetchZennLatestArticles`, `ZENN_LATEST_ARTICLES_URL`, latest 前提の cache key など、実装上の命名が変更後の挙動と矛盾していない
- `ArticleLibraryContext` が変更後の Zenn provider function を呼び、Zenn / Qiita 記事を従来どおり共通 `Article[]` として集約できる
- daily popular response から既存の `Article` 形式へ正規化できる
- 記事一覧画面で Zenn 記事と Qiita 記事が従来どおり表示される
- daily popular 用 cache が latest 用 cache と混ざらず、同じローカル日付の再取得抑制と stale fallback に使われる
- Zenn daily popular 取得に失敗しても、Qiita 成功時は記事一覧全体を error にしない
- 本文取得、コードブロック処理、音声生成、playback / queue state の契約が変わらない
- `npm run build` が通る

## 8. Implementation Plan

1. `src/sources/zenn/articles.ts`, `ArticleLibraryContext`, Vite proxy の現状を確認し、Zenn provider の public function 名を `fetchZennDailyPopularArticles` か neutral な `fetchZennArticles` のどちらにするか決める
2. `/api/zenn/articles?order=daily` を dev server 経由で確認し、HTTP status、`articles` 配列の有無、既存 `toArticleFromZenn()` で正規化できる代表 field を確認する
3. Zenn provider の URL 定数、fetch function、in-flight request 変数、memory cache 変数を daily popular の意味に rename し、call site の import を更新する
4. localStorage cache key を daily popular 用へ変更し、旧 latest cache を読まないこと、cache payload shape と `Retry-After` handling は維持することを確認する
5. daily popular response の正規化を既存 mapper で通し、不足 field があれば provider 内だけで防御的に補正する
6. latest 前提の docs やエラーメッセージが実装後の挙動と矛盾する箇所を最小限更新する
7. `npm run build` を実行し、dev server のスマホ幅で Zenn / Qiita の記事一覧表示、cache hit、Zenn 失敗時の Qiita fallback を手動確認する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - dev server 経由で `/api/zenn/articles?order=daily` が取得でき、response に `articles` 配列が含まれることを確認する
  - スマホ幅の記事一覧で Zenn daily popular 記事と Qiita 記事が従来どおり表示されることを確認する
  - localStorage に latest 用 cache が残っていても、daily popular 用 key が使われることを確認する
  - 同じローカル日付でリロードしても Zenn daily popular の再取得が抑制されることを確認する
  - Zenn daily popular を失敗させ、stale cache がある場合は cached Zenn 記事、Qiita が成功している場合は Qiita 記事で一覧が継続することを確認する
  - `npm run build` が通ることを確認する
- Known limitations:
  - このタスクでは Zenn の daily popular ロジック自体や更新タイミングは制御しない
  - このタスクでは topic / tag フィルタ、推薦、パーソナライズは扱わない
  - server-side / edge proxy は導入せず、既存の Vite dev proxy と将来の本番 proxy 前提を維持する

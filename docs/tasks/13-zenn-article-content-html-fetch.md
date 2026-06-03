# Zenn 記事本文取得を認証不要の詳細 JSON に切り替える

## 1. Task Summary

- Goal: Zenn 記事本文取得を `/api/articles/{slug}/blob.md` から `/api/articles/{slug}` の詳細 JSON に切り替え、未ログイン環境でも音声トラック生成へ進めるようにする
- User value: Zenn 記事を選んだときに本文取得 401 で再生不能にならず、1記事=1トラックの MVP 体験を実記事で確認できる
- Related priorities: smartphone playback UX、natural listening experience for technical articles、correct handling of code blocks、simple MVP scope
- Source docs: `AGENTS.md`, `docs/blog_audio_player.md`, `docs/tasks/05-article-content-structure-extraction.md`, `docs/tasks/07-tts-narration-script-generation.md`

## 2. Scope

### In scope

- Zenn 本文取得 adapter の URL と response parsing を変更する
- Zenn 詳細 JSON の `article.body_html` を `RawArticleContentInput` の HTML 入力として渡す
- Zenn 詳細 JSON の response shape が変わった場合に、明示的な失敗理由を返す
- 既存の HTML 抽出、コードブロック検出、ナレーション生成 pipeline を再利用する
- 401 の原因と採用 endpoint を task doc に記録する

### Out of scope

- Zenn へのログイン、Cookie 転送、ユーザー認証の実装
- Zenn の Markdown raw body 取得の復旧
- 新しい外部サービスや scraping 専用依存の追加
- Qiita provider の挙動変更
- player UI、queue UI、TTS adapter の刷新

### Assumptions

- 2026-06-04 時点で `https://zenn.dev/api/articles/{slug}/blob.md` は未認証 request に `401` と `{"message":"ログインしてください"}` を返す
- 2026-06-04 時点で `https://zenn.dev/api/articles/{slug}` は未認証 request に `200` を返し、`article.body_html` を含む
- Zenn の article detail endpoint は公式に安定保証された API として扱わず、defensive parsing と失敗時の message を provider 内に閉じる
- `article.body_html` は HTML として既存の `extractArticleContent()` に渡せる

## 3. UX / Behavior

### Primary flow

- ユーザーが Zenn 記事を選んで再生を開始する
- アプリは選択記事の `sourceArticleId` を使って `/api/zenn/articles/{slug}` を取得する
- response の `article.body_html` を HTML 本文として抽出 pipeline に渡す
- 抽出後の prose / heading / code block segments から narration script を生成する
- local preview TTS adapter が audio track を生成し、player が再生可能状態になる

### Important states / edge cases

- Zenn 詳細 JSON が `401` / `429` / `5xx` を返した場合は、音声生成失敗としてユーザーに既存の failed track state を表示する
- `article.body_html` が空、または文字列でない場合は、response shape unsupported として扱う
- HTML 内の code block は通常本文として読まず、既存の code block transformation に流す
- Zenn 一覧取得 cache と本文取得は別責務として扱い、一覧 cache の仕様は変更しない
- Qiita 記事は従来どおり `/api/qiita/items/{id}` の Markdown body を使う

## 4. Requirements

### Functional requirements

- `fetchZennArticleContent(article)` は Zenn 記事に対して `/api/zenn/articles/{sourceArticleId}` を呼ぶ
- Zenn 詳細 JSON から `article.body_html` を取り出し、`format: "html"` の `RawArticleContentInput` を返す
- `body_html` が利用できない場合は、本文なしの track を作らず失敗扱いにする
- fetch 失敗時の error message は HTTP status または unsupported response shape を含み、原因調査できる粒度にする
- 既存の `sourceType`, `sourceArticleId`, `url`, `fetchedAt` 契約を維持する

### Non-functional constraints

- provider 固有の response shape は `src/sources/zenn/articles.ts` に閉じる
- UI、playback state、queue state に Zenn 固有の JSON を漏らさない
- 認証情報や Cookie を扱わない
- 新規 dependency を追加しない
- コードブロックを逐語読みする方向へ退行させない

## 5. Technical Approach

### Proposed approach

- `ZENN_ARTICLE_CONTENT_URL` は既存の `/api/zenn/articles` を維持し、本文取得時の suffix から `/blob.md` を外す
- Zenn detail response 用の最小型または parser helper を provider 内に追加する
- `fetchZennArticleContent()` で JSON を読み、`payload.article.body_html` を non-empty string として検証する
- 成功時は `format: "html"`、`body: bodyHtml` の `RawArticleContentInput` を返す
- 既存の `extractArticleContent()` が HTML を text / heading / code block segments に変換することを前提に、必要なら fixture で代表 HTML を確認する

### Data / API / state considerations

- 一覧取得 endpoint `/api/zenn/articles?order=latest` は今回変更しない
- Vite proxy は `/api/zenn` を `https://zenn.dev/api` に rewrite する既存設定を使う
- Zenn detail response は `{ article: { body_html: string, ... } }` 形を期待する
- `Article.sourceArticleId` は slug として URL path に使うため、既存の `encodeURIComponent()` を維持する
- audio track cache がある場合、失敗 track を保持する既存挙動は変更しない

### Dependencies

- `src/sources/zenn/articles.ts`
- `src/content/articleContentService.ts`
- `src/content/articleContentExtractor.ts`
- `src/narration/articleNarration.ts`
- `src/app/tracks/AudioTrackContext.tsx`

## 6. Risks / Open Questions

- Zenn detail endpoint も非公式 endpoint であり、将来 response shape や access policy が変わる可能性がある
- HTML 由来の code block markup が既存 extractor の想定とずれている場合、コードブロック検出精度を追加調整する必要がある
- Markdown ではなく HTML を入力にするため、見出し、リスト、テーブル、コード周辺の抽出品質を代表記事で確認する必要がある
- Zenn 側 rate limit に当たった場合の本文取得 retry / cache は今回の scope には含めない

## 7. Acceptance Criteria

- Zenn 記事再生時に `/api/zenn/articles/{slug}/blob.md` への request が発生しない
- Zenn 記事再生時に `/api/zenn/articles/{slug}` から `article.body_html` を取得し、audio track generation が開始できる
- `article.body_html` を含む正常 response では `RawArticleContentInput.format` が `"html"` になる
- Zenn detail response が `401` や unsupported shape の場合、track は failed state になり、原因を含む error message を持つ
- Qiita 記事の本文取得と再生生成 flow は変更されない
- 代表的な Zenn 記事で、コードブロックが通常本文として逐語読みされない
- `npm run build` が成功する

## 8. Implementation Plan

1. `src/sources/zenn/articles.ts` の `fetchZennArticleContent()` を確認し、`/blob.md` suffix 依存を取り除く変更点を確定する
2. Zenn article detail payload から `article.body_html` を安全に取り出す helper を追加する
3. `fetchZennArticleContent()` を `/api/zenn/articles/{sourceArticleId}` の JSON fetch に変更し、`format: "html"` の `RawArticleContentInput` を返す
4. HTTP status error、JSON shape error、empty body error の message を provider 内で整理する
5. 既存 extractor / narration flow で HTML 入力が code block segment を維持できるか、代表 HTML または実記事で確認する
6. 必要に応じて extractor 側の HTML code block handling だけを最小修正し、逐語読み退行を防ぐ
7. `npm run build` を実行し、型エラーと build 失敗がないことを確認する
8. `npm run dev` で Zenn 記事を 1 件再生し、Network tab で `/blob.md` が消え、track が ready または再生開始状態になることを手動確認する

## 9. Validation

- Available commands: `npm run build`, `npm run dev`
- Manual checks:
  - Zenn 記事を選んで再生し、Network tab に `/api/zenn/articles/{slug}/blob.md` が出ないことを確認する
  - `/api/zenn/articles/{slug}` が 200 で返り、track generation が failed ではなく ready へ進むことを確認する
  - コードブロックを含む Zenn 記事で、コードが記号・改行込みに逐語読みされないことを確認する
  - Qiita 記事を選んで、従来どおり本文取得と track generation が動くことを確認する
- Known limitations:
  - Zenn endpoint は非公式であり、本番では server-side / edge proxy と rate limit 対策が別途必要になる
  - この task では本文取得 cache は追加しないため、同じ記事の再生成抑制は既存 audio track cache の範囲に留まる

# 記事本文を音声化向けの構造へ抽出する

## 1. Task Summary

- Goal: 記事本文を取得し、見出し・段落・コードブロック・補助テキストを区別できる共通の `ArticleContent` 中間表現へ変換する
- User value: DOM や Markdown をそのまま読ませる不自然さを避け、技術記事を自然な音声トラックへ変換する前段を作れる
- Related priorities: natural listening experience, correct handling of code blocks, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - `docs/tasks/02-domain-model.md`
  - `docs/tasks/03-zenn-article-list-ingestion.md`
  - `docs/tasks/04-qiita-article-list.md`
  - Issue #5 `MVP: 記事本文の構造抽出を実装する` <https://github.com/kab0718/blog-audio/issues/5>

## 2. Scope

### In scope

- `Article` の `sourceType`, `sourceArticleId`, `url` から本文取得へ進む provider 境界を定義する
- Zenn / Qiita の取得結果を provider 固有形式から共通の本文入力へ正規化する
- 見出し、段落、コードブロック、引用、リスト程度の MVP に必要な本文構造をセグメント列へ分解する
- コードブロックを本文ナレーションへ混ぜないため、独立した `codeBlock` セグメントとして保持する
- URL、画像 alt、装飾 Markdown、UI 由来のノイズを読み上げ候補から落とす方針を実装できる形にする
- 抽出失敗時に、記事単位でエラーにするか、最低限のプレーンテキストへフォールバックするかを状態として表せるようにする

### Out of scope

- コードブロックの semantic summary 生成ロジック本体
- TTS 用の最終台本生成、音声生成、ストリーミング再生
- 記事詳細画面や構造抽出結果の UI 表示
- source provider の高度な検索、pagination、認証付き取得
- 永続キャッシュ、オフライン保存、本番 proxy の最終設計

### Assumptions

- 本文取得元は provider ごとに異なっても、抽出後は共通の `ArticleContent` と `ArticleContentSegment[]` へ寄せる
- Qiita は既存一覧 provider が `body` を受け取れるが、一覧 summary と読み上げ用本文は別責務として扱う
- Zenn の本文取得 endpoint は実装時に確認し、response shape の詳細は provider 内へ閉じる
- Markdown / HTML の両方を受けうるため、最初は外部 parser 追加なしで MVP に必要な構造だけを安全に抽出する
- 抽出結果は後続のコード要約・TTS-ready text generation が消費する中間表現であり、`Article` のメタ情報とは分ける

## 3. UX / Behavior

### Primary flow

- ユーザーが記事を再生対象として選ぶと、対象 `Article` の本文取得が開始される
- 取得した本文は、読み上げ処理へ渡す前にセグメント列へ変換される
- 通常の見出しや段落は自然な読み上げ候補として保持される
- コードブロックは本文と別セグメントになり、後続処理で「要約する」「短く説明する」「スキップする」を選べる
- 抽出済みの本文構造は、1 記事 = 1 トラックの音声生成入力として扱える

### Important states / edge cases

- 本文取得中でも、既存の記事一覧・プレーヤー・キュー画面は provider raw response に依存しない
- 本文が空、取得失敗、構造抽出失敗の場合は、クラッシュではなく `failed` または `fallback` 相当の状態で扱う
- コードフェンスが閉じていない Markdown でも、以降の本文をすべてコードとして誤分類しないように保守的に処理する
- 長い URL、画像記法、脚注、HTML tag、装飾記号は、そのまま読み上げ候補へ残さない
- ノイズ除去で本文意味を壊しそうな場合は、削除しすぎずプレーンテキスト fallback を優先する

## 4. Requirements

### Functional requirements

- `Article` から本文取得に必要な provider-specific fetcher を選択できる
- provider 固有の本文 response は、UI や playback state へ漏れない
- 抽出結果は記事 ID と source 情報に紐づく `ArticleContent` として表現できる
- `ArticleContentSegment` は少なくとも `heading`, `paragraph`, `codeBlock`, `quote`, `listItem` を区別できる
- `codeBlock` セグメントには本文テキストとは別に、可能なら `language` と元のコード文字列を保持できる
- 通常本文セグメントは、Markdown 装飾や HTML tag を除去した読み上げ候補テキストを持てる
- コードブロックは通常本文の読み上げ候補へ混入しない
- 抽出に失敗した場合でも、失敗理由と fallback 可否を呼び出し側が判定できる
- 抽出後の本文量から `estimatedDurationSeconds` を更新できる余地を残す

### Non-functional constraints

- article fetching、structure extraction、narration generation、audio generation の責務を混ぜない
- source provider 差分は `src/sources/*` または provider adapter に閉じ、共通 parser へ漏らさない
- MVP に不要な完全 Markdown renderer や sanitizer を作り込まない
- 新しい外部依存は、標準 API と小さな純粋関数で安全に扱えない場合だけ検討する
- コードブロックの内容は保存しても、そのまま TTS 入力として扱わない契約を守る

## 5. Technical Approach

### Proposed approach

- `src/types/articleContent.ts` を追加し、`ArticleContent`, `ArticleContentSegment`, `ArticleContentStatus` 相当の型を定義する
- `src/sources/zenn/` と `src/sources/qiita/` に本文取得関数を追加し、戻り値を provider-neutral な raw content input へ正規化する
- `src/content/` または `src/services/content/` に構造抽出モジュールを置き、provider ではなく Markdown / HTML 風テキストを受け取る純粋関数として実装する
- セグメント化は、まず Markdown の見出し、 fenced code block、段落、引用、リストを対象にし、HTML は tag 除去と段落境界の保全に絞る
- ノイズ除去は通常本文セグメントだけに適用し、コードブロックの raw code は後続の要約処理用に保持する
- `ArticleLibraryContext` とは別に、本文構造取得用の hook / service を置き、一覧取得と本文詳細取得を密結合させない

### Data / API / state considerations

- `ArticleContent` は `articleId`, `sourceType`, `segments`, `plainTextFallback`, `extractedAt` を持てるようにする
- `ArticleContentSegment` は安定した `id`, `kind`, `text`, `order` を持ち、`codeBlock` の場合だけ `rawCode` と `language` を持てる union 型にする
- 本文取得 result は `success`, `fallback`, `failed` を区別し、UI や音声生成側がリトライや失敗表示を判断できるようにする
- Qiita の `body` は Markdown として扱い、Zenn は取得できる形式に応じて Markdown または HTML から共通入力へ変換する
- 既存の `Article.summary` は一覧表示用の短い説明として残し、読み上げ本文とは混同しない
- 将来の code block summarizer は `codeBlock` セグメントを入力にし、通常本文セグメントはそのまま narration candidate として扱う

### Dependencies

- `docs/tasks/02-domain-model.md` の `Article` 契約を前提にする
- `docs/tasks/03-zenn-article-list-ingestion.md` と `docs/tasks/04-qiita-article-list.md` で保持する `sourceArticleId` と `url` を本文取得に利用する
- 後続のコードブロック要約、TTS-ready text generation、音声生成タスクはこの中間表現を入力にする

## 6. Risks / Open Questions

- Zenn の本文取得方法と response shape は実装時に確認が必要で、非公式 endpoint 依存になる可能性がある
- Qiita API の非認証 rate limit により、一覧取得と本文詳細取得を同時に増やすと失敗しやすい
- Markdown / HTML の独自 parser を作り込みすぎると MVP 範囲を超えるため、対応構文を絞る必要がある
- ノイズ除去を強くしすぎると、技術用語、inline code、リンクテキストの意味を壊す可能性がある
- コードブロック内の機密情報や長大なサンプルコードをどこまで保持するかは、保存やキャッシュを導入する時点で再検討が必要

## 7. Acceptance Criteria

- 1 つの `Article` から本文を取得し、`ArticleContentSegment[]` へ変換できる
- 見出し、段落、コードブロックが別セグメントとして区別される
- コードブロックの raw code が通常本文の読み上げ候補へ混入しない
- 通常本文から Markdown 装飾、HTML tag、長い URL、画像記法などの読み上げノイズを除去できる
- provider 固有 response に UI、playback state、narration pipeline が直接依存しない
- 本文取得または抽出失敗時に、失敗状態またはプレーンテキスト fallback を呼び出し側へ返せる
- `npm run build` が通る

## 8. Implementation Plan

1. 既存の `Article` 契約、Zenn / Qiita provider、`ArticleLibraryContext` を確認し、本文一覧取得と本文詳細取得を分ける service 境界を決める
2. `ArticleContent` と `ArticleContentSegment` の union 型を追加し、通常本文と `codeBlock` の契約を分離する
3. Qiita / Zenn それぞれの本文取得 adapter を追加し、provider 固有 response を共通の raw content input へ正規化する
4. Markdown / HTML 風テキストをセグメント化する純粋関数を実装し、見出し、段落、引用、リスト、fenced code block を抽出する
5. 通常本文向けのノイズ除去と、抽出失敗時の `failed` / `fallback` result を追加する
6. 本文構造取得用の hook または service を既存画面から独立して使える形で接続し、後続の narration pipeline が `ArticleContent` を参照できる状態にする
7. fixture または代表的な Zenn / Qiita 本文で、コードブロックが本文に混入しないこと、`npm run build` が通ることを確認する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - Qiita と Zenn の代表記事を 1 件ずつ使い、見出し、段落、コードブロックが別セグメントになることを確認する
  - fenced code block の内容が通常本文セグメントへ入らないことを確認する
  - URL、画像記法、Markdown 装飾、HTML tag が読み上げ候補に不自然に残らないことを確認する
  - 本文取得失敗時に、呼び出し側が失敗状態または fallback を判定できることを確認する
- Known limitations:
  - このタスクではコードブロックの意味要約や TTS 用台本生成は行わない
  - Zenn / Qiita の本文取得 endpoint や CORS / rate limit は実装時に実リクエストで確認が必要
  - Markdown / HTML の全構文対応は目指さず、MVP の読み上げ品質に必要な構造抽出へ絞る

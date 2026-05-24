# TTS 用ナレーション原稿を生成する

## 1. Task Summary

- Goal: 抽出済みの `ArticleContentSegment[]` とコードブロック変換結果から、TTS に渡せる自然なナレーション原稿を生成する
- User value: DOM や Markdown の生テキストではなく、見出し・本文・コード説明が自然につながる文章として記事を聴ける
- Related priorities: natural listening experience, correct handling of code blocks, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - `docs/tasks/05-article-content-structure-extraction.md`
  - `docs/tasks/06-code-block-summary-pipeline.md`
  - `docs/tasks/08-audio-track-generation-cache.md`
  - Issue #7 `MVP: TTS 用ナレーション原稿生成を実装する` <https://github.com/kab0718/blog-audio/issues/7>

## 2. Scope

### In scope

- 抽出済みセグメント列を、TTS 入力用の順序付きナレーション原稿へ変換する
- 見出し、段落、引用、リスト、コード説明文の読み方を統一する
- コードブロック変換結果の `summary` / `explanation` / `skip` を本文の流れへ安全に結合する
- URL、Markdown 装飾、HTML tag、画像記法、UI 由来テキストなどの最終ノイズを除去する
- 長すぎる文や原稿を、後続の音声生成が chunking しやすい単位に分けられる出力形式にする
- 原稿生成に失敗しても raw code や raw DOM text を TTS fallback として返さない

### Out of scope

- 記事本文の取得と構造抽出そのもの
- コードブロックの意味要約アルゴリズム本体
- 実際の音声生成 API 連携、ストリーミング、キャッシュ保存
- プレーヤー UI、記事本文ビューア、読み上げ原稿の編集画面
- 記事全体を短く要約する高度な要約機能

### Assumptions

- 入力は `docs/tasks/05-article-content-structure-extraction.md` の `ArticleContentSegment[]` 相当で、コードブロックは通常本文と分離済み
- コードブロックは `docs/tasks/06-code-block-summary-pipeline.md` の変換結果を使い、元コード本文は原稿へ入れない
- 本文は原則として全文読み上げるが、音声として不自然な装飾や長い URL は削る
- MVP では provider ごとの差分を narration generator に直接持ち込まず、共通セグメント契約へ寄せた後に処理する
- TTS provider の入力サイズ上限は実装時に確認するため、このタスクでは chunking 可能な構造を残すところまでを必須にする

## 3. UX / Behavior

### Primary flow

- ユーザーが記事を再生対象にすると、抽出済み本文セグメントがナレーション生成に渡される
- 見出しは本文との差し込み方が分かる短い読み上げ文へ整形される
- 通常本文は装飾や読み上げノイズを落としつつ、意味を壊さない文章として保持される
- コードブロック位置には、元コードではなく変換済みの短い説明文を挿入するか、必要に応じて何も挿入しない
- 生成された原稿は、後続の audio track generation が 1 記事 = 1 トラックとして扱える入力になる

### Important states / edge cases

- `heading`: レベル差は構造情報として保持してもよいが、TTS 文では過剰に「見出しレベル 2」などと読ませない
- `paragraph`: inline code、リンクテキスト、強調記法を音声向けに整え、記号列を長く読ませない
- `listItem`: 箇条書きの文意が分かるように連結し、黒丸や番号記号だけを読ませない
- `codeBlock` with summary / explanation: 本文の前後と不自然につながらない短文として挿入する
- `codeBlock` with skip: 完全に省くか、「コード例を省略します」程度の短文に留め、長い沈黙や逐語読みを避ける
- 空セグメント、重複テキスト、長い URL、画像 alt の羅列、コピー用 UI テキストは原稿から除外する
- 原稿が空になる場合は、呼び出し側が失敗状態として扱える result を返す

## 4. Requirements

### Functional requirements

- `ArticleContentSegment[]` から TTS 用原稿を生成する関数または service を追加する
- 生成結果は記事単位の本文全体と、後続の chunking に使える `NarrationSegment[]` 相当を持てる
- セグメント種別ごとに narration rule を定義し、見出し / 本文 / 引用 / リスト / コード説明を区別して整形できる
- コードブロック変換結果を本文順序どおりに結合し、元コード本文を原稿に含めない
- URL、Markdown 装飾、HTML tag、画像記法、UI 由来の短いノイズを最終原稿から除去できる
- 長すぎる一文または長すぎる原稿を、TTS provider へ渡す前に分割できる構造を返せる
- 生成不能または空原稿の場合に、失敗理由を呼び出し側へ返せる
- 後続の `AudioTrack` 生成は raw article text ではなく、このタスクの TTS-ready text を入力にできる

### Non-functional constraints

- article fetching、structure extraction、code block transformation、narration generation、audio generation の責務を混ぜない
- 本文の意味を壊す aggressive な削除よりも、読み上げノイズを抑える保守的な正規化を優先する
- MVP では新しい外部サービスや LLM 依存を追加しない
- provider 固有の raw response や UI 表示用 summary に依存しない
- 生成結果に raw code、長い URL、装飾記法、ログ全文が混入しない
- スマホ再生 UX を壊さないよう、生成失敗時もプレーヤーやキューが状態を判定できる contract にする

## 5. Technical Approach

### Proposed approach

- `src/types/narration.ts` などに `NarrationSegment`, `NarrationScript`, `NarrationGenerationResult` の型を定義する
- `src/narration/` または `src/services/narration/` に、セグメント列から原稿を生成する純粋関数群を置く
- セグメント種別ごとの rule を小さな関数に分け、`heading`、通常本文、引用、リスト、コード変換結果の整形を分離する
- 文字列正規化は「セグメント内 cleanup」と「最終結合後 cleanup」を分け、削りすぎによる意味欠落を避ける
- コードブロックは `CodeBlockTransformResult` の `narrationText` だけを使い、元コード本文への参照を generator の public path に置かない
- 出力は記事全体の `text` だけでなく、`segments` と `chunks` へ拡張できる構造にして、後続の TTS provider 制約へ対応しやすくする

### Data / API / state considerations

- `NarrationSegment` は `id`, `articleId`, `sourceSegmentId`, `kind`, `text`, `order`, `origin` を持てるようにする
- `origin` は `prose`, `heading`, `quote`, `list`, `codeSummary`, `codeExplanation`, `codeSkipped` など、debug と検証に必要な粒度に留める
- `NarrationScript` は `articleId`, `text`, `segments`, `estimatedDurationSeconds`, `generatedAt`, `version` を持てる余地を残す
- chunking は `textChunks` または `segments` の連結単位として表現し、TTS provider 固有の上限値は adapter 側で最終調整できるようにする
- `estimatedDurationSeconds` は最初は文字数ベースの暫定値でよく、実音声生成後の `AudioTrack.durationSeconds` と混同しない
- 失敗時は `success` / `failed` の result 型にし、raw input をそのまま返す fallback は禁止する

### Dependencies

- `docs/tasks/05-article-content-structure-extraction.md` の `ArticleContentSegment[]` が入力になる
- `docs/tasks/06-code-block-summary-pipeline.md` のコードブロック変換結果を本文順序へ結合する
- `docs/tasks/08-audio-track-generation-cache.md` は、このタスクで生成した TTS-ready text を音声生成入力として使う
- 現状実装の `src/types/article.ts`, `src/types/audioTrack.ts`, `src/app/playback/PlaybackContext.tsx` とは、実装時に state の接続点を確認する

## 6. Risks / Open Questions

- 05 / 06 の実装順や型名が未確定の場合、このタスクの入力 contract を調整する必要がある
- 長文分割の閾値は TTS provider によって変わるため、MVP では provider 非依存の保守的な chunking に留める必要がある
- inline code をどこまで自然言語化するかは未決定で、削りすぎると技術文脈が落ちる可能性がある
- URL を完全に削除すると参照先の意味が失われる場合があるため、リンクテキストがある場合はそちらを残す判断が必要
- 見出しの読み方が単調すぎると記事構造が分かりにくく、説明しすぎると音声が冗長になる
- skip したコードブロックに省略文を入れるか完全に消すかは、実際の聴感で調整が必要

## 7. Acceptance Criteria

- 1 記事分の `ArticleContentSegment[]` から TTS-ready なナレーション原稿を生成できる
- 見出し、通常本文、引用、リスト、コード説明文が本文順序を保って結合される
- コードブロックの元コード本文が生成原稿に含まれない
- コード説明文が本文の流れを壊さない短い文として挿入されるか、skip 方針に従って除外される
- 長い URL、Markdown 装飾、HTML tag、画像記法、UI ノイズが不自然に残らない
- 生成結果が後続の音声生成に渡せる `text` と、chunking / debug に使える segment 情報を持つ
- 生成不能時に raw input へ fallback せず、呼び出し側が判定できる失敗 result を返す
- `npm run build` が通る

## 8. Implementation Plan

1. 05 / 06 で想定している `ArticleContentSegment` と `CodeBlockTransformResult` の契約を確認し、narration generator の入力型と出力型を決める
2. `NarrationSegment`, `NarrationScript`, `NarrationGenerationResult` の型を追加し、記事単位の TTS-ready text と分割可能な segment 情報を表せるようにする
3. 見出し、段落、引用、リスト、コード変換結果ごとの narration rule を実装し、本文順序どおりに `NarrationSegment[]` を生成する
4. セグメント内 cleanup と最終 cleanup を実装し、URL、Markdown 装飾、HTML tag、画像記法、UI ノイズを除去する
5. 長文分割と空原稿 / 生成失敗の result handling を追加し、raw code や raw DOM text へ fallback しないことを保証する
6. fixture または代表的な記事セグメントで、本文、見出し、リスト、コード要約、skip が自然に結合されることを確認できるようにする
7. 後続の audio track generation が `NarrationScript.text` または chunk 情報を入力にできる接続点を用意し、`npm run build` を実行する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - サンプルの Zenn / Qiita 由来セグメントから生成した原稿を読み、見出しと本文の切れ目が不自然でないことを確認する
  - コードブロック位置に元コード本文が入らず、短い説明または skip として扱われることを確認する
  - URL、Markdown 装飾、HTML tag、画像記法、コピー用 UI テキストが原稿に不自然に残らないことを確認する
  - 長い本文で chunking 可能な segment / chunk 情報が失われないことを確認する
  - 空入力や変換不能入力で raw text fallback にならず、失敗 result を返せることを確認する
- Known limitations:
  - このタスクでは実 TTS API 呼び出しや音声ファイル生成は行わない
  - TTS provider の具体的な入力文字数上限は実装時に確認し、adapter 側で最終調整する
  - 原稿の聴感品質は、後続で実音声にしたときに調整が必要になる可能性がある

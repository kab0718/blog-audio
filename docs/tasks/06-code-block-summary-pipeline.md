# コードブロック要約パイプラインを実装する

## 1. Task Summary

- Goal: 記事本文中のコードブロックを逐語読みせず、要約・短い説明・スキップのいずれかへ安全に変換するパイプラインを作る
- User value: 技術記事を聴いている途中で、記号・インデント・長いコードの棒読みが入り込まず、自然なリスニング体験を保てる
- Related priorities: natural listening experience, correct handling of code blocks, simple MVP scope
- Source docs:
  - `AGENTS.md`
  - `docs/blog_audio_player.md`
  - `docs/tasks/02-domain-model.md`
  - Issue #6 `MVP: コードブロック要約パイプラインを実装する` <https://github.com/kab0718/blog-audio/issues/6>

## 2. Scope

### In scope

- 記事本文を「通常本文」と「コードブロック」に分けて扱うための最小中間表現を定義する
- コードブロックごとに `summary` / `explanation` / `skip` のいずれかの変換結果を生成する
- 元コード本文が TTS 向けテキストへ直接混入しないよう、コード専用の変換レイヤーを作る
- 要約できない場合の短い説明文と、説明も不適切な場合の skip fallback を定義する
- 変換方式、理由、元コードの扱いを後続処理から確認できる debug metadata を持たせる
- mock / fixture で短いコード、長いコード、設定断片、ログ風テキストの変換結果を確認できるようにする

### Out of scope

- Zenn / Qiita からの記事本文詳細取得
- Markdown / HTML parser の最終仕様確定
- 本文ナレーション全体の最終結合ロジック
- 音声生成 API 連携、ストリーミング、キャッシュ保存
- UI 表示用のコードハイライトや記事本文ビューア
- LLM など外部サービスによる高精度な意味要約

### Assumptions

- 入力段階では、parser か fixture がコードブロックを `code` segment として識別できる前提にする
- MVP では外部要約サービスを使わず、言語名・コード長・周辺情報・簡易ヒューリスティックから説明文を作る
- コードを全文読まない方針は固定し、短いコードでも逐語読みしない
- 要約品質に確信が持てない場合は、短い説明または skip へ倒す
- skip の場合でも、必要なら「コード例を省略します」のような短いナレーション文を返せる

## 3. UX / Behavior

### Primary flow

- 通常本文は読み上げ候補としてそのまま保持される
- コードブロックに到達したら、元コード本文の代わりに短い要約または説明文へ置き換える
- 説明文も有用でないと判断した場合は、コードブロックを読み上げ対象から外す
- 後続の TTS script generation は、変換済みの narration segment だけを受け取り、元コード本文を参照しない

### Important states / edge cases

- 1 行のコードでも、記号や識別子をそのまま読み上げない
- 長いコードブロック、設定ファイル、スタックトレース、ログ風テキストは、意味説明か skip に寄せる
- 言語名が分かる場合は「TypeScript の例」「設定ファイルの例」のように説明へ反映できる
- 言語名が不明でも、無理に推測せず「コード例」として短く扱う
- 変換処理で例外が起きた場合は、元コードを返さず skip 結果を返す

## 4. Requirements

### Functional requirements

- コードブロック変換結果として `summary`, `explanation`, `skip` を区別できる型を定義する
- 各変換結果は、TTS に渡す `narrationText` と、変換方式を示す metadata を持つ
- `summary` と `explanation` の `narrationText` は短文にし、元コード本文を含めない
- `skip` は TTS に渡す文言を空にするか、短い省略文だけにする
- 処理失敗時は例外を外へ漏らさず、安全な `skip` 結果へ fallback する
- 後続処理が通常本文 segment とコード由来 segment を区別できる
- fixture で複数パターンのコードブロック変換を確認できる

### Non-functional constraints

- 本文処理とコードブロック処理の責務を分離する
- MVP では新しい外部サービスや依存を追加しない
- コード本文、長い URL、装飾記法、ログ全文が narration text に混入しない
- 変換ロジックは provider 固有の raw response に依存しない
- 将来の LLM 要約や parser 改善を差し込めるよう、入力 segment と変換結果の契約を安定させる

## 5. Technical Approach

### Proposed approach

- `src/types/articleContent.ts` などに、通常本文とコードを分ける `ArticleContentSegment` の最小型を追加する
- `src/types/narration.ts` などに、TTS 前段で使う `NarrationSegment` と `CodeBlockTransformResult` を定義する
- `src/narration/codeBlocks/` または同等の責務境界に、コードブロック専用の transformer を実装する
- transformer は、入力の `language`, `content`, `lineCount`, `surroundingHeading` などから説明文を組み立てる
- 分岐は MVP では deterministic rule に留め、確信度が低い場合は `explanation` または `skip` へ倒す
- 本文全体の TTS script generation は後続タスクに残し、このタスクでは変換済み segment 配列を返せるところまでを接続点にする

### Data / API / state considerations

- `Article` 本体にはコード変換結果を直接混ぜず、本文抽出後の `ArticleContent` または narration pipeline 側の中間表現として扱う
- `CodeBlockTransformResult` は `kind`, `narrationText`, `reason`, `sourceLanguage`, `originalLineCount` を持つ
- `narrationText` は TTS 入力専用で、debug 用 metadata にも元コード全文は原則保持しない
- fixture では元コードを持っていても、変換結果の public contract からは元コードを取り除く
- 将来 LLM 要約を入れる場合も、同じ `CodeBlockTransformResult` を返す adapter として差し替える

### Dependencies

- `docs/tasks/02-domain-model.md` の `Article` / `AudioTrack` 責務分離を前提にする
- Zenn / Qiita の記事一覧 provider は本文詳細をまだ持たないため、実記事接続には別途本文抽出タスクが必要になる
- 後続の TTS script generation / audio generation は、このタスクの `NarrationSegment` を入力として受け取る前提にする

## 6. Risks / Open Questions

- 本文詳細抽出タスクの中間表現が未確定のため、実装時に `ArticleContentSegment` の入力 contract を調整する可能性がある
- deterministic rule だけでは「意味要約」の品質は限定的で、MVP では短い説明文が中心になりやすい
- 元コード全文を debug metadata に保持するかは、プライバシーと開発効率のトレードオフがある
- stack trace や log をコード扱いする基準は parser 側と transformer 側のどちらに置くか決める必要がある
- skip 時に完全無音へするか、「コード例を省略します」と読むかは、実際の聴感で調整が必要

## 7. Acceptance Criteria

- コードブロック変換結果の型が定義され、`summary` / `explanation` / `skip` を区別できる
- どのコードブロックも元コード本文を narration text として返さない
- 要約不能または処理失敗時に、安全な説明または skip へ fallback する
- 通常本文とコードブロックの処理経路が分離されている
- 後続の TTS script generation が、変換済み narration segment を受け取れる
- 短いコード、長いコード、設定断片、ログ風テキストの fixture で変換結果を確認できる
- `npm run build` が通る

## 8. Implementation Plan

1. 既存の `Article` / `AudioTrack` 型と provider 実装を確認し、本文抽出後に使う `ArticleContentSegment` と TTS 前段の `NarrationSegment` の責務境界を決める
2. `CodeBlockTransformResult` の union 型を追加し、`summary` / `explanation` / `skip` の `narrationText` と metadata contract を定義する
3. コードブロック transformer を追加し、言語名、行数、文字数、設定・ログらしさに応じて説明文または skip を返す deterministic rule を実装する
4. 例外発生時や判定不能時に元コードを返さない fallback を実装し、変換理由を metadata に残す
5. 通常本文 segment とコード segment を受け取り、コードだけ transformer に通す最小の narration segment 変換関数を追加する
6. fixture または小さなサンプルデータで、短いコード、長いコード、設定断片、ログ風テキストが逐語読み文にならないことを確認できるようにする
7. `npm run build` を実行し、型定義と変換関数の接続が壊れていないことを確認する

## 9. Validation

- Available commands:
  - `npm install`
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
- Manual checks:
  - fixture の各コードブロック変換結果に、元コード本文や長い記号列が含まれないことを確認する
  - summary / explanation / skip の各分岐が少なくとも 1 つずつ確認できることを確認する
  - transformer で例外を起こしても skip fallback になり、TTS に元コードが流れないことを確認する
- Known limitations:
  - このタスクでは記事本文の実取得や TTS API 連携は行わない
  - 外部要約サービスを使わないため、MVP 初期は意味要約より短い説明文が中心になる
  - 実記事からの code segment 抽出精度は、後続の本文抽出 / cleanup タスクに依存する

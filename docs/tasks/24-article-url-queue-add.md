# ブログ URL から記事をキューに追加する

## Task Summary

- Goal: 記事一覧にない Zenn / Qiita 記事でも、URL 入力から 1 記事 = 1 トラックとしてキューへ追加できるようにする
- User value: ユーザーが聴きたい技術記事を、一覧掲載有無に関係なく連続再生キューへ積める
- Source issue: [#24 MVP: ブログURLから記事をキューに追加できるようにする](https://github.com/kab0718/blog-audio/issues/24)

## Scope

### In scope

- Zenn 記事 URL `https://zenn.dev/{user}/articles/{slug}` の解決
- Qiita 記事 URL `https://qiita.com/{user}/items/{id}` の解決
- `/api/article-from-url?url=...` で共通 `Article` へ正規化する API 境界
- 記事一覧画面の URL 入力フォーム
- URL から追加した記事のライブラリ取り込みとキュー追加
- 同じ URL / 同じ provider article id のライブラリ重複防止
- 既にキューにある記事の二重追加防止
- 非対応 URL / 不正 URL / provider error の短い状態表示

### Out of scope

- 任意サイトの記事抽出
- アカウントや保存リスト
- URL 入力記事専用の永続保存
- provider 追加や高度な URL 正規化

## Implemented Behavior

- 記事一覧画面に「ブログURLから追加」フォームを表示する。
- URL 送信時に client は `/api/article-from-url` を呼び、返却された `Article` を `ArticleLibraryContext` へ追加する。
- 追加された記事は既存の `addArticleToQueue` に渡され、本文取得、コードブロック要約、TTS 生成の既存フローに乗る。
- 同じ記事がライブラリに存在する場合は既存 `Article` を使う。
- 同じ記事がキューに存在する場合は queue reducer の重複防止により二重追加しない。
- 一覧取得後に URL 追加記事が消えないよう、手入力記事をライブラリ取得結果へマージする。

## Acceptance Criteria

- Zenn 記事 URL を入力すると記事がキューに追加される。
- Qiita 記事 URL を入力すると記事がキューに追加される。
- 追加された記事は既存の本文抽出、コードブロック要約、TTS 生成フローに乗る。
- 同じ URL を複数回入力してもライブラリとキューが不自然に重複しない。
- 非対応 URL や不正 URL ではキューに追加せずエラー状態を表示する。
- モバイル幅でフォーム、エラー、追加済み状態が崩れない。
- `npm run build` が成功する。

## Validation

- `npm run build`
- Manual checks:
  - Zenn URL 入力
  - Qiita URL 入力
  - 同じ URL の再入力
  - 非対応 URL / 不正 URL の入力
  - モバイル幅でフォームと状態文言を確認
